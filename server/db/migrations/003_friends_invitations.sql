-- Přátelé, pozvánky do akcí a potvrzený termín.
-- Akce už nepatří skupině: účastní se jí organizátor a ti, kdo pozvánku přijali.
-- Skupina zůstává jako seznam lidí, které jde pozvat najednou.

-- Přátelství je vzájemné. Dvojice je uložená jednou, menší id první.
create table friendships (
  user_a text not null references users (id) on delete cascade,
  user_b text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b on friendships (user_b);

-- Osobní odkaz „přidej si mě do přátel“. V databázi je jen otisk tokenu.
create table friend_invites (
  id text primary key,
  token_hash text not null unique,
  created_by text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index friend_invites_user on friend_invites (created_by);

-- Pozvánka do akce. Do výpočtu termínu se člověk započítá až po přijetí.
create table action_invites (
  action_id text not null references actions (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  status text not null check (status in ('invited', 'accepted', 'declined')),
  position serial,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (action_id, user_id)
);
create index action_invites_user on action_invites (user_id);

-- Termín, který organizátor potvrdil.
alter table actions
  add column confirmed_date text,
  add column confirmed_start text,
  add column confirmed_end text;

-- Akce ve skupinách z fáze 4: členové, kteří se jich účastnili, je mají přijaté.
insert into action_invites (action_id, user_id, status, responded_at)
select a.id, m.user_id, 'accepted', now()
from actions a
join memberships m on m.group_id = a.group_id
where m.user_id <> a.owner_id;

update actions set group_id = null where group_id is not null;
