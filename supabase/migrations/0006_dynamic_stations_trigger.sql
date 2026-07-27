-- Mirok — Trigger auto-inscription canaux : station_id (postes dynamiques)

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

  if TG_OP = 'UPDATE' and OLD.station_id is not distinct from NEW.station_id then
    return NEW;
  end if;

  select role::text into v_user_role from public.users where id = NEW.user_id;

  if v_user_role = 'EMPLOYEE' then
    delete from public.chat_channel_members ccm
     using public.chat_channels cc
     where ccm.channel_id = cc.id
       and ccm.user_id = NEW.user_id
       and cc.location_id = NEW.location_id
       and cc.type = 'STATION'
       and cc.is_archived = false;
  elsif TG_OP = 'UPDATE' then
    select id into old_channel_id
      from public.chat_channels
     where location_id = OLD.location_id
       and type = 'STATION'
       and station_id = OLD.station_id
       and is_archived = false
     limit 1;

    if old_channel_id is not null then
      delete from public.chat_channel_members
       where channel_id = old_channel_id
         and user_id = OLD.user_id;
    end if;
  end if;

  select id into target_channel_id
    from public.chat_channels
   where location_id = NEW.location_id
     and type = 'STATION'
     and station_id = NEW.station_id
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

drop trigger if exists on_member_station_changed on public.location_members;

create trigger on_member_station_changed
  after insert or update of station_id on public.location_members
  for each row execute function public.handle_member_station_change();
