-- Mirok — Phase 3 : Synchronisation Supabase Auth <-> public.users
--
-- Trois triggers, tous nécessaires pour que l'auth réelle (auth.users, géré
-- par GoTrue) et le modèle applicatif (public.users, géré par Prisma)
-- restent parfaitement alignés, y compris pour le rôle utilisé par le
-- role-gating "rapide" du middleware (proxy.ts) :
--
--   1. set_default_app_metadata()  — BEFORE INSERT ON auth.users
--        Initialise raw_app_meta_data.role = 'EMPLOYEE' dès la création du
--        compte, pour que le tout premier JWT porte déjà un rôle exploitable
--        par l'edge (sans quoi le middleware ne verrait de rôle qu'après la
--        première promotion, via le trigger #3).
--   2. handle_new_user()           — AFTER INSERT ON auth.users
--        Crée la ligne public.users correspondante.
--   3. sync_user_role_to_auth_metadata() — AFTER UPDATE OF role ON public.users
--        Reflète toute promotion (EMPLOYEE -> MANAGER/OWNER/ADMIN, décidée
--        par un manager/admin déjà authentifié dans l'app) vers
--        auth.users.raw_app_meta_data, pour que le prochain appel à
--        `supabase.auth.getUser()` (qui revalide toujours contre le serveur
--        Auth, contrairement à getSession()) renvoie le rôle à jour.
--
-- Application : npx prisma db execute --file supabase/migrations/0004_auth_profile_sync.sql
--
-- ⚠️ Écart volontaire par rapport à un design naïf : on n'insère JAMAIS le
-- rôle depuis `raw_user_meta_data` (les métadonnées passées par le CLIENT à
-- l'inscription, ex. `supabase.auth.signUp({ data: { role: 'ADMIN' } })`).
-- Faire confiance à ce champ permettrait à n'importe quel visiteur de
-- s'auto-promouvoir Owner/Admin. Le rôle par défaut est TOUJOURS 'EMPLOYEE'
-- à l'inscription ; toute élévation passe exclusivement par une action
-- authentifiée d'un manager/admin qui met à jour public.users.role (Team /
-- Admin settings), ce qui déclenche alors le trigger #3.

-- ---------------------------------------------------------------------------
-- 1. Rôle par défaut dans le JWT dès la création du compte
-- ---------------------------------------------------------------------------

create or replace function public.set_default_app_metadata() returns trigger
language plpgsql
security definer
as $$
begin
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', coalesce(new.raw_app_meta_data->>'role', 'EMPLOYEE'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_before_insert on auth.users;
create trigger on_auth_user_before_insert
  before insert on auth.users
  for each row execute function public.set_default_app_metadata();

-- ---------------------------------------------------------------------------
-- 2. Création de la ligne public.users correspondante
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
as $$
begin
  -- L'app exige un e-mail unique (voir schema.prisma) : une inscription
  -- téléphone-seul n'a pas encore de place dans public.users, on l'ignore
  -- plutôt que de faire échouer l'inscription Supabase Auth elle-même.
  if new.email is null then
    return new;
  end if;

  insert into public.users (id, email, full_name, role, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Nouvel utilisateur'),
    'EMPLOYEE', -- jamais depuis raw_user_meta_data — voir note de sécurité en tête de fichier
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Propagation d'une promotion de rôle vers le JWT (source de vérité =
--    public.users.role ; ceci n'est qu'un cache pour l'edge middleware)
-- ---------------------------------------------------------------------------

create or replace function public.sync_user_role_to_auth_metadata() returns trigger
language plpgsql
security definer
as $$
begin
  if new.role is distinct from old.role then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('role', new.role::text)
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_user_role_changed on public.users;
create trigger on_user_role_changed
  after update of role on public.users
  for each row execute function public.sync_user_role_to_auth_metadata();

-- Diagnostic : `select id, email, raw_app_meta_data from auth.users order by
-- created_at desc limit 5;` confirme que le rôle est bien répercuté après
-- une promotion (`update public.users set role = 'MANAGER' where id = …`).
