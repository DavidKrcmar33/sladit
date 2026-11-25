-- Poznámky ke čtení, které vlastník podkladu skryl. Zůstanou skryté i po přepočtu podkladu.
alter table sources add column dismissed_warnings jsonb not null default '[]';
