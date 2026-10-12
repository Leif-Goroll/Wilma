-- Schreibpfad der Auswertung.
--
-- Alles läuft über zwei Funktionen, nicht über direkte Tabellenzugriffe:
-- So bleibt die Regel, wie aus Ereignissen Kennzahlen werden, an einer
-- einzigen Stelle – und die Anwendung braucht nur einen RPC-Aufruf.

-- Ordnet einen Besuch einem Kunden zu. Unbekannte Hosts legen sich selbst an,
-- damit eine neue Einbettung ohne weiteres Zutun im Dashboard erscheint.
create or replace function public.wilma_resolve_client(p_slug text, p_host text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_slug text;
  v_host text := nullif(lower(btrim(coalesce(p_host, ''))), '');
begin
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    v_slug := lower(regexp_replace(btrim(p_slug), '[^a-zA-Z0-9-]+', '-', 'g'));
    insert into public.wilma_clients (slug, name, auto_created)
    values (v_slug, v_slug, true)
    on conflict (slug) do nothing;
    return v_slug;
  end if;

  if v_host is null then
    return 'unbekannt';
  end if;

  v_host := regexp_replace(v_host, '^www\.', '');

  select slug into v_slug
  from public.wilma_clients
  where v_host = any(origins)
  limit 1;

  if v_slug is not null then
    return v_slug;
  end if;

  v_slug := btrim(regexp_replace(v_host, '[^a-z0-9]+', '-', 'g'), '-');
  if v_slug = '' then
    return 'unbekannt';
  end if;

  insert into public.wilma_clients (slug, name, origins, auto_created)
  values (v_slug, v_host, array[v_host], true)
  on conflict (slug) do nothing;

  return v_slug;
end;
$$;

-- Nimmt ein einzelnes Ereignis aus dem Widget entgegen.
--
-- Die Zuordnung zum Kunden hängt an der Sitzung, nicht am einzelnen
-- Ereignis: Nur das erste Ereignis bringt Seite und Host mit, alle weiteren
-- würden sonst unter "unbekannt" landen. Bringt ein späteres Ereignis die
-- Herkunft nach, wird die Sitzung samt ihrer bisherigen Ereignisse
-- nachträglich umgehängt.
create or replace function public.wilma_track(p jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session  text := nullif(btrim(coalesce(p->>'session', '')), '');
  v_type     text := nullif(btrim(coalesce(p->>'type', '')), '');
  v_mode     text := nullif(p->>'mode', '');
  v_value    numeric := nullif(p->>'value', '')::numeric;
  v_duration integer := coalesce(nullif(p->>'duration', '')::integer, 0);
  v_page     jsonb := coalesce(p->'page', '{}'::jsonb);
  v_ctx      jsonb := coalesce(p->'context', '{}'::jsonb);
  v_existing text;
  v_resolved text := 'unbekannt';
  v_client   text;
begin
  if v_session is null or v_type is null then
    raise exception 'session und type sind Pflicht';
  end if;

  select client_slug into v_existing from public.wilma_sessions where id = v_session;

  if nullif(btrim(coalesce(p->>'client', '')), '') is not null
     or nullif(btrim(coalesce(v_page->>'host', '')), '') is not null then
    v_resolved := public.wilma_resolve_client(p->>'client', v_page->>'host');
  end if;

  v_client := case
    when v_resolved <> 'unbekannt' then v_resolved
    else coalesce(v_existing, 'unbekannt')
  end;

  insert into public.wilma_sessions (
    id, client_slug, visitor_id, page_url, page_path, page_host, referrer,
    device, browser, os, language, country, embedded
  )
  values (
    v_session, v_client, nullif(p->>'visitor', ''),
    nullif(v_page->>'url', ''), nullif(v_page->>'path', ''),
    nullif(v_page->>'host', ''), nullif(v_page->>'referrer', ''),
    nullif(v_ctx->>'device', ''), nullif(v_ctx->>'browser', ''),
    nullif(v_ctx->>'os', ''), nullif(v_ctx->>'language', ''),
    nullif(v_ctx->>'country', ''), coalesce((v_page->>'embedded')::boolean, false)
  )
  on conflict (id) do nothing;

  if v_existing is not null and v_existing = 'unbekannt' and v_client <> 'unbekannt' then
    update public.wilma_events set client_slug = v_client
      where session_id = v_session and client_slug = 'unbekannt';
    update public.wilma_messages set client_slug = v_client
      where session_id = v_session and client_slug = 'unbekannt';
  end if;

  update public.wilma_sessions set
    client_slug      = v_client,
    visitor_id       = coalesce(visitor_id, nullif(p->>'visitor', '')),
    last_seen_at     = greatest(last_seen_at, now()),
    duration_seconds = greatest(duration_seconds, v_duration),
    opened           = opened or v_type in ('open', 'mode', 'voice_start'),
    first_mode       = coalesce(first_mode, case when v_type = 'mode' then v_mode end),
    used_chat        = used_chat or (v_type = 'mode' and v_mode = 'chat'),
    used_voice       = used_voice or (v_type in ('voice_start', 'voice_end'))
                         or (v_type = 'mode' and v_mode = 'voice'),
    used_dictation   = used_dictation or v_type = 'dictation',
    voice_seconds    = voice_seconds
                         + case when v_type = 'voice_end' then coalesce(v_value, 0)::integer else 0 end,
    booking_clicked  = booking_clicked or v_type = 'booking',
    page_url         = coalesce(page_url, nullif(v_page->>'url', '')),
    page_path        = coalesce(page_path, nullif(v_page->>'path', '')),
    page_host        = coalesce(page_host, nullif(v_page->>'host', '')),
    referrer         = coalesce(referrer, nullif(v_page->>'referrer', '')),
    device           = coalesce(device, nullif(v_ctx->>'device', '')),
    browser          = coalesce(browser, nullif(v_ctx->>'browser', '')),
    os               = coalesce(os, nullif(v_ctx->>'os', '')),
    language         = coalesce(language, nullif(v_ctx->>'language', '')),
    country          = coalesce(country, nullif(v_ctx->>'country', ''))
  where id = v_session;

  insert into public.wilma_events (session_id, client_slug, type, mode, value, data)
  values (v_session, v_client, v_type, v_mode, v_value, coalesce(p->'data', '{}'::jsonb));

  return v_client;
end;
$$;

-- Schreibt eine Frage oder eine Antwort mit. Wird serverseitig aus
-- /api/wilson aufgerufen, damit auch Antwortzeit und Aktion mitkommen.
create or replace function public.wilma_log_message(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session text := nullif(btrim(coalesce(p->>'session', '')), '');
  v_role    text := coalesce(p->>'role', 'user');
  v_content text := btrim(coalesce(p->>'content', ''));
  v_mode    text := nullif(p->>'mode', '');
  v_latency integer := nullif(p->>'latency_ms', '')::integer;
  v_client  text;
  v_id      bigint;
begin
  if v_session is null or v_content = '' then
    return null;
  end if;

  select client_slug into v_client from public.wilma_sessions where id = v_session;

  if v_client is null then
    v_client := public.wilma_resolve_client(p->>'client', p->>'host');
    insert into public.wilma_sessions (id, client_slug, opened, page_host)
    values (v_session, v_client, true, nullif(p->>'host', ''))
    on conflict (id) do nothing;
  end if;

  insert into public.wilma_messages
    (session_id, client_slug, role, mode, content, action, latency_ms, chars)
  values
    (v_session, v_client, v_role, v_mode, v_content,
     nullif(p->>'action', ''), v_latency, length(v_content))
  returning id into v_id;

  update public.wilma_sessions set
    last_seen_at     = greatest(last_seen_at, now()),
    opened           = true,
    used_chat        = used_chat or v_mode = 'chat',
    used_voice       = used_voice or v_mode = 'voice',
    first_mode       = coalesce(first_mode, v_mode),
    user_messages    = user_messages + case when v_role = 'user' then 1 else 0 end,
    wilma_messages   = wilma_messages + case when v_role = 'wilma' then 1 else 0 end,
    latency_total_ms = latency_total_ms + coalesce(v_latency, 0),
    latency_count    = latency_count + case when v_latency is null then 0 else 1 end
  where id = v_session;

  return v_id;
end;
$$;

-- Erreichbar nur mit dem Service-Role-Schlüssel, also ausschließlich vom
-- Server der Anwendung. Mit den öffentlichen Schlüsseln geht hier nichts.
revoke all on function public.wilma_track(jsonb) from public, anon, authenticated;
revoke all on function public.wilma_log_message(jsonb) from public, anon, authenticated;
revoke all on function public.wilma_resolve_client(text, text) from public, anon, authenticated;

grant execute on function public.wilma_track(jsonb) to service_role;
grant execute on function public.wilma_log_message(jsonb) to service_role;
grant execute on function public.wilma_resolve_client(text, text) to service_role;
