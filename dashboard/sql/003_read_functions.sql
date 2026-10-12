-- Lesepfad der Auswertung: eine Abfrage je Seitenaufruf.
--
-- Gerechnet wird in der Datenbank, nicht in der Anwendung. Damit ist jede
-- Kennzahl genau einmal definiert – und die Seite bleibt schnell, auch
-- wenn später Zehntausende Gespräche darin liegen.

-- Kennzahlen eines Zeitraums. Eigene Funktion, damit der Vergleich mit dem
-- vorherigen Zeitraum dieselbe Rechnung benutzt.
create or replace function public.wilma_kpis(
  p_client text,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with s as (
    select * from public.wilma_sessions
    where started_at >= p_from and started_at < p_to
      and (p_client is null or client_slug = p_client)
  ), conv as (
    select * from s where user_messages > 0
  )
  select jsonb_build_object(
    'sessions',       (select count(*) from s),
    'visitors',       (select count(distinct coalesce(visitor_id, id)) from s),
    'opened',         (select count(*) from s where opened),
    'conversations',  (select count(*) from conv),
    'questions',      (select coalesce(sum(user_messages), 0) from s),
    'answers',        (select coalesce(sum(wilma_messages), 0) from s),
    'avg_questions',  (select round(avg(user_messages)::numeric, 1) from conv),
    'avg_duration',   (select round(avg(nullif(duration_seconds, 0))::numeric) from conv),
    'bookings',       (select count(*) from s where booking_clicked),
    'voice_conversations', (select count(*) from conv where used_voice),
    'chat_conversations',  (select count(*) from conv where not used_voice),
    'voice_minutes',  (select round(coalesce(sum(voice_seconds), 0) / 60.0, 1) from s),
    'avg_latency_ms', (select round(sum(latency_total_ms)::numeric / nullif(sum(latency_count), 0)) from s),
    'dictation',      (select count(*) from s where used_dictation)
  );
$$;

-- Alles, was das Dashboard für einen Zeitraum braucht, in einem Aufruf.
create or replace function public.wilma_dashboard(
  p_client text default null,
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now(),
  p_tz text default 'Europe/Berlin'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_span interval := p_to - p_from;
  -- Füllwörter, die in einer Schlagwortliste nichts zu suchen haben.
  v_stop text[] := array[
    'ich','du','er','sie','es','wir','ihr','der','die','das','den','dem','des',
    'ein','eine','einen','einem','einer','eines','und','oder','aber','wie','was',
    'wer','wo','wann','warum','wieso','weshalb','ist','sind','war','waren','bin',
    'bist','seid','haben','hat','hast','habt','hatte','kann','koennen','koennt',
    'muss','muessen','soll','sollen','will','wollen','wuerde','wuerden','mit',
    'von','zu','zum','zur','fuer','auf','an','in','im','am','aus','bei','nach',
    'ueber','unter','vor','durch','gegen','ohne','um','bis','seit','dass','weil',
    'wenn','als','auch','noch','schon','nur','sehr','mehr','viel','viele','mal',
    'bitte','danke','hallo','guten','tag','mir','mich','mein','meine','meinen',
    'sich','ihre','ihren','euer','man','nicht','kein','keine','keinen','doch',
    'denn','also','dann','hier','da','dort','so','ja','nein','etwas','alle',
    'alles','wilma','gibt','geht','machen','macht','sagen','wissen','brauche',
    'braucht','moechte','moechten','gerne','gern','koennte','haette','werden',
    'wird','wurde','worden','sein','ihrer','unser','unsere','wieviel','eigentlich'
  ];
  v_result jsonb;
begin
  with s as (
    select * from public.wilma_sessions
    where started_at >= p_from and started_at < p_to
      and (p_client is null or client_slug = p_client)
  ), m as (
    select * from public.wilma_messages
    where created_at >= p_from and created_at < p_to
      and (p_client is null or client_slug = p_client)
  ), q as (
    select * from m where role = 'user' and length(normalized) > 2
  )
  select jsonb_build_object(
    'kpis',     public.wilma_kpis(p_client, p_from, p_to),
    'previous', public.wilma_kpis(p_client, p_from - v_span, p_from),

    -- Verlauf je Tag, lückenlos: Ein Tag ohne Gespräch soll als Null im
    -- Diagramm stehen, nicht einfach fehlen.
    'daily', (
      select coalesce(jsonb_agg(row order by row->>'date'), '[]'::jsonb) from (
        select jsonb_build_object(
          'date', to_char(d, 'YYYY-MM-DD'),
          'sessions', coalesce(x.sessions, 0),
          'conversations', coalesce(x.conversations, 0),
          'questions', coalesce(x.questions, 0),
          'bookings', coalesce(x.bookings, 0)
        ) as row
        from generate_series(
          date_trunc('day', p_from at time zone p_tz),
          date_trunc('day', (p_to at time zone p_tz) - interval '1 second'),
          interval '1 day'
        ) d
        left join (
          select date_trunc('day', started_at at time zone p_tz) as day,
                 count(*) as sessions,
                 count(*) filter (where user_messages > 0) as conversations,
                 sum(user_messages) as questions,
                 count(*) filter (where booking_clicked) as bookings
          from s group by 1
        ) x on x.day = d
      ) t
    ),

    -- Wochentag × Stunde: wann Wilma tatsächlich gebraucht wird.
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dow', dow, 'hour', hour, 'count', c)), '[]'::jsonb)
      from (
        select extract(isodow from started_at at time zone p_tz)::int as dow,
               extract(hour from started_at at time zone p_tz)::int as hour,
               count(*) as c
        from s where user_messages > 0
        group by 1, 2
      ) h
    ),

    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(device, 'unbekannt'), 'count', c)
             order by c desc), '[]'::jsonb)
      from (select device, count(*) c from s group by 1) d
    ),

    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select coalesce(nullif(page_path, ''), '/') as label, count(*) c
        from s where user_messages > 0 group by 1 order by c desc limit 8
      ) p
    ),

    'referrers', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select coalesce(nullif(regexp_replace(coalesce(referrer, ''), '^https?://(www\.)?([^/]+).*$', '\2'), ''), 'direkt') as label,
               count(*) c
        from s where user_messages > 0 group by 1 order by c desc limit 8
      ) r
    ),

    -- Themen: erste passende Regel gewinnt, der Rest ist "Sonstiges".
    'topics', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'label', label, 'count', c)
             order by c desc), '[]'::jsonb)
      from (
        select coalesce(t.slug, 'sonstiges') as slug,
               coalesce(t.label, 'Sonstiges') as label,
               count(*) as c
        from q
        left join lateral (
          select tp.slug, tp.label
          from public.wilma_topics tp
          where (tp.client_slug is null or tp.client_slug = q.client_slug)
            and q.content ilike any (tp.patterns)
          order by tp.sort
          limit 1
        ) t on true
        group by 1, 2
      ) tt
    ),

    -- Wortgleiche Fragen zusammengefasst. Das Bündeln ähnlicher
    -- Formulierungen passiert danach in der Anwendung
    -- (src/lib/analytics/questions.ts).
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'text', sample, 'key', normalized, 'count', c,
        'last_at', last_at, 'sessions', sess)), '[]'::jsonb)
      from (
        select normalized,
               (array_agg(content order by created_at desc))[1] as sample,
               count(*) as c,
               count(distinct session_id) as sess,
               max(created_at) as last_at
        from q group by normalized order by count(*) desc, max(created_at) desc limit 400
      ) qq
    ),

    'keywords', (
      select coalesce(jsonb_agg(jsonb_build_object('word', word, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select word, count(*) c
        from (select unnest(string_to_array(normalized, ' ')) as word from q) w
        where length(word) > 3 and word <> all (v_stop) and word !~ '^[0-9]+$'
        group by word order by c desc limit 40
      ) k
    ),

    'conversations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'started_at', started_at, 'questions', user_messages,
        'duration', duration_seconds, 'mode', mode, 'booked', booking_clicked,
        'device', device, 'page', page_path, 'first_question', first_question)
        order by started_at desc), '[]'::jsonb)
      from (
        select s.id, s.started_at, s.user_messages, s.duration_seconds,
               case when s.used_voice and s.used_chat then 'beides'
                    when s.used_voice then 'voice' else 'chat' end as mode,
               s.booking_clicked, s.device, s.page_path,
               (select content from public.wilma_messages mm
                 where mm.session_id = s.id and mm.role = 'user'
                 order by created_at limit 1) as first_question
        from s where s.user_messages > 0
        order by s.started_at desc limit 60
      ) c
    ),

    -- Für die Kundenauswahl: immer alle Mandanten, unabhängig vom Filter.
    'clients', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'name', c.name, 'conversations', coalesce(x.c, 0))
        order by coalesce(x.c, 0) desc, c.name), '[]'::jsonb)
      from public.wilma_clients c
      left join (
        select client_slug, count(*) c
        from public.wilma_sessions
        where started_at >= p_from and started_at < p_to and user_messages > 0
        group by 1
      ) x on x.client_slug = c.slug
      where c.active
    ),

    'range', jsonb_build_object('from', p_from, 'to', p_to, 'tz', p_tz)
  ) into v_result;

  return v_result;
end;
$$;

-- Einzelnes Gespräch zum Nachlesen. `p_client` ist die Mandantenschranke:
-- Ein Kunde kommt damit nicht an fremde Gespräche, auch nicht über eine
-- geratene Sitzungskennung.
create or replace function public.wilma_conversation(p_session text, p_client text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'session', (
      select to_jsonb(s) from public.wilma_sessions s
      where s.id = p_session and (p_client is null or s.client_slug = p_client)
    ),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'role', m.role, 'content', m.content, 'mode', m.mode,
        'action', m.action, 'latency_ms', m.latency_ms, 'created_at', m.created_at)
        order by m.created_at), '[]'::jsonb)
      from public.wilma_messages m
      where m.session_id = p_session and (p_client is null or m.client_slug = p_client)
    )
  );
$$;

revoke all on function public.wilma_kpis(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.wilma_dashboard(text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.wilma_conversation(text, text) from public, anon, authenticated;

grant execute on function public.wilma_kpis(text, timestamptz, timestamptz) to service_role;
grant execute on function public.wilma_dashboard(text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.wilma_conversation(text, text) to service_role;
