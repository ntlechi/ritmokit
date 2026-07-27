-- Mirok — Auto-configuration du Database Webhook en pur SQL (pg_net)
--
-- OPTIONNEL. Le chemin par défaut (recommandé pour commencer, plus visible
-- pour déboguer) reste de créer le webhook depuis Database > Webhooks dans
-- le dashboard Supabase — voir README.md.
--
-- Ce fichier est l'alternative "zéro-ClickOps" : elle élimine complètement
-- l'étape dashboard en faisant appeler l'endpoint /api/agents/webhook
-- directement par un trigger Postgres (exactement le mécanisme qu'utilise
-- le dashboard en interne — `net.http_post`).
--
-- Les deux mécanismes peuvent tourner en même temps sans risque : chaque
-- appel relit `agent_logs` et le premier à appeler `claimAgentTask` gagne,
-- l'autre reçoit "already_claimed" et s'arrête proprement (idempotence).
--
-- Configuration requise avant d'exécuter ce fichier (une seule fois) :
--   alter database postgres set app.settings.agent_webhook_url = 'https://mirok.ca/api/agents/webhook';
--   alter database postgres set app.settings.agent_webhook_secret = '<valeur de AGENT_WEBHOOK_SECRET>';
-- Puis relancez ce script (les connexions existantes ne voient pas le
-- nouveau setting ; le SQL Editor du dashboard ouvre une connexion fraîche
-- donc c'est généralement transparent).

create extension if not exists pg_net;

create or replace function trigger_agent_webhook() returns trigger
language plpgsql security definer as $$
declare
  v_url text := current_setting('app.settings.agent_webhook_url', true);
  v_secret text := current_setting('app.settings.agent_webhook_secret', true);
begin
  -- Pas configuré : on se contente du pg_notify déjà émis par
  -- enqueue_agent_task (utile en dev avant d'avoir une URL publique).
  if v_url is null or v_url = '' then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'agent_logs',
      'schema', 'public',
      'record', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_secret, '')
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists trg_agent_logs_webhook on agent_logs;
create trigger trg_agent_logs_webhook
  after insert on agent_logs
  for each row execute function trigger_agent_webhook();

-- Diagnostic : `select * from net._http_response order by id desc limit 20;`
-- montre le statut des derniers appels sortants (utile si l'Agent de Crise
-- ne semble pas se réveiller).
