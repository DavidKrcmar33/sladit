-- Google Kalendář: připojení, obsazenost a události zapsané z potvrzených akcí.

create table calendar_connections (
  user_id text primary key references users (id) on delete cascade,
  -- Obnovovací token, zašifrovaný klíčem z TOKEN_ENCRYPTION_KEY (server/crypto.ts).
  refresh_token text not null,
  -- Uživatel může v souhlasu odškrtnout zápis, pak jde jen číst obsazenost.
  can_write boolean not null,
  auto_write boolean not null default false,
  status text not null default 'ok' check (status in ('ok', 'expired')),
  -- Kalendář „Sladit“, který si aplikace založila pro zápis akcí.
  app_calendar_id text,
  -- Obsazenost jako směny v pražském čase (Shift[]). Jen časy, žádné názvy událostí.
  busy jsonb not null default '[]',
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table calendar_events (
  user_id text not null references users (id) on delete cascade,
  action_id text not null references actions (id) on delete cascade,
  calendar_id text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, action_id)
);
create index calendar_events_action on calendar_events (action_id);
