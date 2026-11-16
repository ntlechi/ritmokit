-- Assertions for 0009_lock_security_definer_execute.sql
-- Run as a superuser / table owner after applying supabase/migrations.

\set ON_ERROR_STOP on

CREATE TEMP TABLE definer_lock_expect (
  fn_identity text PRIMARY KEY,
  search_path_expected text NOT NULL,
  extra_grantee text
);

INSERT INTO definer_lock_expect (fn_identity, search_path_expected, extra_grantee) VALUES
  ('public.trigger_agent_webhook()', '', NULL),
  ('public.set_default_app_metadata()', '', 'supabase_auth_admin'),
  ('public.handle_new_user()', '', 'supabase_auth_admin'),
  ('public.sync_user_role_to_auth_metadata()', '', NULL),
  ('public.handle_member_station_change()', '', NULL),
  ('public.notify_session_season_published()', 'public', NULL),
  ('public.notify_enrollment_parity()', 'public', NULL);

DO $$
DECLARE
  rec record;
  fn_oid oid;
  cfg text;
  role_name text;
BEGIN
  FOR rec IN SELECT * FROM definer_lock_expect LOOP
    fn_oid := to_regprocedure(rec.fn_identity);
    IF fn_oid IS NULL THEN
      RAISE NOTICE 'VERIFY skip missing %', rec.fn_identity;
      CONTINUE;
    END IF;

    SELECT option_value INTO cfg
    FROM pg_options_to_table((SELECT p.proconfig FROM pg_proc p WHERE p.oid = fn_oid))
    WHERE option_name = 'search_path';

    -- Postgres stores SET search_path = '' as the quoted token "".
    IF rec.search_path_expected = '' THEN
      IF coalesce(cfg, '<unset>') NOT IN ('', '""') THEN
        RAISE EXCEPTION '% search_path=% expected empty', rec.fn_identity, coalesce(cfg, '<unset>');
      END IF;
    ELSIF coalesce(cfg, '<unset>') IS DISTINCT FROM rec.search_path_expected THEN
      RAISE EXCEPTION '% search_path=% expected=%', rec.fn_identity, coalesce(cfg, '<unset>'), rec.search_path_expected;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(
        (SELECT p.proacl FROM pg_proc p WHERE p.oid = fn_oid),
        acldefault('f', (SELECT p.proowner FROM pg_proc p WHERE p.oid = fn_oid))
      )) AS acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION '% still grants EXECUTE to PUBLIC', rec.fn_identity;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
         AND has_function_privilege(role_name, fn_oid, 'execute') THEN
        RAISE EXCEPTION '% is still EXECUTE for %', rec.fn_identity, role_name;
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
       AND NOT has_function_privilege('service_role', fn_oid, 'execute') THEN
      RAISE EXCEPTION '% missing EXECUTE for service_role', rec.fn_identity;
    END IF;

    IF rec.extra_grantee IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rec.extra_grantee)
       AND NOT has_function_privilege(rec.extra_grantee, fn_oid, 'execute') THEN
      RAISE EXCEPTION '% missing EXECUTE for %', rec.fn_identity, rec.extra_grantee;
    END IF;
  END LOOP;
END;
$$;

-- Direct RPC as anon must fail (permission denied), not a trigger-context error.
DO $$
DECLARE
  err text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'VERIFY skip SET ROLE anon (role missing)';
    RETURN;
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE NOTICE 'VERIFY skip handle_new_user RPC check (function missing)';
    RETURN;
  END IF;

  BEGIN
    EXECUTE 'SET ROLE anon';
    BEGIN
      PERFORM public.handle_new_user();
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'anon was able to EXECUTE public.handle_new_user()';
    EXCEPTION
      WHEN insufficient_privilege THEN
        err := SQLERRM;
      WHEN OTHERS THEN
        EXECUTE 'RESET ROLE';
        RAISE EXCEPTION 'anon EXECUTE handle_new_user failed with %, expected insufficient_privilege', SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'VERIFY anon RPC denied: %', err;
  END;
END;
$$;
