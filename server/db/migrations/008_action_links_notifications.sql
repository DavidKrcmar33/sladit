-- Odkaz rovnou do akce: kdo ho otevře a přijme, je přítel organizátora a účastník akce.
-- V databázi je jen otisk tokenu, stejně jako u ostatních odkazů.
create table action_links (
  id text primary key,
  token_hash text not null unique,
  action_id text not null references actions (id) on delete cascade,
  created_by text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index action_links_action on action_links (action_id);

-- E-mailová upozornění (pozvánka, navržený termín, domluveno). Vypnout jde v Nastavení.
alter table users add column email_notifications boolean not null default true;
