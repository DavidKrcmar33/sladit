# Čtení rozpisů: pipeline

Jak Sladit dostane z nahraného souboru směny, se kterými počítá kalendář a návrhy termínů. Kód je ve složce `src/llm/`, vstupní bod je `extractSchedule` v `src/llm/extract.ts`.

## Zásada

**Model čte a řeší nejednoznačnost, kód počítá.** Model popíše, co v podkladu vidí (bloky, časy, opakování, poznámky). Kód z toho spočítá konkrétní dny, ohlídá nesmysly a rozhodne, čemu se dá věřit. Chyba se nesmí stát potichu: když si pipeline není jistá, řekne to varováním nebo označí směnu jako nejistou.

## Přehled

```
soubory ─► ingest.ts ─► 1 Rozpoznání ─► 2 Strukturální čtení ─► 3 Převod na data ─► 4 Kontroly ─► zdroj
           (příprava)    (model)          (model, stejné volání)   (kód, expand.ts)     (kód, checks.ts)
                                                                                         │
                                                             při nejistotě druhé čtení ◄─┘

zdroje člověka + ruční úpravy ─► skládání (core/compose.ts) ─► rozpis pro akci ─► plánovač
```

Výsledkem čtení je **zdroj**: celý podklad s vlastním pokrytím, neořezaný na období akce. Rozpis, se kterým počítá plánovač, se skládá ze všech zdrojů člověka a jeho ručních úprav až pro konkrétní akci (oddíl Skládání rozpisu).

Fáze 1 a 2 jsou jedno volání modelu. Rozpoznání jsou první tři pole odpovědi, takže si model podklad zařadí dřív, než začne číst, a nestojí to druhé volání.

| Fáze                 | Kdo           | Soubor                                | Co dělá                                                                                                                           |
| -------------------- | ------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Příprava             | kód           | `ingest.ts`                           | Obrázek a PDF pošle modelu přímo, z Excelu vezme viditelnou část a převede ji na text s adresami a barvami buněk, text nechá být. |
| 1 Rozpoznání         | model + kód   | `reading.ts`, `extract.ts` (`triage`) | Typ podkladu, čitelnost, zda jde o jednu osobu. Kód podle toho podklad odmítne nebo pustí dál.                                    |
| 2 Strukturální čtení | model         | `reading.ts`, `skill/`                | Legenda, pokryté období, bloky s datem a opakující se bloky. U každého bloku místo v podkladu.                                    |
| 3 Převod na data     | kód           | `expand.ts`                           | Rozepíše opakování na dny celé platnosti, označí bloky lichého a sudého týdne, vyřadí výjimky.                                    |
| 4 Kontroly           | kód (+ model) | `checks.ts`, `extract.ts`             | Pravidla nezávislá na modelu a při nejistotě druhé, nezávislé čtení.                                                              |

Jméno člověka se modelu neposílá. Všechny soubory nahrané k jednomu člověku se berou jako jeho, jména uvnitř podkladu nehrají roli.

Modelu jde jen to, co uživatel v podkladu vidí. Název souboru se neposílá, protože v něm bývá jméno, podklady se jen číslují („Podklad 1:“). Z Excelu se neposílají skryté listy, řádky a sloupce, ani řádky schované filtrem. Za skrytý se bere i sloupec s nulovou šířkou. Když ve skrytých částech něco bylo, dozví se to uživatel z poznámek ke čtení. Když kvůli tomu není co číst vůbec, řekne to hláška u člověka („V podkladu není co číst.“ a věta o skrytém obsahu).

Jedna mezera zůstává: řádek s nulovou výškou, který nemá příznak skrytí, se pošle. Knihovna ExcelJS nulovou výšku řádku nevrací, takže ho nejde poznat. Testy pokrývají i zápis, jaký používá LibreOffice (`hidden="true"` a `hidden="false"`).

## Fáze 1: Rozpoznání

Model vyplní tři pole a kód (`triage` v `extract.ts`) na ně reaguje:

