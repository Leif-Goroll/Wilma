-- Schnittstelle für den n8n-Workflow.
--
-- Bewusst getrennt von wilma_log_message: Frage und Antwort schreibt schon
-- die Anwendung mit (/api/wilson). Würde n8n sie erneut schreiben, zählte
-- das Dashboard jede Frage doppelt. Hier landet ausschließlich, was im
-- Workflow entsteht – benutzte Wissensbausteine, Modell und Kosten, ob
-- überhaupt eine Antwort gefunden wurde.
--
-- Landet als Ereignis vom Typ 'agent_run' in wilma_events; `data` ist frei,
-- damit der Workflow Felder ergänzen kann, ohne dass hier etwas nachgezogen
-- werden muss.
create or replace function public.wilma_log_run(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session  text := nullif(btrim(coalesce(p->>'session', '')), '');
  v_mode     text := nullif(p->>'mode', '');
  v_run      jsonb := coalesce(p->'run', '{}'::jsonb);
  v_duration numeric := nullif(v_run->>'duration_ms', '')::numeric;
  v_client   text;
  v_id       bigint;
begin
  if v_session is null then
    return null;
  end if;

  select client_slug into v_client from public.wilma_sessions where id = v_session;

  -- Kommt der Workflow dem Mitschreiben der Anwendung zuvor, fehlt die
  -- Sitzung noch. Dann hier anlegen, damit die Zuordnung nicht verloren geht.
  if v_client is null then
    v_client := public.wilma_resolve_client(p->>'client', null);
    insert into public.wilma_sessions (id, client_slug, opened)
    values (v_session, v_client, true)
    on conflict (id) do nothing;
  end if;

  insert into public.wilma_events (session_id, client_slug, type, mode, value, data)
  values (v_session, v_client, 'agent_run', v_mode, v_duration, v_run)
  returning id into v_id;

  update public.wilma_sessions
    set last_seen_at = greatest(last_seen_at, now())
  where id = v_session;

  return v_id;
end;
$$;

revoke all on function public.wilma_log_run(jsonb) from public, anon, authenticated;
grant execute on function public.wilma_log_run(jsonb) to service_role;
