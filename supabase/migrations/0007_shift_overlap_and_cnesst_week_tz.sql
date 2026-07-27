-- L1: prevent double-booking the same employee on overlapping intervals.
-- L2: CNESST week bounds in America/Toronto (Sunday 00:00 → next Sunday),
--     not session/UTC date_trunc.

create extension if not exists btree_gist;

-- Drop any prior soft attempt (idempotent).
alter table if exists shifts
  drop constraint if exists shifts_employee_no_overlap;

alter table shifts
  add constraint shifts_employee_no_overlap
  exclude using gist (
    employee_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (employee_id is not null and status <> 'REJECTED');

create or replace function enforce_cnesst_rules() returns trigger
language plpgsql
as $$
declare
  v_local timestamp;
  v_week_start_local timestamp;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_weekly_hours numeric(5, 2);
  v_shift_hours numeric(5, 2);
  v_previous_shift_end timestamptz;
  v_rest_hours numeric(6, 2);
  v_overlap_id uuid;
begin
  -- Semaine CNESST : dimanche 00:00 → dimanche suivant (America/Toronto).
  -- date_trunc('week') is ISO (Monday); subtract 1 day → Sunday.
  v_local := new.starts_at at time zone 'America/Toronto';
  v_week_start_local := date_trunc('week', v_local) - interval '1 day';
  v_week_start := v_week_start_local at time zone 'America/Toronto';
  v_week_end := v_week_start + interval '7 days';

  v_shift_hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;

  -- Pause payée de 30 min obligatoire après 5h consécutives.
  new.break_required_minutes := case when v_shift_hours >= 5 then 30 else 0 end;

  if new.employee_id is not null then
    -- Defense in depth alongside the EXCLUDE constraint (clearer error on publish).
    select s.id into v_overlap_id
      from shifts s
     where s.employee_id = new.employee_id
       and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and s.status <> 'REJECTED'
       and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
     limit 1;

    if v_overlap_id is not null then
      raise exception
        'CNESST: chevauchement de quarts pour employee_id=% (conflit avec %)',
        new.employee_id, v_overlap_id
        using errcode = 'P0001';
    end if;

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

  if new.status in ('PUBLISHED', 'CONFIRMED') and new.rest_violation_flag then
    raise exception
      'CNESST: repos minimal de 32h consécutives non respecté — impossible de publier ce quart (employee_id=%, starts_at=%)',
      new.employee_id, new.starts_at
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