| Pole           | Hodnoty                                                      | Co s tím kód udělá                                                                                                                                           |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `documentKind` | `timetable`, `table`, `list`, `message`, `calendar`, `other` | Nic, slouží měření a budoucí paměti formátů.                                                                                                                 |
| `readability`  | `good`, `partial`, `unreadable`                              | `unreadable`: chyba `UnreadableSourceError`, uživatel uvidí „Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.“ `partial`: varování a druhé čtení. |
| `people`       | `one`, `many`, `unclear`                                     | `many`: nevrátí se žádná směna a zobrazí se varování, protože bez jména nejde poznat, čí řádek je správný. `unclear`: druhé čtení.                           |

## Fáze 2: Strukturální čtení

Model nevrací hotové směny, ale popis podkladu podle `ReadingSchema` (`reading.ts`):

| Pole         | Význam                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `legend`     | Shrnutí legendy jednou nebo dvěma větami. Je před bloky, aby si model značení ujasnil dřív, než začne číst.                                |
| `weekParity` | `calendar`, když podklad výslovně říká, že se lichý a sudý týden počítá podle kalendáře. Jinak `unstated` a lichý týden potvrdí člověk.    |
| `coverage`   | Období, která podklad pokrývá (platnost rozvrhu, měsíc tabulky). Neořezává se na hledané období. Prázdné, když to z podkladu nejde poznat. |
| `dated`      | Bloky s konkrétním datem. Mají navíc `weekday`: den v týdnu tak, jak je u data napsaný v podkladu.                                         |
| `weekly`     | Bloky, které se opakují každý týden: `weekday`, `weeks` (`every`, `odd`, `even`) a `exceptDates` (dny, kdy blok odpadá).                   |
| `warnings`   | Co model nepřečetl nebo si není jistý, česky.                                                                                              |

Model vrací všechny bloky podkladu, i mimo hledané období. Hledané období mu slouží jen k určení roku. Díky tomu se nezahodí noční směna z večera před obdobím a zdroj jde použít i pro jinou akci nebo po změně období.

Každý blok má `start`, `end`, `label`, `raw` (přesný text z podkladu), `uncertain` a `source` (kde v podkladu údaj je, například `Rozpis!C4` nebo „strana 1, řádek St, sloupce 13:00–14:50“). `source` se ukládá ke směně a editor dne ho ukazuje, takže jde každý údaj dohledat.

Instrukce pro model jsou v `skill/SKILL.md`, slovník běžných značek v `skill/glossary.md` a vzorové dvojice vstup a výstup v `skill/examples/`. Všechno se skládá do systémové instrukce v `skill.ts`. Test v `skill.test.ts` hlídá, že každý příklad odpovídá schématu.

Při neplatné odpovědi (neprojde `ReadingSchema`) se model zeptá ještě jednou a dostane seznam chyb. Druhá neplatná odpověď je chyba.

## Fáze 3: Převod na data

`expandReading(reading, from, to)` v `expand.ts`, čistá funkce bez sítě:

- **Pokrytí.** Seznam úseků z `coverage`, neořezaný. Když chybí, u týdenního vzoru se počítá s hledaným obdobím a přidá se varování, u bloků s datem se vezme první až poslední den, který má směnu. Dva oddělené úseky zůstanou oddělené a dny mezi nimi neznámé.
- **Bloky s datem.** Všechny. Den směny mimo uvedené pokrytí se k pokrytí přidá, protože směna dokazuje, že podklad ten den zná. Mezera mezi ním a pokrytím se nevyplní.
- **Týdenní vzor.** Opakuje se v každém pokrytém dni podle dne v týdnu, kromě výjimek. Mimo platnost rozvrhu se neopakuje. Blok jen pro lichý nebo sudý týden se zapíše do obou se značkou `weeks`, protože který týden je lichý, se rozhodne až při skládání.
- **Kontrola data.** Když je u data v podkladu napsaný jiný den v týdnu, než na který datum vychází, směna se označí jako nejistá. Odhalí to hlavně špatně odvozený rok nebo měsíc.
- **Duplicity.** Stejná směna ze dvou souborů se vrátí jednou. Lichý a sudý blok ve stejný čas jsou dva různé bloky.
- **Podklad nic neříká o hledaném období.** Zdroj se uloží celý a přidá se varování. V hledaném období nic nepřidá, takže všechny jeho dny vyjdou jako „rozpis chybí“.

