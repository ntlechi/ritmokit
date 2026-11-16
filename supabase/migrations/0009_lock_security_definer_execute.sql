-- Lock SECURITY DEFINER functions in the exposed `public` schema.
--
-- Supabase advisors 0028 (anon) / 0029 (authenticated) WARN when the public
-- Data API can EXECUTE a SECURITY DEFINER function: it runs as the owner
-- (postgres) and bypasses RLS. Postgres also grants EXECUTE to PUBLIC by
-- default, so every new function is callable at POST /rest/v1/rpc/<name>
-- until we revoke.
--
-- Investigation (repo + call sites, 2026-11-16):
--   None of these functions are invoked via supabase.rpc(), Edge Functions,
--   or RLS expressions. They are AFTER/BEFORE triggers, fired by Prisma
--   (role `postgres`) or GoTrue (`supabase_auth_admin` on auth.users).
--   Anonymous users must not call them. Signed-in users must not call them
--   either — staff writes go through Next.js server actions + Prisma, not RPC.
--
-- This migration:
--   1. Pins `search_path` on SECURITY DEFINER functions that lacked it.
--   2. Revokes EXECUTE from PUBLIC / anon / authenticated.
--   3. Grants EXECUTE only to postgres, service_role, and (for auth.users
--      triggers) supabase_auth_admin.
--   4. Stops future functions created by postgres / supabase_admin from
--      inheriting PUBLIC/anon/authenticated EXECUTE.

-- ---------------------------------------------------------------------------
-- Helpers: apply grants only when the function and role exist (0002 is
-- documented as optional; vanilla local Postgres may lack Supabase roles).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp._ritmo_lock_definer(fn_identity text, extra_grantees text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text;
BEGIN
  IF to_regprocedure(fn_identity) IS NULL THEN
    RAISE NOTICE 'skip missing function %', fn_identity;
    RETURN;
  END IF;

  -- Empty search_path forces schema-qualified names (bodies already do that).
  EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', fn_identity);

  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn_identity);

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', fn_identity, role_name);
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY extra_grantees LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn_identity, role_name);
    END IF;
  END LOOP;
END;
$$;

-- Trigger on agent_logs INSERT (0002, optional pg_net webhook).
-- Callers: trg_agent_logs_webhook only. Body uses net.http_post (qualified).
SELECT pg_temp._ritmo_lock_definer(
  'public.trigger_agent_webhook()',
  ARRAY['postgres', 'service_role']
);

-- BEFORE INSERT ON auth.users (0004). Callers: GoTrue signup only.
SELECT pg_temp._ritmo_lock_definer(
  'public.set_default_app_metadata()',
  ARRAY['postgres', 'service_role', 'supabase_auth_admin']
);

-- AFTER INSERT ON auth.users (0004). Callers: GoTrue signup only.
-- Inserts public.users as EMPLOYEE; never reads client-supplied role.
SELECT pg_temp._ritmo_lock_definer(
  'public.handle_new_user()',
  ARRAY['postgres', 'service_role', 'supabase_auth_admin']
);

-- AFTER UPDATE OF role ON public.users (0004). Callers: Prisma team/admin
-- promotions. Syncs app_metadata so the JWT role cache matches public.users.
SELECT pg_temp._ritmo_lock_definer(
  'public.sync_user_role_to_auth_metadata()',
  ARRAY['postgres', 'service_role']
);

-- AFTER INSERT OR UPDATE OF station_id ON location_members (0005/0006).
-- Callers: Prisma team station changes. Rewrites chat_channel_members.
SELECT pg_temp._ritmo_lock_definer(
  'public.handle_member_station_change()',
  ARRAY['postgres', 'service_role']
);

-- notify_* already pin search_path = public (fixed schema, required so
-- unqualified enqueue_agent_task() resolves). Keep that; still revoke RPC.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.notify_session_season_published()',
    'public.notify_enrollment_parity()'
  ] LOOP
    IF to_regprocedure(fn) IS NULL THEN
      RAISE NOTICE 'skip missing function %', fn;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION pg_temp._ritmo_lock_definer(text, text[]);

-- Future functions created by the roles that write migrations must not
-- inherit EXECUTE for the Data API. Keep service_role's default grant if
-- the platform installed one; we only revoke PUBLIC / anon / authenticated.
DO $$
DECLARE
  creator text;
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

  FOREACH creator IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = creator) THEN
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
        creator
      );
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon',
          creator
        );
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated',
          creator
        );
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'cannot alter default privileges for role %', creator;
    END;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
  END IF;
END;
$$;
