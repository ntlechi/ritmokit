#!/usr/bin/env bash
# Throwaway local Postgres proof for 0009_lock_security_definer_execute.
# Does not touch remote Supabase projects or any .env file.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_VERSION="${PG_VERSION:-16}"
PGDATA="${PGDATA:-/tmp/ritmokit-pg-lockdown}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ritmokit_lockdown}"
PGPASSWORD="${PGPASSWORD:-ritmo_lockdown_local}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT PGUSER PGDATABASE PGPASSWORD
export PATH="/usr/lib/postgresql/${PG_VERSION}/bin:/usr/bin:$PATH"

log() { printf '\n==> %s\n' "$*"; }

cleanup() {
  if [[ -f "${PGDATA}/postmaster.pid" ]]; then
    pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "Starting throwaway Postgres ${PG_VERSION} on port ${PGPORT}"
rm -rf "$PGDATA"
mkdir -p "$PGDATA"
initdb -D "$PGDATA" --auth=scram-sha-256 --username="$PGUSER" --pwfile=<(printf '%s\n' "$PGPASSWORD") >/tmp/ritmokit-initdb.log
pg_ctl -D "$PGDATA" -o "-p ${PGPORT} -k /tmp" -w start >/tmp/ritmokit-pg-start.log
createdb "$PGDATABASE"

log "Creating Supabase-like roles + auth stubs"
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE supabase_admin NOLOGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT current_setting('role', true) $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;
SQL

log "Applying Prisma migrations from scratch"
(
  cd "$ROOT"
  DIRECT_DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@127.0.0.1:${PGPORT}/${PGDATABASE}" \
    npx prisma migrate deploy
)

log "Applying supabase/migrations (skip 0002 if pg_net is unavailable)"
shopt -s nullglob
for f in "$ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f")"
  if [[ "$base" == 0002_* ]]; then
    if ! psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_net;" >/tmp/ritmokit-pgnet.log 2>&1; then
      log "pg_net missing — installing 0002 function without the extension"
      psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT NULL,
  params jsonb DEFAULT NULL,
  headers jsonb DEFAULT NULL,
  timeout_milliseconds integer DEFAULT 2000
) RETURNS bigint
LANGUAGE sql AS $$ SELECT 0::bigint $$;
SQL
      grep -v -i 'create extension if not exists pg_net' "$f" | psql -v ON_ERROR_STOP=1
      continue
    fi
  fi
  # 0007's gist exclusion needs IMMUTABLE tstzrange; Prisma stores
  # shifts.starts_at as timestamp without time zone, so skip on this
  # throwaway cluster. 0009 does not depend on it.
  if [[ "$base" == 0007_* ]]; then
    if ! psql -v ON_ERROR_STOP=1 -f "$f"; then
      log "skipping $base (tstzrange not immutable on timestamp columns)"
    fi
    continue
  fi
  # 0005 attaches a trigger on location_members.station; Prisma already
  # renamed that column to station_id. 0006 recreates the function+trigger.
  if [[ "$base" == 0005_* ]]; then
    has_station="$(psql -tAc "SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'location_members' AND column_name = 'station'
    )")"
    if [[ "$has_station" != t ]]; then
      log "skipping $base (station column already renamed; 0006 applies)"
      continue
    fi
  fi
  log "psql $base"
  psql -v ON_ERROR_STOP=1 -f "$f"
done

log "Running grant assertions"
psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/verify-security-definer-grants.sql"

log "Proving authenticated Prisma-style writes still fire the triggers"
psql -v ON_ERROR_STOP=1 <<'SQL'
-- Signup path: GoTrue insert into auth.users (fires 0004 definers).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'owner.lockdown@example.test',
  jsonb_build_object('full_name', 'Lockdown Owner')
);

DO $$
DECLARE
  meta jsonb;
  app_role text;
BEGIN
  SELECT raw_app_meta_data INTO meta FROM auth.users
   WHERE id = '11111111-1111-4111-8111-111111111111';
  IF coalesce(meta->>'role', '') <> 'EMPLOYEE' THEN
    RAISE EXCEPTION 'set_default_app_metadata did not pin EMPLOYEE, got %', meta;
  END IF;
  SELECT role::text INTO app_role FROM public.users
   WHERE id = '11111111-1111-4111-8111-111111111111';
  IF app_role IS DISTINCT FROM 'EMPLOYEE' THEN
    RAISE EXCEPTION 'handle_new_user did not insert public.users, role=%', app_role;
  END IF;
END;
$$;

-- Staff promotion path: Prisma UPDATE public.users.role (fires sync trigger).
UPDATE public.users
   SET role = 'MANAGER', updated_at = now()
 WHERE id = '11111111-1111-4111-8111-111111111111';

DO $$
DECLARE
  jwt_role text;
BEGIN
  SELECT raw_app_meta_data->>'role' INTO jwt_role FROM auth.users
   WHERE id = '11111111-1111-4111-8111-111111111111';
  IF jwt_role IS DISTINCT FROM 'MANAGER' THEN
    RAISE EXCEPTION 'sync_user_role_to_auth_metadata did not update JWT cache, got %', jwt_role;
  END IF;
END;
$$;

-- Season publish → agent bus (notify_session_season_published).
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'Lockdown Studio',
  'lockdown-studio',
  now(),
  now()
);

INSERT INTO public.locations (id, organization_id, name, slug, timezone, created_at, updated_at)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'Montreal',
  'montreal',
  'America/Toronto',
  now(),
  now()
);

INSERT INTO public.session_seasons (
  id, location_id, name, status, booking_open, starts_on, ends_on, created_at, updated_at
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'Fall lockdown',
  'DRAFT',
  false,
  CURRENT_DATE,
  CURRENT_DATE + 90,
  now(),
  now()
);

UPDATE public.session_seasons
   SET status = 'ACTIVE', updated_at = now()
 WHERE id = '44444444-4444-4444-8444-444444444444';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_logs
     WHERE event_type = 'session.season_published'
       AND payload->>'seasonId' = '44444444-4444-4444-8444-444444444444'
  ) THEN
    RAISE EXCEPTION 'notify_session_season_published did not enqueue agent task';
  END IF;
END;
$$;

-- Team station change (handle_member_station_change) — Prisma path.
INSERT INTO public.location_members (location_id, user_id, station_id, updated_at)
SELECT loc.id, '11111111-1111-4111-8111-111111111111', st.id, now()
  FROM public.locations loc
  JOIN public.stations st ON st.location_id = loc.id
 ORDER BY loc.created_at, st.sort_order
 LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.location_members
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'handle_member_station_change insert path failed';
  END IF;
END;
$$;
SQL

log "All local proofs passed"
echo "DATABASE dropped with the cluster at ${PGDATA} (trap will stop it)."
