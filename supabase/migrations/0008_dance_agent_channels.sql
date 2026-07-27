-- RitmoKit dance agent channels — enqueue on season publish + parity-sensitive enrollments.
-- Requires enqueue_agent_task() from 0001_cnesst_rules_and_agent_bus.sql.

CREATE OR REPLACE FUNCTION public.notify_session_season_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    PERFORM enqueue_agent_task(
      'agent:dance',
      'session.season_published',
      NULL,
      jsonb_build_object(
        'seasonId', NEW.id,
        'locationId', NEW.location_id,
        'name', NEW.name
      ),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_season_published ON public.session_seasons;
CREATE TRIGGER trg_session_season_published
  AFTER UPDATE OF status ON public.session_seasons
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_session_season_published();

CREATE OR REPLACE FUNCTION public.notify_enrollment_parity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leads int;
  v_follows int;
  v_max_leads int;
  v_max_follows int;
BEGIN
  SELECT
    cs.max_leads,
    cs.max_follows,
    COALESCE(SUM(CASE WHEN e.dance_role = 'LEAD' AND e.waitlisted = false THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.dance_role = 'FOLLOW' AND e.waitlisted = false THEN 1 ELSE 0 END), 0)
  INTO v_max_leads, v_max_follows, v_leads, v_follows
  FROM class_sessions cs
  LEFT JOIN enrollments e ON e.session_id = cs.id
  WHERE cs.id = NEW.session_id
  GROUP BY cs.max_leads, cs.max_follows;

  IF NEW.waitlisted = true OR ABS(v_leads - v_follows) > 2 THEN
    PERFORM enqueue_agent_task(
      'agent:dance',
      'enrollment.parity_alert',
      NULL,
      jsonb_build_object(
        'sessionId', NEW.session_id,
        'enrollmentId', NEW.id,
        'danceRole', NEW.dance_role,
        'waitlisted', NEW.waitlisted,
        'filledLeads', v_leads,
        'filledFollows', v_follows,
        'maxLeads', v_max_leads,
        'maxFollows', v_max_follows
      ),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_parity ON public.enrollments;
CREATE TRIGGER trg_enrollment_parity
  AFTER INSERT ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_enrollment_parity();
