-- Mirok — Règles CNESST + Bus d'agents (Supabase Realtime + pg_notify)
--
-- Ce fichier complète les tables créées par Prisma (`npx prisma migrate dev`)
-- avec de la logique base de données pure : elle s'applique même si un
-- agent IA écrit directement dans Postgres en contournant l'API Next.js.
--
-- Application : `supabase db push` (Supabase CLI) une fois le projet lié,
-- ou coller le contenu dans l'éditeur SQL du dashboard Supabase.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Moteur de reprise (Loop Engineering) : file d'attente durable pour agents
-- ---------------------------------------------------------------------------

-- Insère une tâche dans `agent_logs` (statut PENDING) puis réveille les
-- agents abonnés via pg_notify. Le payload NOTIFY ne contient qu'un
-- identifiant : les agents relisent la ligne complète dans `agent_logs`,
-- ce qui garantit l'idempotence même si plusieurs NOTIFY se chevauchent.
create or replace function enqueue_agent_task(
  p_channel text,
  p_event_type text,
  p_related_shift_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into agent_logs (channel, event_type, related_shift_id, payload, status)
  values (p_channel, p_event_type, p_related_shift_id, coalesce(p_payload, '{}'::jsonb), 'PENDING')
  returning id into v_id;

  perform pg_notify(
    p_channel,
    json_build_object(
      'agentLogId', v_id,
      'eventType', p_event_type,
      'relatedShiftId', p_related_shift_id
    )::text
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Blindage CNESST : calcul automatique des heures, pauses et repos
-- ---------------------------------------------------------------------------

create or replace function enforce_cnesst_rules() returns trigger
language plpgsql
as $$
declare
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_weekly_hours numeric(5, 2);
  v_shift_hours numeric(5, 2);
  v_previous_shift_end timestamptz;
  v_rest_hours numeric(6, 2);
begin
  -- Semaine CNESST : dimanche 00:00 -> samedi 23:59:59 (heure de l'employé).
  v_week_start := date_trunc('week', new.starts_at) - interval '1 day';
  v_week_end := v_week_start + interval '7 days';

  v_shift_hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;

  -- Pause payée de 30 min obligatoire après 5h consécutives.
  new.break_required_minutes := case when v_shift_hours >= 5 then 30 else 0 end;

  if new.employee_id is not null then
    select coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0), 0) + v_shift_hours
      into v_weekly_hours
      from shifts s
     where s.employee_id = new.employee_id
       and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and s.status not in ('REJECTED')
       and s.starts_at >= v_week_start
       and s.starts_at < v_week_end;

    new.weekly_hours_snapshot := v_weekly_hours;
    new.overtime_flag := v_weekly_hours > 40;

    -- Heuristique de repos : écart avec le quart précédent de l'employé.
    -- Alerte manager si < 32h ; ceci ne remplace pas une validation légale complète.
    select max(s.ends_at) into v_previous_shift_end
      from shifts s
     where s.employee_id = new.employee_id
       and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and s.status not in ('REJECTED')
       and s.ends_at <= new.starts_at;

    if v_previous_shift_end is not null then
      v_rest_hours := extract(epoch from (new.starts_at - v_previous_shift_end)) / 3600.0;
      new.rest_violation_flag := v_rest_hours < 32;
    else
      new.rest_violation_flag := false;
    end if;
  else
    new.weekly_hours_snapshot := 0;
    new.overtime_flag := false;
    new.rest_violation_flag := false;
  end if;

  -- Blindage légal dur : le 40h n'est PAS illégal (temps supplémentaire
  -- payé 1.5x), donc reste un avertissement (overtime_flag) — jamais
  -- bloquant. Le repos de 32h consécutives EST une obligation stricte de
  -- la Loi sur les normes du travail : on bloque uniquement au moment où
  -- le quart devient visible/engageant pour l'employé (PUBLISHED /
  -- CONFIRMED), pas à l'étape de brouillon.
  if new.status in ('PUBLISHED', 'CONFIRMED') and new.rest_violation_flag then
    raise exception
      'CNESST: repos minimal de 32h consécutives non respecté — impossible de publier ce quart (employee_id=%, starts_at=%)',
      new.employee_id, new.starts_at
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_cnesst_rules on shifts;
create trigger trg_enforce_cnesst_rules
  before insert or update of starts_at, ends_at, employee_id, status on shifts
  for each row execute function enforce_cnesst_rules();

-- ---------------------------------------------------------------------------
-- 3. Réveil des agents : crise de remplacement & négociation d'échange
-- ---------------------------------------------------------------------------

create or replace function notify_shift_event() returns trigger
language plpgsql
as $$
begin
  -- Un quart REJETÉ ou marqué CRISIS_ALERT doit être repourvu : on réveille
  -- l'Agent de Crise en arrière-plan pour lancer la boucle de remplacement.
  if new.status in ('REJECTED', 'CRISIS_ALERT')
     and (old is null or old.status is distinct from new.status) then
    perform enqueue_agent_task(
      'agent:crisis',
      'shift.crisis',
      new.id,
      json_build_object('status', new.status, 'station', new.station)::jsonb
    );
  end if;

  if new.overtime_flag and (old is null or old.overtime_flag is distinct from new.overtime_flag) then
    perform enqueue_agent_task(
      'agent:cnesst',
      'shift.overtime_detected',
      new.id,
      json_build_object('weeklyHours', new.weekly_hours_snapshot)::jsonb
    );
  end if;

  if new.rest_violation_flag and (old is null or old.rest_violation_flag is distinct from new.rest_violation_flag) then
    perform enqueue_agent_task(
      'agent:cnesst',
      'shift.rest_violation_detected',
      new.id,
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_shift_event on shifts;
create trigger trg_notify_shift_event
  after insert or update of status, overtime_flag, rest_violation_flag on shifts
  for each row execute function notify_shift_event();

create or replace function notify_swap_request_event() returns trigger
language plpgsql
as $$
begin
  perform enqueue_agent_task(
    'agent:swap',
    'shift.swap_requested',
    new.shift_id,
    json_build_object('swapRequestId', new.id, 'targetEmployeeId', new.target_employee_id)::jsonb
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_swap_request on shift_swap_requests;
create trigger trg_notify_swap_request
  after insert on shift_swap_requests
  for each row execute function notify_swap_request_event();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — barrière minimale (à affiner par rôle applicatif)
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table employee_profiles enable row level security;
alter table shifts enable row level security;
alter table shift_swap_requests enable row level security;
alter table sops enable row level security;
alter table documents enable row level security;
alter table agent_logs enable row level security;

create policy "Un utilisateur voit son propre profil" on users
  for select using (auth.uid() = id);

create policy "Un employé voit son propre profil détaillé" on employee_profiles
  for select using (auth.uid() = user_id);

create policy "Un employé voit ses propres quarts" on shifts
  for select using (auth.uid() = employee_id or auth.uid() = created_by_id);

create policy "Un employé gère ses propres demandes d'échange" on shift_swap_requests
  for select using (auth.uid() = requested_by_id or auth.uid() = target_employee_id);

create policy "SOP et documents lisibles par tous les employés authentifiés" on sops
  for select using (auth.role() = 'authenticated');

create policy "Documents lisibles par tous les employés authentifiés" on documents
  for select using (auth.role() = 'authenticated');

-- `agent_logs` reste réservé au rôle `service_role` (aucune policy select
-- pour `authenticated` : les clients ne doivent jamais lire l'audit brut).