Proč to dělá kód: počítání týdnů a dnů je přesně místo, kde se modely pletou, a v kódu jde otestovat (`expand.test.ts`, `core/time.test.ts`).

## Fáze 4: Kontroly

### Pravidla (`applyChecks` v `checks.ts`)

Podezřelou směnu nemažou. Označí ji jako nejistou a napíšou proč, rozhodnutí zůstává na člověku.

| Pravidlo                                         | Proč                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Směna delší než 16 hodin                         | Typická záměna času nebo spojení dvou směn.                                                                                                               |
| Dvě směny se překrývají (i noční do dalšího dne) | Špatně přečtený čas nebo dvojí zápis. Směny, které na sebe jen navazují, jsou v pořádku. Lichý a sudý blok se nepřekrývají, nikdy nenastanou spolu.       |
| Blok z týdenního vzoru vychází na státní svátek  | Pravidelný rozvrh ten den nemusí platit. Směny s konkrétním datem se neoznačují, na směny se o svátcích chodí. Všechny svátky semestru jsou v jedné větě. |
| V hledaném období není žádná směna               | Brání tiché chybě „model nic nenašel“. Může to být i skutečné volno, proto jen varování.                                                                  |

České svátky včetně Velikonoc počítá `core/holidays.ts`.

### Druhé čtení

Když si model nebyl jistý (`readability: partial`, `people: unclear` nebo aspoň jeden blok s `uncertain`), přečte se podklad podruhé s pokynem číst nezávisle a pomalu. Obě čtení se převedou na data a porovnají (`reconcile`):

- směna, na které se čtení shodnou, je jistá, i když jedno z nich váhalo,
- směna nejistá v obou čteních zůstane nejistá,
- směna jen z jednoho čtení zůstane, ale jako nejistá, a varování vyjmenuje, na čem se čtení neshodla.

Když druhé čtení selže, zůstane první s varováním. Druhé čtení zdvojnásobí cenu, ale jen u podkladů, kde je to potřeba. Jde vypnout a jde pro něj nastavit jiný model (proměnné serveru a měření):

```
LLM_VERIFY=off
LLM_VERIFY_MODEL=<id modelu>
```

## Doptání po čtení

Co z podkladu jistě vyčíst nejde, se aplikace zeptá v okně „Doptání k podkladu“, které po čtení vyskočí přes stránku. Když ho člověk zavře, nad kalendářem zůstane připomínka se zbývajícími otázkami. Otázky vznikají pravidly z čtení, ne modelem (`findQuestions` v `src/llm/review.ts`):

| Otázka                    | Kdy vznikne                                                              | Odpovědi                            |
| ------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Na jaké období platí?     | Týdenní rozvrh bez data platnosti. Do odpovědi platí hledané období.     | Od–do (nejvýš rok), Nevím           |
| Platí i ve svátek?        | Pravidelný blok vychází na státní svátek.                                | Ve svátek neplatí, Platí, Nevím     |
| Je to tak? (nejistý blok) | Nejisté čtení. Stejný text a časy jsou jedna otázka pro všechny výskyty. | Ano, Jiný čas, Není to směna, Nevím |
| Lichý, nebo sudý týden?   | Jako dřív (`findParityQuestions`), jen v okně doptání.                   | Lichý, Sudý                         |

