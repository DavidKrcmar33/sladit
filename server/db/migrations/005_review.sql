-- Doptání po čtení: strukturální čtení pro přepočet, odpovědi člověka a otevřené otázky.
-- Podklady přečtené dřív čtení nemají (basis je null) a doptat se k nim nejde.

alter table sources add column basis jsonb;
alter table sources add column answers jsonb not null default '[]';
alter table sources add column questions jsonb not null default '[]';
