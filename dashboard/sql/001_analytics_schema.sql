-- Wilma-Dashboard: Datenmodell für die Nutzungsauswertung.
--
-- Drei Ebenen, bewusst getrennt:
--   wilma_sessions  – ein Besuch (eine geöffnete Seite mit Widget), mit allen
--                     verdichteten Kennzahlen. Das Dashboard rechnet fast
--                     ausschließlich hier, deshalb sind die Zähler direkt in
--                     der Zeile statt jedes Mal aus den Ereignissen berechnet.
--   wilma_events    – jeder Einzelschritt (gesehen, geöffnet, Modus gewählt …).
--                     Die Rohdaten, falls später eine Frage aufkommt, die das
--                     verdichtete Modell nicht beantwortet.
--   wilma_messages  – was gefragt und geantwortet wurde, samt Antwortzeit.
--
-- Datenschutz: Es wird keine IP-Adresse gespeichert. Der `visitor_id` ist eine
-- Zufallskennung aus dem Browser des Besuchers (kein Fingerprint), nur dazu da,
-- wiederkehrende Besucher zu zählen.

create table if not exists public.wilma_clients (
  slug          text primary key,
  name          text not null,
  -- Womit sich ein Kunde sein eigenes Dashboard ansieht. Ein eigener Schlüssel
  -- je Kunde, damit niemand die Zahlen der anderen sieht.
  access_key    text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  -- Domains, unter denen das Widget läuft. Darüber wird ein Besuch ohne
  -- ausdrückliche Kennung automatisch dem richtigen Kunden zugeordnet.
  origins       text[] not null default '{}',
  -- Beim ersten unbekannten Host selbst angelegt: So taucht jede neue
  -- Einbettung von allein im Dashboard auf, statt in "unbekannt" zu landen.
  auto_created  boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.wilma_clients is
  'Kunden, auf deren Seiten Wilma eingebunden ist – ein Mandant je Zeile.';

create table if not exists public.wilma_sessions (
  id                text primary key,
  client_slug       text not null default 'unbekannt'
                      references public.wilma_clients(slug) on update cascade,
  visitor_id        text,
  started_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  -- Vom Browser gemeldete Dauer zwischen erstem und letztem Ereignis. Nicht
  -- aus last_seen_at - started_at gerechnet: Ein liegengelassener Tab würde
  -- die Durchschnitte sonst unbrauchbar machen.
  duration_seconds  integer not null default 0,
  opened            boolean not null default false,
  first_mode        text,
  used_chat         boolean not null default false,
  used_voice        boolean not null default false,
  used_dictation    boolean not null default false,
  voice_seconds     integer not null default 0,
  user_messages     integer not null default 0,
  wilma_messages    integer not null default 0,
  booking_clicked   boolean not null default false,
  -- Antwortzeit von n8n, aufsummiert für den Schnitt je Sitzung.
  latency_total_ms  bigint not null default 0,
  latency_count     integer not null default 0,
  page_url          text,
  page_path         text,
  page_host         text,
  referrer          text,
  device            text,
  browser           text,
  os                text,
  language          text,
  country           text,
  embedded          boolean not null default false
);

create index if not exists wilma_sessions_client_started_idx
  on public.wilma_sessions (client_slug, started_at desc);
create index if not exists wilma_sessions_started_idx
  on public.wilma_sessions (started_at desc);
create index if not exists wilma_sessions_visitor_idx
  on public.wilma_sessions (visitor_id);

create table if not exists public.wilma_events (
  id          bigint generated always as identity primary key,
  session_id  text not null,
  client_slug text not null default 'unbekannt',
  type        text not null,
  mode        text,
  value       numeric,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists wilma_events_client_created_idx
  on public.wilma_events (client_slug, created_at desc);
create index if not exists wilma_events_session_idx
  on public.wilma_events (session_id, created_at);
create index if not exists wilma_events_type_idx
  on public.wilma_events (type, created_at desc);

-- Normalisierte Fassung einer Frage: Grundlage fürs Zusammenfassen gleicher
-- Fragen. Deutsche Umlaute werden ausgeschrieben (nicht bloß entfernt), sonst
-- fielen "Preis für Wartung" und "Preis fuer Wartung" auseinander.
create or replace function public.wilma_normalize(p_text text)
returns text
language sql
immutable
-- Fester Suchpfad: Die Funktion steckt in einer generierten Spalte, ihr
-- Verhalten darf nicht davon abhängen, wer sie aufruft.
set search_path = pg_catalog, public
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(replace(
          lower(coalesce(p_text, '')),
          'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), 'é', 'e'),
        '[^a-z0-9 ]+', ' ', 'g'),
      ' {2,}', ' ', 'g')
  );
$$;

create table if not exists public.wilma_messages (
  id          bigint generated always as identity primary key,
  session_id  text not null,
  client_slug text not null default 'unbekannt',
  role        text not null check (role in ('user', 'wilma')),
  mode        text,
  content     text not null,
  normalized  text generated always as (public.wilma_normalize(content)) stored,
  action      text,
  latency_ms  integer,
  chars       integer,
  created_at  timestamptz not null default now()
);

create index if not exists wilma_messages_client_created_idx
  on public.wilma_messages (client_slug, created_at desc);
create index if not exists wilma_messages_session_idx
  on public.wilma_messages (session_id, created_at);
create index if not exists wilma_messages_normalized_idx
  on public.wilma_messages (normalized) where role = 'user';

-- Themen: regelbasiert, damit die Zuordnung nachvollziehbar bleibt und ohne
-- weiteres Modell auskommt. `patterns` sind ILIKE-Muster; das erste Thema mit
-- einem Treffer gewinnt (aufsteigend nach `sort`).
create table if not exists public.wilma_topics (
  slug        text primary key,
  label       text not null,
  patterns    text[] not null,
  sort        integer not null default 100,
  client_slug text references public.wilma_clients(slug) on update cascade
);

insert into public.wilma_clients (slug, name, origins)
values ('unbekannt', 'Ohne Zuordnung', '{}')
on conflict (slug) do nothing;

insert into public.wilma_topics (slug, label, patterns, sort) values
  ('preis',       'Preise und Kosten',      array['%preis%','%kostet%','%kosten%','%teuer%','%tarif%','%budget%','%euro%','%abo%','%monatlich%'], 10),
  ('termin',      'Termin und Beratung',    array['%termin%','%beratung%','%gespraech%','%gespräch%','%anruf%','%calendly%','%demo%','%kennenlern%','%meeting%'], 20),
  ('leistung',    'Leistungen und Angebot', array['%was macht%','%was bietet%','%leistung%','%angebot%','%dienstleist%','%koennen sie%','%können sie%','%hilfe bei%','%unterstuetz%','%unterstütz%'], 30),
  ('technik',     'Technik und Einbindung', array['%integration%','%einbinden%','%website%','%wordpress%','%api%','%schnittstelle%','%installation%','%einrichten%','%technisch%','%crm%'], 40),
  ('datenschutz', 'Datenschutz',            array['%datenschutz%','%dsgvo%','%daten gespeichert%','%sicher%','%server%','%speicher%'], 50),
  ('dauer',       'Ablauf und Dauer',       array['%wie lange%','%dauer%','%zeitraum%','%wann%','%frist%','%schnell%'], 60),
  ('kontakt',     'Kontakt und Ansprechpartner', array['%kontakt%','%telefon%','%email%','%e mail%','%erreich%','%ansprechpartner%','%adresse%','%oeffnungszeit%','%öffnungszeit%'], 70),
  ('support',     'Support und Probleme',   array['%problem%','%funktioniert nicht%','%fehler%','%support%','%hilfe%','%stoerung%','%störung%'], 80)
on conflict (slug) do nothing;

-- Kein Zugriff über die öffentlichen Schlüssel: Geschrieben und gelesen wird
-- ausschließlich serverseitig mit dem Service-Role-Key. RLS ohne Richtlinie
-- bedeutet: Für anon/authenticated ist hier nichts zu holen.
alter table public.wilma_clients  enable row level security;
alter table public.wilma_sessions enable row level security;
alter table public.wilma_events   enable row level security;
alter table public.wilma_messages enable row level security;
alter table public.wilma_topics   enable row level security;