Server u podkladu uloží strukturální čtení (`basis`: jedno nebo dvě čtení, hledané období, poznámky) a všechny odpovědi. Po každé odpovědi se podklad přepočítá znovu od začátku (`buildSource`): odpovědi upraví čtení (platnost, volné dny), pak převod na data, porovnání dvou čtení, opravy bloků a svátků a kontroly. Výsledek proto nezávisí na pořadí odpovědí a samotné čtení (`extractWithReport`) jde stejnou cestou bez odpovědí. Po odpovědi na období vypadnou i poznámky modelu o chybějící platnosti. Server při startu přepočítá všechny podklady s doptáním, takže se oprava přepočtu projeví i u už zodpovězených. Podklady přečtené před doptáním čtení uložené nemají a doptat se k nim nejde.

### Odpověď vlastními slovy

Do okna jde napsat i větu, třeba „platí to od prosince do února, o Vánocích nepracuju“. Server ji pošle modelu (`src/llm/clarify.ts`) spolu se shrnutím čtení (druh podkladu, legenda, bloky, směny), otevřenými otázkami a dnešním datem. Jména ani názvy souborů ne.

- Model vrací ploché schéma bez variant (období, volné dny, svátky, opravy bloků) a krátkou větu, co pochopil, nebo doplňující otázku.
- Kód z toho sestaví stejné odpovědi jako z tlačítek a každou ověří. Opravit jde jen blok, na který se aplikace ptá. Co neprojde (třeba platnost delší než rok), se zahodí.
- Nic se neuloží hned. Server spočítá, co se v rozpisu změní („Platnost: … → …“, „Změní se čas: 4 …“), a člověk změny potvrdí tlačítkem „Použít změny“, nebo je zahodí.
- Každá zpráva je jedno volání modelu a počítá se do denního limitu čtení.

## Skládání rozpisu

`composeSchedule` v `core/compose.ts`, čistá funkce bez sítě. Ze zdrojů a ručních úprav jednoho člověka složí rozpis pro období akce. Plánovač dostane jen tento hotový rozpis.

- **Okruhy.** Každý zdroj patří do okruhu: Práce, Škola, případně Další práce. Výchozí okruh určí typ podkladu (rozvrh je Škola), uživatel ho může změnit. Zdroje stejného okruhu se sčítají, třeba listopad a prosinec. Den je známý, jen když ho pokrývá každý okruh, který člověk má. Rozvrh do 18. 12. a směny do 6. 12. tak dají po 6. 12. „nevíme“, ne volno.
- **Dva zdroje stejného okruhu pro stejné dny** se sčítají a přidá se varování. Může jít o novou verzi rozpisu, pak má uživatel starší zdroj odebrat.
- **Ruční úprava dne** pokrývá přesně svůj den a nahradí směny, které ten den začínají. Nové čtení ji nepřepíše, zrušit jde v editoru dne („Vrátit podle podkladů“).
- **Lichý a sudý týden** (`core/parity.ts`). Když podklad říká „dle kalendáře“, platí číslo týdne v roce. Jinak se aplikace zeptá, zda je daný týden lichý, nebo sudý, a dál střídá po sedmi dnech. Potvrzení platí jen do nejbližší přestávky ve výuce (Vánoce 23. 12. až 1. 1., konec ledna, léto), protože fakulty po přestávce často počítají znovu. Dokud odpověď chybí, počítá se s oběma bloky jako s nejistými a rozpis má varování.
- **Pro akci** se vrátí období akce a den před ním i po něm: noční z předvečera blokuje první ráno a směna po půlnoci poslední večer.

Plánovač (`core/scheduler.ts`) pak rozhoduje takto: „nemůže“, kdykoli do času zasahuje známá směna, i v neznámém dni. „Může“ jen tehdy, když nic neznámého nemůže zasáhnout: den je známý, předchozí den je známý nebo čas začíná až po 14:00 (noční z předvečera končí nejpozději tehdy, delší směnu než 12 hodin zákoník práce nedovoluje) a další den je známý nebo čas končí do 23:00. Ve zbytku „nevíme“. Pravidlo ověřuje náhodný test proti hrubé síle (`scheduler.property.test.ts`), který zkouší každé doplnění neznámých dnů.

