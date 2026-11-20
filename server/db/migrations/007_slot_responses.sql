-- Odpovědi na navržený termín akce: jdu, nejdu, nebo navrhuji jiný (protinávrh).
-- Prázdná odpověď znamená, že účastník ještě neodpověděl. Organizátor jde vždy, tady není.

alter table action_invites
  add column slot_response text check (slot_response in ('going', 'not_going', 'counter'));
alter table action_invites add column counter_date text;
alter table action_invites add column counter_start text;
alter table action_invites add column counter_end text;

-- Kdo už má potvrzený termín v kalendáři (dřívější potvrzení bez odpovědí), ten jde.
update action_invites ai set slot_response = 'going'
where ai.status = 'accepted' and exists (
  select 1 from calendar_events ce where ce.action_id = ai.action_id and ce.user_id = ai.user_id
);
