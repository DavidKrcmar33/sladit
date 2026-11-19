-- Skupiny, členství a pozvánky odkazem. Akce může patřit skupině: pak se jí účastní všichni členové.

create table groups (
  id text primary key,
  name text not null,
  position serial,
  created_at timestamptz not null default now()
);

create table memberships (
  group_id text not null references groups (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  -- Zakladatel zve, ruší pozvánky, odebírá členy a může skupinu smazat.
  role text not null check (role in ('owner', 'member')),
  position serial,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index memberships_user on memberships (user_id);

-- Pozvánka je náhodný token v odkazu. V databázi je jen jeho otisk, platnost a případné zrušení.
create table invites (
  id text primary key,
  token_hash text not null unique,
  group_id text not null references groups (id) on delete cascade,
  created_by text references users (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_group on invites (group_id);

-- Akce bez skupiny je osobní (organizátor a jeho hosté). Akce ve skupině patří i ostatním členům.
alter table actions add column group_id text references groups (id) on delete cascade;
create index actions_group on actions (group_id);