## Co uvidí uživatel

| Situace                         | Kde se to projeví                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Varování z čtení i z kontrol    | Panel „Poznámky ke čtení“ nad kalendářem a v editoru dne.                         |
| Nejistá směna                   | Čárkovaný okraj buňky, upozornění „Nejistá čtení“ a text v editoru dne.           |
| Místo údaje v podkladu          | Řádek „V podkladu: …“ pod směnou v editoru dne.                                   |
| Skrytý obsah v Excelu           | Věta v panelu „Poznámky ke čtení“, že se skryté listy, řádky nebo sloupce nečtou. |
| Rozvrh s lichými a sudými týdny | Otázka „Týden 23.–29. 11. je lichý, nebo sudý?“ v okně doptání nad kalendářem.    |
| Bez data, nejistota, svátky     | Okno „Doptání k podkladu“ přes stránku. Připomínka nad kalendářem a „Upřesnit“.   |
| Okruh podkladu                  | Výběr Práce, Škola, Další práce u podkladu v panelu Kdo jde.                      |
| Ruční úprava dne                | V editoru dne věta „Den je upravený ručně“ a tlačítko „Vrátit podle podkladů“.    |
| Nečitelný podklad, limit, chyba | Hláška u člověka v kroku Podklady a tlačítko „Zkusit znovu“.                      |

## Měření po fázích

`npm run eval` (podrobnosti v README) měří kromě celkové přesnosti i jednotlivé fáze:

- **Rozpoznání:** kolikrát model určil správný typ podkladu (`kinds` v `meta.json`).
- **Druhé čtení:** u kolika podkladů se spustilo a kolik neshod našlo.
- **Kontroly:** kolik vrácených směn je označených jako nejistých a hlavně kolik chybně vrácených směn **nemá** označení nejistoty. To jsou tiché chyby a je to nejdůležitější číslo pro důvěru v nástroj.
- **Převod na data** se neměří modelem, je pokrytý testy. Testovací sada má dva týdenní rozvrhy (`s21`, `s22`) s ručně vypsanými očekávanými směnami, které ověřují celou cestu včetně lichých a sudých týdnů. Odpověď na otázku po lichém týdnu, kterou by dal člověk, je v jejich `meta.json` (`weekParity`).
- Přečtený zdroj se před porovnáním složí pro hledané období stejně jako v aplikaci a porovnávají se jen směny v tomto období.
- **Falešné „může“:** v návrzích z přečtených rozpisů se u každého, kdo „může“, ověří proti správným směnám, že opravdu může. Cíl je 0.
- **Jistý, nebo křehký termín** (`core/sensitivity.ts`): ve skupinách se schovají rozpisy jednomu nebo dvěma lidem. Verdikt „jistý“ nesmí po odkrytí vyjít jinak (cíl 0 porušení). Zpráva dál uvádí, kolik dvojic člověk–den analýza jmenovala, a kolik nejistých čtení může změnit nejlepší termín.

### Testovací data

`npm run eval:data` (jen macOS) vyrobí rozpisy `s01`–`s25` a skupiny `g01`–`g23`. Už vykreslené podklady nepřepisuje, protože nové vykreslení PDF a snímků změní bajty a s nimi dotazy na model, takže by se zahodila cache. Všechno znovu vykreslí `npm run eval:data -- --force`.

| Skupiny     | Co ověřují                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `g01`–`g10` | Běžné skupiny 4–6 lidí na týden.                                                                                                              |
| `g11`–`g20` | Skupiny 5–8 lidí, ve kterých termín pro všechny neexistuje (pro náhradní termín a „co by pomohlo“).                                           |
| `g21`–`g23` | Na dva týdny se studenty, kteří mají liché a sudé bloky v různých časech (`s23`–`s25`). Hlídají, že nikdo nevyjde jako „může“, když má výuku. |

Rozvrh `s23` říká „dle kalendáře“, u `s24` fakulta počítá týdny výuky jinak než kalendář a u `s25` odpověď člověka s kalendářem souhlasí. Týmové tabulky s řádky více lidí přibudou s funkcí Můj řádek.

