-- Účty, relace, lidé s rozpisy po zdrojích, akce a limity čtení.
-- Data jsou text YYYY-MM-DD, ne typ date: ovladač by je jinak převáděl přes časové pásmo.

create table users (
  id text primary key,
  google_sub text not null unique,
  email text not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- V databázi je jen otisk tokenu relace. Únik tabulky tak nedá nikomu přístup.
create table sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

-- Rozpracované přihlášení přes Google: stav a ověřovač PKCE, platí pár minut.
create table oauth_states (
  state text primary key,
  verifier text not null,
  purpose text not null,
  user_id text references users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Člověk s rozpisem. Uživatel má jednoho sám za sebe (is_self) a hosty, které přidal.
create table people (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  -- Pořadí založení. Čas nestačí: v jedné transakci je pro všechny stejný.
  position serial,
  is_self boolean not null default false,
  name text not null,
  created_at timestamptz not null default now()
);
create index people_owner on people (owner_id);
create unique index people_one_self on people (owner_id) where is_self;

-- Přečtený podklad. Směny, pokrytí a parita jsou JSON podle schémat v src/core/schema.ts.
-- Obsah souborů se neukládá, jen jejich názvy pro vlastníka.
create table sources (
  id text primary key,
  person_id text not null references people (id) on delete cascade,
  position serial,
  circle text not null,
  files jsonb not null,
  coverage jsonb not null,
  shifts jsonb not null,
  warnings jsonb not null,
  parity jsonb not null,
  created_at timestamptz not null default now()
);
create index sources_person on sources (person_id);

-- Ruční úprava jednoho dne. Nové čtení ji nepřepíše.
create table day_overrides (
  person_id text not null references people (id) on delete cascade,
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  shifts jsonb not null,
  primary key (person_id, date)
);

create table actions (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  position serial,
  name text not null,
  date_from text not null,
  date_to text not null,
  duration_minutes integer not null,
  window_start text not null,
  window_end text not null,
  created_at timestamptz not null default now()
);
create index actions_owner on actions (owner_id);

create table action_participants (
  action_id text not null references actions (id) on delete cascade,
  person_id text not null references people (id) on delete cascade,
  position serial,
  primary key (action_id, person_id)
);

-- Počet čtení modelem za den (podle času v Praze), kvůli limitům na uživatele a celkem.
create table read_usage (
  user_id text not null references users (id) on delete cascade,
  day text not null,
  count integer not null default 0,
  primary key (user_id, day)
);
