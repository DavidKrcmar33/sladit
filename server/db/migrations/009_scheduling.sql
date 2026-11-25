-- Domluva termínu v reálném světě:
-- ideální začátek, víkendové okno a nejmenší počet lidí u akce,
-- nezbytní účastníci a připomenutí rozpisu u pozvánky,
-- hlasování o několika termínech.

alter table actions add column preferred_start text;
alter table actions add column weekend_window_start text;
alter table actions add column weekend_window_end text;
alter table actions add column min_people integer;
-- Do kdy mají účastníci hlasovat. Prázdné = bez lhůty.
alter table actions add column poll_deadline timestamptz;

-- Bez nezbytného účastníka se termín nenavrhne (organizátor je nezbytný vždy).
alter table action_invites add column required boolean not null default false;
-- Kdy organizátor naposledy poprosil o rozpis. Účastník to uvidí jako upozornění.
alter table action_invites add column reminded_at timestamptz;

-- Termíny v hlasování. Hlasování skončí, když organizátor jeden vybere nebo ho zruší.
create table action_candidates (
  id text primary key,
  action_id text not null references actions (id) on delete cascade,
  date text not null,
  start_time text not null,
  end_time text not null,
  position serial,
  created_at timestamptz not null default now()
);
create index action_candidates_action on action_candidates (action_id);

-- Hlas účastníka: můžu, když bude nutné, nemůžu.
create table candidate_votes (
  candidate_id text not null references action_candidates (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  vote text not null check (vote in ('yes', 'maybe', 'no')),
  voted_at timestamptz not null default now(),
  primary key (candidate_id, user_id)
);
create index candidate_votes_user on candidate_votes (user_id);