Cache v `eval/results/cache/requests/` ukládá surové odpovědi modelu podle obsahu dotazu. Změna kódu (`expand`, `checks`, `compose`) se tak přepočítá zdarma, změna instrukcí nebo přípravy podkladu vytvoří nové dotazy sama. `PIPELINE_VERSION` v `eval/run.ts` zvyš, jen když chceš vynutit nové odpovědi pro stejné dotazy.

### Výsledky

Měření z 19. 11. 2026, model `claude-opus-5-5`, 22 podkladů a 10 skupin, po změnách z toho dne (model čte celý podklad a vrací `weekParity`, nedostává název souboru ani skrytý obsah Excelu). Celá zpráva je v `eval/results/2026-11-19.md`. Výsledek je stejný jako 18. 11. před změnami.

| Co                                            | Výsledek                         | Cíl    |
| --------------------------------------------- | -------------------------------- | ------ |
| Správně přečtené směny (recall)               | 110 ze 110, 100 %                | ≥ 90 % |
| Vrácené směny, které jsou správně (precision) | 110 ze 110, 100 %                |        |
| Správný termín mezi 3 návrhy                  | 10 z 10 skupin                   | ≥ 80 % |
| Rozpoznání typu podkladu                      | 22 z 22                          |        |
| Druhé čtení                                   | spuštěno u 3 z 22, žádná neshoda |        |
| Směny označené jako nejisté                   | 12 ze 110                        |        |
| Chybné směny bez označení nejistoty           | 0                                | 0      |

Podle formátu vyšlo 100 % u xlsx (7), textu (6), PDF (6) i snímků (3), včetně obou týdenních rozvrhů.

Po tomto měření přibyly tři rozvrhy (`s23`–`s25`) a 13 skupin (`g11`–`g23`), viz Testovací data. Na modelu ještě neměřené.

**Jak ta čísla číst.** Testovací podklady jsou vygenerované: čistý text, tabulky a z nich vykreslené PDF a snímky. Není mezi nimi žádná skutečná fotka výtisku, rozmazaný snímek ani rukou psaný rozpis, takže 100 % říká, že pipeline na čistých podkladech nechybuje, ne že nechybuje nikdy. Dvanáct nejistých směn jsou hlavně rozpisy bez legendy, kde se časy značek berou ze slovníku. Byly přečtené správně, označení je tam záměrně.

## Jak pipeline měnit

- **Model čte něco špatně:** uprav `skill/SKILL.md` nebo přidej příklad do `skill/examples/` (dvojice `<název>.txt` a `<název>.json` podle `ReadingSchema`). Příklad nesmí být z testovací sady v `eval/data/`.
- **Nové pole ve čtení:** přidej ho do `ReadingSchema`, do instrukcí a do příkladů. Test příkladů selže, dokud neodpovídají.
- **Nová kontrola:** přidej pravidlo do `applyChecks` s testem. Pravidlo má označit a vysvětlit, ne mazat.
- Po každé změně pusť `npm test` a `npm run eval`.

## Co zatím chybí

- Předzpracování fotek (oříznutí, narovnání, kontrast). Čitelnost teď posuzuje jen model.
- Odkaz na místo v podkladu je text, ne souřadnice. Zvýraznění přímo v náhledu souboru není.
- Paměť formátů a učení z oprav. Doptání se ptá znovu u každého nového podkladu.
- Doptání vlastními slovy zatím nemá vlastní měření v `eval/`.
- Výběr „můj řádek“ u týmových tabulek. Podklad s více lidmi se teď nečte vůbec. U Excelu pomůže ostatní řádky skrýt nebo vyfiltrovat, modelu pak jde jen viditelný řádek (na modelu zatím neměřeno).
- Fotky a PDF se posílají celé tak, jak jsou, i s metadaty souboru (u fotky třeba místo pořízení, pokud ho telefon uložil).
