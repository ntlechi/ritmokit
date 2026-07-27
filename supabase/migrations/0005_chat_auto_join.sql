-- Mirok — Auto-inscription aux canaux de station (Phase Team / Chat)
--
-- Dès qu'un `location_members.station` change (ou qu'un membre est ajouté),
-- Postgres maintient `chat_channel_members` en phase — zéro boucle TypeScript
-- dans `updateTeamMemberStation`. L'UI messagerie (Supabase Realtime) reflète
-- le changement au prochain chargement / refresh de la sidebar.
--
-- Règles métier :
--   • INSERT ou UPDATE OF station → rejoindre le canal STATION correspondant
--     (`chat_channels.station` = nouvelle station, même `location_id`).
--   • UPDATE avec changement de station → quitter l'ancien canal STATION
--     uniquement pour les EMPLOYEE (les gérants/propriétaires gardent leurs
--     accès multi-stations issus du seed ou d'ajouts manuels).
--
-- Application :
--   npx prisma db execute --file supabase/migrations/0005_chat_auto_join.sql

-- ---------------------------------------------------------------------------
-- Fonction : synchronisation chat_channel_members <-> location_members.station
-- ---------------------------------------------------------------------------

create or replace function public.handle_member_station_change() returns trigger
language plpgsql
security definer
as $$
declare
  target_channel_id uuid;
  old_channel_id uuid;
  v_user_role text;
begin
  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  -- UPDATE sans changement de station : rien à faire.
  if TG_OP = 'UPDATE' and OLD.station is not distinct from NEW.station then
    return NEW;
  end if;

  select role::text into v_user_role from public.users where id = NEW.user_id;

  -- 1. Retirer les anciens canaux STATION de la succursale.
  if v_user_role = 'EMPLOYEE' then
    -- Employé : une seule station → purge complète des canaux STATION (corrige
    -- aussi les membres multi-canaux issus du seed historique).
    delete from public.chat_channel_members ccm
     using public.chat_channels cc
     where ccm.channel_id = cc.id
       and ccm.user_id = NEW.user_id
       and cc.location_id = NEW.location_id
       and cc.type = 'STATION'
       and cc.is_archived = false;
  elsif TG_OP = 'UPDATE' then
    -- Gérant / propriétaire : ne quitter que l'ancienne station.
    select id into old_channel_id
      from public.chat_channels
     where location_id = OLD.location_id
       and type = 'STATION'
       and station = OLD.station
       and is_archived = false
     limit 1;

    if old_channel_id is not null then
      delete from public.chat_channel_members
       where channel_id = old_channel_id
         and user_id = OLD.user_id;
    end if;
  end if;

  -- 2. Rejoindre le canal de la nouvelle station (INSERT ou UPDATE).
  select id into target_channel_id
    from public.chat_channels
   where location_id = NEW.location_id
     and type = 'STATION'
     and station = NEW.station
     and is_archived = false
   limit 1;

  if target_channel_id is not null then
    insert into public.chat_channel_members (channel_id, user_id, can_post, joined_at)
    values (target_channel_id, NEW.user_id, true, now())
    on conflict (channel_id, user_id) do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists on_member_station_updated on public.location_members;
drop trigger if exists on_member_station_inserted on public.location_members;
drop trigger if exists on_member_station_changed on public.location_members;

create trigger on_member_station_changed
  after insert or update of station on public.location_members
  for each row execute function public.handle_member_station_change();

-- Diagnostic rapide après un changement via /fr/team :
--   select u.full_name, cc.slug, ccm.user_id
--     from chat_channel_members ccm
--     join chat_channels cc on cc.id = ccm.channel_id
--     join users u on u.id = ccm.user_id
--    where cc.type = 'STATION' and u.email = 'employe@mirok.ca';
