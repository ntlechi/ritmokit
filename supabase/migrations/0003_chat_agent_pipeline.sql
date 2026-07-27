-- Mirok — Phase 2B : Pipeline d'agents sur les messages de chat
--
-- Complète 0001 (bus d'agents + CNESST) et 0002 (auto-config webhook) avec le
-- réveil des agents directement depuis `chat_messages`. Un employé qui écrit
-- "Je serai en retard de 15 min" dans #cuisine déclenche, en base, la même
-- mécanique event-driven que les triggers de `shifts` : `pg_notify` ->
-- Database Webhook -> /api/agents/webhook -> agent dédié -> `agent_logs`.
--
-- Application : mêmes trois méthodes que 0001/0002 (voir README.md), par ex. :
--   npx prisma db execute --file supabase/migrations/0003_chat_agent_pipeline.sql

-- ---------------------------------------------------------------------------
-- 1. Extension de `enqueue_agent_task` — traçabilité du message source
-- ---------------------------------------------------------------------------

-- On ajoute `p_related_message_id` en 5e position avec une valeur par défaut
-- pour rester rétro-compatible avec les appels existants (triggers `shifts`,
-- `lib/agents/bus.ts`) qui continuent de passer 4 arguments positionnels.
drop function if exists enqueue_agent_task(text, text, uuid, jsonb);

create or replace function enqueue_agent_task(
  p_channel text,
  p_event_type text,
  p_related_shift_id uuid,
  p_payload jsonb,
  p_related_message_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  -- `updated_at` n'a pas de défaut au niveau base (Prisma gère `@updatedAt`
  -- côté client) : un insert SQL pur comme celui-ci doit le fixer lui-même,
  -- sans quoi la contrainte NOT NULL héritée de 0001 échoue. C'était latent
  -- depuis 0001 (jamais exercé par les triggers `shifts` dans les seeds
  -- existants) — corrigé ici pour de bon.
  insert into agent_logs (channel, event_type, related_shift_id, related_message_id, payload, status, updated_at)
  values (p_channel, p_event_type, p_related_shift_id, p_related_message_id, coalesce(p_payload, '{}'::jsonb), 'PENDING', now())
  returning id into v_id;

  perform pg_notify(
    p_channel,
    json_build_object(
      'agentLogId', v_id,
      'eventType', p_event_type,
      'relatedShiftId', p_related_shift_id,
      'relatedMessageId', p_related_message_id
    )::text
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trigger `on_chat_message_insert` — réveil du Routeur d'Intents
-- ---------------------------------------------------------------------------

create or replace function notify_chat_message_event() returns trigger
language plpgsql
as $$
declare
  v_location_id uuid;
begin
  -- Les messages générés par un agent (contentType AGENT/SYSTEM) ne doivent
  -- jamais se re-déclencher eux-mêmes : ça casserait la boucle (feedback loop
  -- infini) et pollueriit l'audit avec du bruit non-humain.
  if new.content_type in ('AGENT', 'SYSTEM') then
    return new;
  end if;

  -- Corps vide (ex: message système technique) : rien à analyser.
  if new.body is null or btrim(new.body) = '' then
    return new;
  end if;

  -- Résout la succursale pour donner au routeur d'intents tout le contexte
  -- nécessaire sans requête supplémentaire (canal de station vs message direct).
  if new.channel_id is not null then
    select cc.location_id into v_location_id
      from chat_channels cc
     where cc.id = new.channel_id;
  elsif new.conversation_id is not null then
    select dc.location_id into v_location_id
      from direct_conversations dc
     where dc.id = new.conversation_id;
  end if;

  perform enqueue_agent_task(
    'agent:chat',
    'chat.message_posted',
    null,
    json_build_object(
      'messageId', new.id,
      'channelId', new.channel_id,
      'conversationId', new.conversation_id,
      'authorId', new.author_id,
      'locationId', v_location_id,
      'body', new.body
    )::jsonb,
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_chat_message_event on chat_messages;
create trigger trg_notify_chat_message_event
  after insert on chat_messages
  for each row execute function notify_chat_message_event();

-- ---------------------------------------------------------------------------
-- 3. Supabase Realtime — publier les tables lues par l'UI (postgres_changes)
-- ---------------------------------------------------------------------------

-- `ChannelThread` (client) écoute `chat_messages` en direct via l'anon key ;
-- sans cette ligne, Realtime ne diffuse tout simplement aucun événement,
-- indépendamment des policies RLS ci-dessous. Idempotent (ignore si déjà membre).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS — durcissement des tables franchise/messagerie (introduites en 2A)
-- ---------------------------------------------------------------------------

-- Requis pour que Realtime (qui s'exécute sous le rôle `authenticated`) ne
-- diffuse que les messages des canaux dont l'utilisateur est réellement
-- membre — sans quoi la clé anon publique donnerait accès à tout le chat.
alter table organizations enable row level security;
alter table locations enable row level security;
alter table location_members enable row level security;
alter table chat_channels enable row level security;
alter table chat_channel_members enable row level security;
alter table chat_messages enable row level security;
alter table direct_conversations enable row level security;
alter table conversation_participants enable row level security;
alter table sop_channel_pins enable row level security;

drop policy if exists "Organisations lisibles par les membres authentifiés" on organizations;
create policy "Organisations lisibles par les membres authentifiés" on organizations
  for select using (auth.role() = 'authenticated');

drop policy if exists "Succursales lisibles par les membres authentifiés" on locations;
create policy "Succursales lisibles par les membres authentifiés" on locations
  for select using (auth.role() = 'authenticated');

drop policy if exists "Un utilisateur voit sa propre adhésion succursale" on location_members;
create policy "Un utilisateur voit sa propre adhésion succursale" on location_members
  for select using (user_id = auth.uid());

drop policy if exists "Un utilisateur voit les canaux dont il est membre" on chat_channels;
create policy "Un utilisateur voit les canaux dont il est membre" on chat_channels
  for select using (
    exists (
      select 1 from chat_channel_members ccm
       where ccm.channel_id = chat_channels.id and ccm.user_id = auth.uid()
    )
  );

drop policy if exists "Un utilisateur voit sa propre adhésion aux canaux" on chat_channel_members;
create policy "Un utilisateur voit sa propre adhésion aux canaux" on chat_channel_members
  for select using (user_id = auth.uid());

drop policy if exists "Un utilisateur voit les messages de ses canaux ou conversations" on chat_messages;
create policy "Un utilisateur voit les messages de ses canaux ou conversations" on chat_messages
  for select using (
    (channel_id is not null and exists (
      select 1 from chat_channel_members ccm
       where ccm.channel_id = chat_messages.channel_id and ccm.user_id = auth.uid()
    ))
    or
    (conversation_id is not null and exists (
      select 1 from conversation_participants cp
       where cp.conversation_id = chat_messages.conversation_id and cp.user_id = auth.uid()
    ))
  );

drop policy if exists "Un utilisateur poste dans ses canaux ou conversations" on chat_messages;
create policy "Un utilisateur poste dans ses canaux ou conversations" on chat_messages
  for insert with check (
    author_id = auth.uid()
    and (
      (channel_id is not null and exists (
        select 1 from chat_channel_members ccm
         where ccm.channel_id = chat_messages.channel_id
           and ccm.user_id = auth.uid()
           and ccm.can_post = true
      ))
      or
      (conversation_id is not null and exists (
        select 1 from conversation_participants cp
         where cp.conversation_id = chat_messages.conversation_id and cp.user_id = auth.uid()
      ))
    )
  );

drop policy if exists "Un utilisateur voit ses conversations directes" on direct_conversations;
create policy "Un utilisateur voit ses conversations directes" on direct_conversations
  for select using (
    exists (
      select 1 from conversation_participants cp
       where cp.conversation_id = direct_conversations.id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Un utilisateur voit ses propres participations" on conversation_participants;
create policy "Un utilisateur voit ses propres participations" on conversation_participants
  for select using (user_id = auth.uid());

drop policy if exists "Un utilisateur voit les SOP épinglées dans ses canaux" on sop_channel_pins;
create policy "Un utilisateur voit les SOP épinglées dans ses canaux" on sop_channel_pins
  for select using (
    exists (
      select 1 from chat_channel_members ccm
       where ccm.channel_id = sop_channel_pins.channel_id and ccm.user_id = auth.uid()
    )
  );

-- Diagnostic : `select * from agent_logs where channel = 'agent:chat' order by
-- created_at desc limit 20;` montre les derniers messages routés vers
-- l'Agent Retard, leur statut et leur résultat (result.alerted, result.shiftId).
