# Nápady na další funkce

Katalog 49 nápadů, co by Sladit mohl umět dál, hlavně tam, kde umělá inteligence dělá skutečnou práci. Vznikl 18. a 19. 11. 2026. Nahoře je doporučení, co stavět jako první, pod ním celé pořadí a popis každé funkce.

## Jak seznam vznikl a jak ho číst

1. **Sto nápadů z deseti pohledů.** Skupina a organizátor, život směnaře, pojmy z předmětu Umělá inteligence, důvěra a soukromí, konkurence a stížnosti uživatelů, fotky a hlas, předpovědi a učení, agenti a automatizace, napojení na jiné služby, odvážné nápady. Po sloučení duplicit zbylo 49 funkcí (F01–F49).
2. **Tři hodnotitelé.** Každý oznámkoval všech 49 funkcí známkou 1–5 z jednoho úhlu: užitek pro uživatele, proveditelnost pro náš tým a kód, přínos AI a důvěra.
3. **Prověrka deseti nejlepších.** Skeptik měl za úkol funkci vyvrátit. Četl kód, ověřoval tvrzení na webu a kde to šlo, přepočítal slib funkce plánovačem nad správnými rozpisy z `eval/data`, bez volání modelu. Prvních pět funkcí prověřili dva skeptici (jeden z pohledu produktu, druhý z pohledu techniky a důvěry), dalších pět jeden, který měl oba pohledy najednou.
4. **Kritik úplnosti** hledal, co v seznamu chybí.

Hodnotitelé, skeptici i kritik byli agenti AI (Claude), ne lidé. Známky jsou podklad k diskusi, ne měření. Žádnou funkci neviděl skutečný uživatel a simulace běžely na vygenerovaných rozpisech z `eval/data` (22 rozpisů na jeden až dva týdny, směny na celé hodiny). Čísla ze simulací a fakta dohledaná na webu jsou převzatá z posudků. Než je použijete ve zprávě, ověřte si je.

V katalogu záměrně nejsou nápady z dřívějšího návrhu další verze: účty a skupiny, napojení na kalendář, hlasování, sledování změn rozpisu, akce z jedné věty, chat nad dostupností a doptávání na nejistá čtení.

## Co stavět jako první

Prověrka neschválila žádnou z deseti funkcí v původní podobě. U sedmi doporučila menší verzi, tři doporučila odložit. Důvod byl pokaždé podobný: slib funkce se po přepočtu plánovačem nad testovacími rozpisy zmenšil nebo zmizel.

| #   | Funkce                                    | Známka | Verdikt     | Co z ní zbylo                                           |
| --- | ----------------------------------------- | ------ | ----------- | ------------------------------------------------------- |
| 1   | F02 Na čem výsledek stojí                 | 5,0    | menší verze | Věta „jistý“ nebo „může se změnit“ u nejlepšího termínu |
| 2   | F01 Nejmenší ústupek                      | 4,7    | menší verze | Úprava akce a panel „Co by pomohlo“                     |
| 3   | F06 Podmínky účasti a role                | 4,3    | menší verze | Přepínač „musí být“ a „aspoň N lidí“                    |
| 4   | F14 Můj řádek a začernění v zařízení      | 4,1    | menší verze | Výběr řádku u Excelu a vloženého textu                  |
| 5   | F07 Dva termíny místo jednoho             | 3,8    | menší verze | Věta o náhradním termínu                                |
| 6   | F08 Plovoucí pravidelné setkání           | 3,7    | odložit     | Nanejvýš tlačítko „Další setkání“                       |
| 7   | F25 Čistopis rozpisu a export             | 3,7    | menší verze | Termín do kalendáře a text ke kontrole                  |
| 8   | F19 Harmonogram fakulty jako zdroj pravdy | 3,6    | menší verze | Potvrzení lichého a sudého týdne člověkem               |
| 9   | F21 Rozpoznání turnusu                    | 3,6    | odložit     | Nejdřív zjistit, kdo turnus má                          |
| 10  | F26 Výběr termínů zkoušek kolem směn      | 3,6    | odložit     | Nejdřív zkouška bez kódu s pěti studenty                |

### Návrh pořadí

Prověrky funkce mezi sebou neřadily. Tohle pořadí je úsudek z jejich výsledků a je k diskusi.

1. **Opravit tiché chyby, na které prověrky narazily.** Lichý a sudý týden potvrzením (č. 8), „Upravit akci“ s kontrolou, že se akce vejde do okna (č. 2), a noční směna z večera před obdobím. Týká se to toho, co aplikace dělá už dnes.
2. **Jistý, nebo křehký termín (č. 1).** Malá funkce, čistý kód, dá se změřit bez modelu a do zprávy dává nejsilnější pojem.
3. **Rozšířit testovací sadu.** Skupiny bez společného termínu, schované rozpisy, týmové tabulky, rozvrhy s lichým a sudým týdnem. Bez toho nejde změřit č. 1, 2, 4, 5 ani 8.
4. **Můj řádek (č. 4).** Odemkne týmové rozpisy, které se dnes nečtou vůbec.
5. **Malé doplňky.** Náhradní termín (č. 5), „musí být“ (č. 3), termín do kalendáře a text ke kontrole (č. 7), panel „Co by pomohlo“ (č. 2).
6. **Odložit.** Série setkání, turnus a zkoušky čekají na data, která dnes nejsou.

### Co mají prověrky společného

- **„Nevíme“ se nesmí změnit na „může“.** Dnes se to děje na několika místech. Ruční oprava jednoho dne udělala v simulaci z 19 nepřečtených dnů volno. Rozvrh a rozpis s různou platností se spojí do jednoho rozsahu. Noční směna z večera před obdobím se zahodí. Skoro každá funkce z první desítky na to narazila, proto má oprava přednost.
- **Data nejsou včas.** Rozpis bývá známý dny až týdny dopředu, takže všechno, co plánuje dál (série, turnus, zkoušky), nemá z čeho počítat.
- **Chytrý algoritmus neměl co řešit.** Při třech až osmi lidech a týdnu až měsíci stačí úplný výčet a trvá milisekundy. A\*, metoda větví a mezí ani dynamické programování nebyly potřeba u žádné funkce. Do zprávy to patří jako změřený výsledek, ne jako ostuda.
- **Čtení ořezává na období akce.** Brzdí to den navíc, turnus, měsíční přehled i sérii.
- **Chybí měření víc než funkce.** V testovací sadě je jediná skupina bez společného termínu, žádný týmový rozpis, žádný měsíční rozpis a žádná skutečná fotka.

### 1. Jistý, nebo křehký termín

Funkce F02 „Na čem výsledek stojí“, známka 5,0. Prověřili ji dva skeptici, oba říkají: postavit menší verzi.

**Původní nápad.** U nejlepšího termínu říct, na kterých nejistých čteních a chybějících rozpisech stojí, a místo „zkontroluj všechno“ položit jednu cílenou otázku.

**Co prověrka zjistila.**

- Cílená otázka nevychází. Skeptik schoval rozpisy v deseti testovacích skupinách a přepočítal návrhy. Když chybí jeden člověk (49 případů), stačí dnešní řádek „Neznámo: X“ a zeptat se X. Když chybí dva (99 případů), test „změním jednu věc a podívám se“ ve 24 případech ohlásil, že nikdo nerozhoduje, i když jiný den mohl mít víc lidí.
- Štítek „výsledek neovlivní“ by byl tichá chyba. Nejistá směna u nás znamená odhadnuté časy, ne pochybnost, jestli směna vůbec je: všech 12 nejistých směn v měření má důvod „Časy odhadnuty podle slovníku“. Zkouška „směna platí, nebo neplatí“ to nepozná. Štítek by dostalo 31 z 33 nejistých směn, přitom záměna časů změní vítězný termín ve 4 z 5 skupin.
- Odpověď na otázku není kam uložit. Schéma na ni nemá místo a ruční úprava dne roztahuje pokryté období.

**Co postavit.** Jen čtecí vrstvu, bez otázek, bez modelu a beze změny schématu, asi týden práce. Pro každý možný termín spočítat dolní a horní mez účasti: kdo může jistě a kdo by mohl, kdyby se doplnila chybějící data a potvrdila nejistá. Termín je jistý, když ho žádný jiný den nepředčí ani v nejlepším případě.

- `src/core/scheduler.ts`: nová čistá funkce vedle `findProposals`, k tomu zveřejnit `candidateSlots` a `evaluateSlot`. Druhý skeptik navrhuje samostatný modul `src/core/sensitivity.ts`.
- `src/session.ts`: nejistá čtení seřadit podle toho, jestli mohou změnit vítěze.
- `ProposalList.vue`: řádek „Jistý podle přečtených dat“ nebo „Může se změnit, záleží na Petrovi (čt, so)“.
- `UncertainNotice.vue`: „Nejistá čtení: 9, z toho 2 mohou změnit návrhy“.

**Jak poznat, že to funguje.** Verdikt „jistý“ nesmí selhat ani jednou: na 10 000 náhodných malých akcích proti hrubé síle a na skupinách g01–g10 se schovanými rozpisy. Výchozí stav z prověrky: vítěze mění 7 z 33 nejistých směn, první trojici 14 z 33.

**Pojem z předmětu.** Analýza citlivosti a rozhodování při neúplné informaci (nutný a možný vítěz). Skeptici doporučují nenazývat to hodnotou informace (VPI): žádná hodnota se tu nepočítá, jen se zjišťuje, co může změnit vítěze.

### 2. Upravit akci a „co by pomohlo“

Funkce F01 „Nejmenší ústupek“, známka 4,7. Prověřili ji dva skeptici, oba říkají: postavit menší verzi.

**Původní nápad.** Když žádný termín nevyhovuje všem, ukázat dvě až tři nejlevnější změny zadání (kratší akce, širší okno, den navíc, o jednoho člověka méně) i s dopadem a jedním klepnutím je vyzkoušet. Hledat je prohledáváním stavového prostoru s cenou.

**Co prověrka zjistila.**

- Ústupek většinou nic neodemkne. V náhodných skupinách z testovacích rozpisů chybí termín pro všechny asi u 8 % čtveřic, 21 % pětic a třetiny šestic. V těch případech změna do 60 minut odemkne plnou účast jen v 8–15 %, dalších 29–43 % by chtělo ústupek o dvě až tři hodiny a ve 42–62 % nepomůže nic, protože večer blokuje celá osmi- nebo dvanáctihodinová směna.
- Druhý skeptik došel ke stejnému na 32 variantách testovacích skupin bez společného termínu: změna do 60 minut existuje u 10 z nich a u 15 nepomůže žádná změna délky ani okna. Kombinace dvou ústupků nebyla nejlepším řešením ani jednou, takže prohledávání s cenou nemá co hledat.
- Ústupek „o jednoho méně“ už aplikace ukazuje: nejlepší návrh říká „Chybí: X“.
- Časové ústupky jsou křehké. Všech 17 doporučených termínů se dotýkalo něčí rezervy kolem směny, takže půlhodinová chyba ve čtení jedné směny udělá z „mohou všichni“ nepravdu.
- Pořadí ústupků je hodnotový soud. Čtyři rozumné způsoby, jak ústupky ocenit, se na nejlepším shodly jen u 15 z 32 variant.
- Akci dnes nejde po založení upravit. Schéma navíc pustí akci delší než denní okno a aplikace pak bez vysvětlení nevrátí žádný návrh.

**Co postavit.** Asi týden práce, bez modelu.

1. Obyčejné „Upravit akci“ s krokem zpět: `updateActionParams` v `src/core/actionEdits.ts`, metoda v `src/session.ts`, malý formulář u `ActionHeader.vue`. Užitečné samo o sobě. K tomu kontrola ve `src/core/schema.ts`, že se akce vejde do denního okna.
2. Nový čistý modul v `src/core` (`findConcessions`): vyjmenuje změny délky (nejméně 60 minut) a začátku a konce okna (nejdéle do 23:30) a vrátí nejvýš tři, po kterých mohou všichni. Jinak řekne, že nepomůže nic a kdo blokuje. Jednoduchých změn je kolem deseti a na ty stačí `findProposals`. Úplný výčet kombinací by přes něj trval minuty (36 ms na volání při osmi lidech a třiceti dnech), s předpočítanou tabulkou společného volna trvá 2–8 ms.
3. Panel „Co by pomohlo“ pod návrhy, jen když v nejlepším návrhu někdo chybí. Těsné ústupky a ty, které stojí na nejisté směně, označit „ověř“. Remízy ukázat, nevybírat za uživatele.

Vypustit: den navíc (čtení zahazuje směny mimo období), ústupek „o člověka méně“ (už je v návrzích), cenový model, A\* a větu od modelu.

**Jak poznat, že to funguje.** Každý nabídnutý ústupek po použití dá termín pro všechny a hrubá síla nenajde menší, na 32 variantách testovacích skupin bez jediné neshody. Když změnu do 60 minut dostane méně než pětina skupin bez společného termínu, dál do funkce neinvestovat.

**Pojem z předmětu.** Prohledávání stavového prostoru. Do zprávy patří i měření, že prostor je malý (nejvýš 18 tisíc stavů) a úplný výčet stačí.

### 3. „Musí být“ u jména

Funkce F06 „Podmínky účasti a role“, známka 4,3. Prověřili ji dva skeptici, oba říkají: postavit menší verzi.

**Původní nápad.** Podmínky zadané větou („aspoň čtyři ze šesti, určitě Bára, aspoň jeden řidič“). Model je přeloží na omezení a plánovač je řeší jako úlohu splňování omezení.

**Co prověrka zjistila.**

- Potřeba je vzácná. Konkrétní člověk chybí v nejlepším termínu ve 2 % případů u čtyř lidí a v 9 % u osmi, ve všech třech návrzích zároveň v méně než 0,5 %. Seznam návrhů navíc už dnes píše „Chybí: …“.
- Tvrdý filtr s hláškou „pravidla se vylučují“ by tvrdil nepravdu. Dostupnost má tři stavy a člověk bez přečteného rozpisu je „nevíme“ ve všech termínech, takže jako nutný by znemožnil úplně všechno. Příčinou jsou pak data, ne pravidla.
- „Úloha splňování omezení“ je tu jen nálepka: jedna proměnná a jednoduchá omezení. Role (řidič) nemají data.

**Co postavit.** Přepínač „musí být“ u jména a volbu „aspoň N lidí“, bez modelu, asi tři dny kódu.

- Jediný druh pravidla: aspoň k lidí z dané množiny. Výsledek má tři hodnoty: splněno, otevřené (záleží na někom, o kom nevíme), nesplněno.
- Pravidla nejsou filtr, ale první klíč řazení uvnitř `findProposals`, a to dřív, než se vybere nejlepší čas dne.
- `src/core/schema.ts`: pole `rules` s výchozí hodnotou `[]`, jinak `loadState` zahodí uložené akce. `removePerson` musí smazat i pravidla toho člověka.
- Zadání větou přes model až jako druhý krok, s testovací sadou aspoň 50 českých vět.

**Jak poznat, že to funguje.** Náhodný test proti hrubé síle na 1 000 akcích. „Nevíme“ se nikdy nepočítá jako splnění. Skupiny g01–g10 zůstanou na 10 z 10 a deset nových skupin s pravidlem vyjde 10 z 10.

**Pojem z předmětu.** Splňování omezení s třístavovou logikou. Ve druhém kroku převod věty na strukturovaná omezení.

### 4. Můj řádek v týmovém rozpisu

Funkce F14 „Můj řádek a začernění v zařízení“, známka 4,1. Prověřili ji dva skeptici, oba říkají: postavit menší verzi.

**Původní nápad.** Z týmového rozpisu vybrat svůj řádek a ostatní začernit přímo v zařízení, dřív než cokoli odejde modelu.

**Co prověrka zjistila.**

- Hodnotu nese „přečti můj řádek“, ne začernění. Podklad s více lidmi se dnes nečte vůbec.
- Začernění fotky je nespolehlivé a chybuje potichu. U měsíčního rozpisu patnácti lidí ujede vodorovný pás při náklonu fotky o 2° o celý řádek, takže výřez má vlevo moje jméno a vpravo směny kolegy. Kontroly to nepoznají, protože cizí směny jsou platné směny.
- Není na čem měřit. V testovací sadě není jediná fotka ani týmový rozpis.

**Co postavit.** „Můj řádek“ pro Excel a vložený text, čistým kódem, asi týden. Kód najde záhlaví s daty, řádky lidí a legendu, uživatel ťukne na svůj řádek a uvidí přesně text, který odejde modelu. Druhý skeptik navrhuje jinou cestu, která funguje i pro fotky a PDF: popisky řádků vrátí první volání modelu a člověk z nich vybere. Podklad pak ale odchází celý. Začernění fotek odložit, dokud nebude aspoň 15 skutečných fotek.

Část je hotová od 19. 11.: modelu už neodchází název souboru ani skryté listy, řádky a sloupce Excelu.

**Jak poznat, že to funguje.** Text pro model neobsahuje žádné cizí jméno ani buňku z cizího řádku. Žádná směna z cizího řádku neprojde bez označení nejistoty. Čtyři až šest nových týmových podkladů v testovací sadě s přesností aspoň 90 %.

**Pojem z předmětu.** Minimalizace dat před voláním modelu a multimodální čtení.

### 5. Náhradní termín

Funkce F07 „Dva termíny místo jednoho“, známka 3,8. Prověřili ji dva skeptici, oba říkají: postavit menší verzi.

**Původní nápad.** Když se parta nevejde do jednoho termínu, najít nejmenší sadu termínů, která pokryje všechny (množinové pokrytí metodou větví a mezí).

**Co prověrka zjistila.**

- Algoritmus nemá co řešit. Společný termín chybí u 18–23 % pětic, 33–41 % šestic a 64–71 % osmic, ale dva termíny stačily vždy, i u patnácti lidí. Třetí nebyl potřeba ani jednou a hladový postup dal stejný výsledek jako přesný.
- Výsledek už je na obrazovce. Dvojice, která pokryje všechny, je v 92–98 % případů mezi dnešními třemi návrhy.
- Skeptik navíc pochybuje, že by parta kvůli jednomu chybějícímu pořádala akci dvakrát. To ukáže až rozhovor s lidmi, kteří akce opravdu svolávají.

**Co postavit.** Jednu kartu pod návrhy s větou ke zkopírování, dva až tři dny práce: „Sára v pondělí 23. 11. nemůže. Může ve čtvrtek 26. 11. 17:00–19:00, kdy můžou i Lenka, Michal a Nela.“ V `src/core/scheduler.ts` nová čistá funkce (`findMakeupSlot`), která projde dvojice termínů hrubou silou. „Nevíme“ se nikdy nepočítá jako pokrytí.

**Jak poznat, že to funguje.** Shoda s hrubou silou na 1 000 náhodných skupinách, výpočet do 50 ms. Aspoň deset nových skupin bez společného termínu v testovací sadě (dnes je jediná, g05).

**Pojem z předmětu.** Množinové pokrytí. Do zprávy patří i zjištění, že na našich datech je úloha triviální.

### 6. Plovoucí pravidelné setkání: odložit

Funkce F08, známka 3,7. Prověřil ji jeden skeptik: odložit.

**Původní nápad.** Skupina zadá rytmus („deskovky zhruba jednou za 14 dní“) nebo cíl („šest schůzek do 15. 1.“) a aplikace naplánuje celou sérii tak, aby nikdo nevypadával opakovaně.

**Co prověrka zjistila.**

- Série nemá na čem stát. Rozpisy jsou známé nejvýš pár týdnů dopředu: zákoník práce zaručuje brigádníkovi na dohodu rozvrh tři dny předem, zaměstnanci dva týdny. V modelové simulaci bylo celé okno příštího setkání (za 10 až 18 dní) známé u všech jen v 0,6 % případů.
- Předběžné termíny dopadly skoro jako náhodné: účast 75,3 % proti 71,7 % u náhodného výběru. Plánování po jednom setkání mělo 96,1 %.
- Optimalizace série skoro nic nepřidá ani s úplnými daty: výběr po jednom má 96,3 % účasti, optimum 97,5 %. Přínos dělá plovoucí den, a ten aplikace umí už dnes pro každou akci zvlášť.
- Pokrytí je jeden souvislý rozsah. Rozvrh platný do 18. 12. a rozpis brigády do 6. 12. dají pokrytí do 18. 12. a večery mezi tím vyjdou jako „může“.

**Co z toho jde postavit teď.** Tlačítko „Další setkání“: nová akce se stejnými lidmi, délkou a oknem, období 10 až 18 dní po potvrzeném termínu, rozpisy prázdné s výzvou k nahrání. Volitelně přednost pro lidi, kteří minule chyběli. Skeptik sám říká, že přínos proti dnešku je malý.

**Kdy se k sérii vrátit.** Až bude server, kde si každý nahrává vlastní rozpis, pokrytí vedené po zdrojích a testovací skupiny s rozpisy na osm týdnů.

**Pojem z předmětu.** Optimalizace posloupnosti. Úplné prohledání 826 686 posloupností trvalo 26 ms, dynamické programování není potřeba.

### 7. Termín do kalendáře a text ke kontrole

Funkce F25 „Čistopis rozpisu a export“, známka 3,7. Prověřil ji jeden skeptik: postavit menší verzi.

**Původní nápad.** Z přečteného rozpisu čistý obrázek „moje směny tento měsíc“ a soubor do kalendáře, widgetu a hodinek. Užitek i pro jednoho člověka bez skupiny.

**Co prověrka zjistila.**

- Pro jednoho člověka dnešní aplikace nic nepřečte, čtení se spustí až od dvou lidí. A čte jen období akce: z měsíčního rozpisu se 16 směnami zůstanou čtyři.
- Export je jednorázový snímek. Rozpis se mění, soubor `.ics` zrušenou směnu nesmaže a widget pak ukazuje starou směnu s větší autoritou než fotka. Chyba tu znamená zmeškanou směnu, ne horší termín.
- Google Kalendář podle své nápovědy importuje soubor jen na počítači. Aplikací „fotka rozpisu do kalendáře“ našel skeptik v App Storu nejméně šest.
- Pro předmět nepřináší nic nového, AI tu pracuje jen na vstupu.

**Co postavit.** Dvě malé věci bez modelu a beze změny schématu.

- Tlačítko „Přidat termín do kalendáře“ u návrhu. Nový čistý modul `src/core/ics.ts`: místní čas, konec směny přes půlnoc až další den, řádky zalomené po 75 bajtech.
- Tlačítko „Poslat ke kontrole“ u člověka: text jeho přečtených směn po dnech ke zkopírování nebo sdílení. Vlastník rozpisu dnes výsledek čtení nikdy neuvidí, takže chyby nemá kdo odhalit. Neznámé dny vypsat jako neznámé a nejisté směny označit.

**Jak poznat, že to funguje.** Převod 110 správných směn z testovací sady dá 110 událostí, 28 nočních končí další den a sedí časy v noci na 25. 10. 2026 a 28. 3. 2027, kdy se mění čas. Ruční zkouška na iPhonu, na Androidu a v Google Kalendáři na počítači.

**Pojem z předmětu.** Žádný nový. Text ke kontrole je ale člověk ve smyčce a dá se měřit, kolik chyb čtení vlastník odhalí.

### 8. Potvrzení lichého a sudého týdne

Funkce F19 „Harmonogram fakulty jako zdroj pravdy“, známka 3,6. Prověřil ji jeden skeptik: postavit menší verzi.

**Původní nápad.** Lichý a sudý týden, děkanská volna a zkouškové brát z harmonogramu fakulty, který přečte model, místo z čísla týdne.

**Co prověrka zjistila.**

- Chyba je skutečná a velká. Na harmonogramech, které skeptik dohledal (FBMI ČVUT a 1. LF UK, dohromady 58 týdnů), má dnešní výpočet paritu špatně ve 42 týdnech. Přes Nový rok se rozvrh obrátí všem: týdny 53/2026 a 1/2027 jsou oba liché.
- Čtení harmonogramu je drahé řešení. Jedno potvrzení „tento týden je lichý“ a střídání po sedmi dnech mělo na stejných datech nula chyb. Harmonogram navíc přidá jen jeden až tři děkanské dny za semestr a každá fakulta ho píše jinak (tabulka, věty, poznámka pod čarou).
- Sdílet přečtený harmonogram mezi studenty bez serveru nejde.
- Harmonogram školy nesmí přepsat paritu pracovního rozpisu. Testovací podklad s22 je rozpis směn s lichým a sudým týdnem.
- Dopad na návrhy: student s lichým a sudým blokem v různých časech vyšel jako volný, i když měl výuku, v prvním návrhu ve 3,7 % simulací a v některém ze tří návrhů v 11,6 %. Varování dnes nevznikne žádné.

**Co postavit.** Asi týden práce.

- `src/llm/expand.ts`: parita z kotvy (datum a lichý, nebo sudý) místo z čísla týdne. Bez kotvy počítat blok v obou týdnech jako nejistý, aby člověk nikdy nevypadal falešně volný.
- Model z podkladu vyčte, jestli je parita „dle kalendáře“. Pak otázka odpadá.
- `PeoplePanel.vue`: přepínač „týden 23.–29. 11. je lichý, nebo sudý?“. Kotvu neprotahovat přes Vánoce bez nového potvrzení.
- Paritu držet u bloku, ne u osoby.

**Jak poznat, že to funguje.** S kotvou „16. 2. 2026 je lichý“ vyjde letní semestr FBMI správně ve 14 ze 14 týdnů (dnes 0). Pracovní rozpis s22 zůstane na 7 ze 7. Do testovací sady přidat aspoň tři rozvrhy s lichým a sudým blokem v různých časech. Návrhů, kde člověk „může“, ale má výuku, musí být nula.

**Pojem z předmětu.** Člověk ve smyčce místo dalšího čtení modelem a práce s nejistotou (blok v obou týdnech jako nejistý).

### 9. Rozpoznání turnusu: odložit

Funkce F21, známka 3,6. Prověřil ji jeden skeptik: odložit.

**Původní nápad.** Ze tří až čtyř týdnů směn poznat cyklus (krátký a dlouhý týden, 2-2-3) a po potvrzení ho promítnout dopředu jako zvláštní stav.

**Co prověrka zjistila.**

- Kdo má pevný turnus, zná ho zpaměti a řekne ho jednou větou. Kdo ho nemá, u toho se nic nenajde. Kolik pracujících studentů turnus má, nikdo neví.
- Aplikace historii nemá. Čtení nechává jen období akce: z 28 dní se 14 směnami zůstaly dvě.
- Detekce podle zadání selhává právě na krátkém a dlouhém týdnu. Ten má falešnou periodu pět dní se shodou 86 %. Promítnutí pak sedělo jen ve 20–27 % dní a 36–40 % dní vyšlo falešně jako volno.
- I správně určený cyklus se mýlí směrem, který škodí: při 10 % prohozených směn vyšlo 8 % promítnutých dní falešně jako volno.
- Otázku „platí to dlouhodobě?“ dostane organizátor, který nahrává cizí rozpisy a odpověď nezná.

**Co z toho jde postavit teď.** Nejdřív se zeptat pěti pracujících studentů, jestli turnus mají a jak dopředu znají směny. Pokračovat, jen když ho mají aspoň dva. Pak turnus zadaný šablonou, bez detekce: v `PeoplePanel.vue` volba „Mám pravidelný turnus“ (krátký a dlouhý týden, 2/2, 4/4, vlastní) a nová čistá funkce v `src/core`, která ze šablony a prvního dne cyklu vyrobí směny na období akce.

**Kdy se k detekci vrátit.** Až bude nasbíraná historie aspoň čtyř týdnů na člověka a účty, aby odhad potvrzoval vlastník směn. Pak porovnáním s katalogem šablon, ne autokorelací: katalog našel krátký a dlouhý týden ze čtyř týdnů v 86 % případů a u nepravidelného rozpisu vrátil falešný vzor v méně než 1 %.

**Pojem z předmětu.** Detekce periodicity. Zajímavý je i záporný výsledek: autokorelace s tolerancí výjimek na nejběžnějším turnusu selže.

### 10. Výběr termínů zkoušek: odložit

Funkce F26, známka 3,6. Prověřil ji jeden skeptik: odložit.

**Původní nápad.** Student vloží vypsané termíny zkoušek a aplikace ukáže dvě až tři kombinace s nejvíc volnými hodinami na učení a bez zkoušky po noční.

**Co prověrka zjistila.**

- Hlavní vstup v době rozhodování chybí. Termíny se vypisují v prosinci, rozpis směn na leden a únor tou dobou většinou není. V simulaci s rozpisem jen na leden bylo 40 % termínů „nevíme“. Když se „nevíme“ počítalo jako volno, doporučení kolidovalo se skutečnou směnou ve 44–68 % případů.
- Optimalizace nic nepřidává. Prostý filtr kolizí a rozestup zkoušek vybere stejnou kombinaci v 89–91 % případů.
- Výpis termínů nenese vše potřebné. Konec zkoušky, kapacita a údaj, jestli je termín řádný, nebo opravný, jsou ve školním systému až v detailu termínu.
- Student plánuje po krocích. O termíny se soutěží, další se vypisují průběžně a přehlásit se dá den nebo dva předem.

**Co z toho jde postavit teď.** Nic. Nejdřív zkouška bez kódu při prosincovém zápisu: pět studentů se směnami, jejich výpis a rozpis, stavy termínů spočítané skriptem. Pokračovat, jen když aspoň tři z pěti mají při zápisu rozpis na polovinu zkouškového a aspoň tři podle výstupu termín změní. Pak ukazovat stav jednotlivých termínů (kolize, po noční, nevíme), ne kombinace.

**Pojem z předmětu.** Splňování omezení. Úplný výčet 1 024 kombinací trvá 0,3 ms, metoda větví a mezí není potřeba.

## Celé pořadí

Známky 1–5 od tří hodnotitelů, výsledná známka je vážený průměr (užitek 40 %, proveditelnost 30 %, AI a důvěra 30 %). Sloupec Server říká, jestli funkce potřebuje plánovanou verzi s účty a serverem.

| #   | Funkce                                     | Oblast            | Známka | Užitek | Proveditelnost | AI  | Pracnost    | Server |
| --- | ------------------------------------------ | ----------------- | ------ | ------ | -------------- | --- | ----------- | ------ |
| 1   | F02 Na čem výsledek stojí                  | Co kdyby          | 5,0    | 5      | 5              | 5   | malá        | ne     |
| 2   | F01 Nejmenší ústupek                       | Co kdyby          | 4,7    | 5      | 4              | 5   | střední     | ne     |
| 3   | F06 Podmínky účasti a role                 | Plánování skupiny | 4,3    | 4      | 4              | 5   | střední     | ne     |
| 4   | F14 Můj řádek a začernění v zařízení       | Čtení podkladů    | 4,1    | 5      | 3              | 4   | velká       | ne     |
| 5   | F07 Dva termíny místo jednoho              | Plánování skupiny | 3,8    | 2      | 5              | 5   | malá        | ne     |
| 6   | F08 Plovoucí pravidelné setkání            | Plánování skupiny | 3,7    | 4      | 3              | 4   | střední     | ne     |
| 7   | F25 Čistopis rozpisu a export              | Čtení podkladů    | 3,7    | 4      | 5              | 2   | malá        | ne     |
| 8   | F19 Harmonogram fakulty jako zdroj pravdy  | Čtení podkladů    | 3,6    | 3      | 4              | 4   | střední     | ne     |
| 9   | F21 Rozpoznání turnusu                     | Čtení podkladů    | 3,6    | 3      | 4              | 4   | střední     | ne     |
| 10  | F26 Výběr termínů zkoušek kolem směn       | Život směnaře     | 3,6    | 3      | 4              | 4   | střední     | ne     |
| 11  | F03 Jistý, nebo nadějný termín             | Co kdyby          | 3,5    | 2      | 5              | 4   | střední     | ne     |
| 12  | F09 Víc akcí najednou                      | Plánování skupiny | 3,5    | 2      | 4              | 5   | střední     | ne     |
| 13  | F10 Příchody a odchody                     | Plánování skupiny | 3,4    | 4      | 4              | 2   | střední     | ne     |
| 14  | F20 Co opravdu blokuje                     | Čtení podkladů    | 3,4    | 4      | 3              | 3   | střední     | ne     |
| 15  | F24 „Můžu?“ přes sdílení                   | Čtení podkladů    | 3,3    | 3      | 3              | 4   | střední     | ano    |
| 16  | F27 Hlášení dostupnosti pro vedoucího      | Život směnaře     | 3,3    | 3      | 4              | 3   | střední     | ne     |
| 17  | F32 Zápis rozvrhu, i s partou              | Život směnaře     | 3,3    | 3      | 3              | 4   | velká       | ne     |
| 18  | F15 AI vidí jen legendu (čtecí předpis)    | Čtení podkladů    | 3,2    | 2      | 3              | 5   | velká       | ne     |
| 19  | F23 Red-team sada proti podvrženým pokynům | Čtení podkladů    | 3,1    | 1      | 5              | 4   | střední     | ne     |
| 20  | F04 Plán B předem                          | Co kdyby          | 3,0    | 3      | 3              | 3   | velká       | ano    |
| 21  | F05 Soukromý podnět „záleží to na tobě“    | Co kdyby          | 3,0    | 3      | 3              | 3   | střední     | ano    |
| 22  | F11 Férovost a cena termínu                | Plánování skupiny | 3,0    | 3      | 3              | 3   | střední     | ano    |
| 23  | F16 Živý skener s hlídáním kvality         | Čtení podkladů    | 3,0    | 3      | 3              | 3   | střední     | ne     |
| 24  | F18 Ručně psané opravy jako vrstva         | Čtení podkladů    | 3,0    | 3      | 3              | 3   | střední     | ne     |
| 25  | F28 Mám tu směnu vzít?                     | Život směnaře     | 3,0    | 3      | 3              | 3   | velká       | ne     |
| 26  | F12 Rozpis služeb z dostupnosti            | Plánování skupiny | 2,9    | 2      | 3              | 4   | velká       | ano    |
| 27  | F17 Směny nadiktované hlasem               | Čtení podkladů    | 2,9    | 2      | 4              | 3   | střední     | ne     |
| 28  | F40 Zrcadlo soukromí                       | Soukromí          | 2,9    | 2      | 3              | 4   | střední     | ano    |
| 29  | F47 Rozdělení účtenky s QR platbou         | Integrace         | 2,9    | 2      | 4              | 3   | střední     | ne     |
| 30  | F13 Vzácná okna a tichý zájem              | Plánování skupiny | 2,8    | 4      | 2              | 2   | střední     | ano    |
| 31  | F33 Termín před rozpisem                   | Život směnaře     | 2,8    | 4      | 2              | 2   | střední     | ano    |
| 32  | F31 Hlídač rozpisu: odpočinek a limity     | Život směnaře     | 2,7    | 3      | 4              | 1   | střední     | ne     |
| 33  | F35 Stárnutí dat                           | Život směnaře     | 2,7    | 3      | 2              | 3   | střední     | ano    |
| 34  | F22 Kalibrovaná jistota čtení              | Čtení podkladů    | 2,6    | 2      | 2              | 4   | velká       | ne     |
| 35  | F46 Počasí u venkovních akcí               | Integrace         | 2,6    | 2      | 5              | 1   | malá        | ne     |
| 36  | F49 Rozpis a návrhy nahlas                 | Čtení podkladů    | 2,6    | 2      | 4              | 2   | střední     | ne     |
| 37  | F34 Místo a dojezd                         | Život směnaře     | 2,4    | 3      | 2              | 2   | velká       | ano    |
| 38  | F29 Sedí výplata s rozpisem?               | Život směnaře     | 2,3    | 2      | 3              | 2   | střední     | ne     |
| 39  | F30 Výměna směn                            | Život směnaře     | 2,3    | 2      | 2              | 3   | velká       | ano    |
| 40  | F39 Statistický slovník značek             | Agenti a predikce | 2,3    | 2      | 2              | 3   | střední     | ano    |
| 41  | F42 Server zná jen masku                   | Soukromí          | 2,3    | 2      | 3              | 2   | střední     | ano    |
| 42  | F43 Rozpoznání zdrojové aplikace           | Integrace         | 2,3    | 2      | 3              | 2   | střední     | ano    |
| 43  | F44 Bot pro Discord a Telegram             | Integrace         | 2,3    | 2      | 2              | 3   | velká       | ano    |
| 44  | F36 Samostatnost agenta a stínový režim    | Agenti a predikce | 1,9    | 1      | 2              | 3   | velká       | ano    |
| 45  | F37 Deník předpovědí s pojistkou           | Agenti a predikce | 1,9    | 1      | 2              | 3   | střední     | ano    |
| 46  | F45 MCP konektor                           | Integrace         | 1,9    | 1      | 3              | 2   | střední     | ano    |
| 47  | F41 Pojistky proti sondování               | Soukromí          | 1,6    | 1      | 2              | 2   | střední     | ano    |
| 48  | F48 Parťáci z předmětu                     | Integrace         | 1,3    | 1      | 1              | 2   | velmi velká | ano    |
| 49  | F38 Odhad skutečné účasti                  | Agenti a predikce | 1,0    | 1      | 1              | 1   | velká       | ano    |

## Katalog podle oblastí

U každé funkce je popis a rozhodující důvod každého hodnotitele.

### Co kdyby

**F01 Nejmenší ústupek** (2. místo, známka 4,7, pracnost střední)

Když žádný termín nevyhovuje všem, aplikace ukáže 2–3 nejlevnější změny zadání (kratší akce, širší okno, den navíc, o jednoho člověka méně) i s dopadem a jedním klepnutím je vyzkouší. Po kliknutí na den řekne, proč nevychází. AI: prohledávání stavového prostoru uvolnění s cenou (uniform-cost nebo A*, minimální korekční množiny); LLM nanejvýš formuluje větu.

- Užitek 5: Stav „všem to nevychází“ je u směnařů běžný a dnes končí slepým zkoušením; stačí data, která organizátor už má.
- Proveditelnost 4: Varianty přepočítá stávající findProposals bez modelu, jen ústupek „den navíc“ nejde, protože čtení zahazuje směny mimo hledané období.
- AI a důvěra 5: Prohledávání s cenou: nejlevnější kombinaci ústupků pravidla nenajdou, každou variantu ověří scheduler a LLM nanejvýš formuluje větu.

**F02 Na čem výsledek stojí** (1. místo, známka 5,0, pracnost malá)

Aplikace řekne, čí chybějící data nebo která nejistě přečtená směna může změnit vítězný termín, a připraví jednu cílenou otázku („Můžeš ve čt 18–21? Ano / Ne / Nevím“). Ostatní nejistoty označí jako „výsledek neovlivní“. AI: uvažování nad možnými světy a hodnota informace (VPI), scheduler se přepočítává pro obě možnosti.

- Užitek 5: Honění lidí a kontrolu nejistých čtení zkrátí na jednu otázku tomu, na kom termín opravdu stojí.
- Proveditelnost 5: Citlivostní test je pár desítek přepočtů findProposals nad poli unknown a uncertain, která už ve schématu jsou, a změří se scénáři bez modelu.
- AI a důvěra 5: Hodnota informace (VPI): přepočet scheduleru v možných světech určí, která nejistota mění vítěze, bez LLM a přímo proti tichým chybám.

**F03 Jistý, nebo nadějný termín** (11. místo, známka 3,5, pracnost střední)

U každého návrhu tři čísla („jistě 3, nejvýš 6, čekáme 4,5“) a přepínač řazení Na jistotu / Vyváženě / Risknu to. Později pravděpodobnosti z historie a simulace, jak moc termín vydrží změny. AI: rozhodování za nejistoty (maximin, očekávaný užitek, minimax regret), Monte Carlo.

- Užitek 2: Jisté a neznámé už karta návrhu ukazuje; „čekáme 4,5“ z odhadu 0,5 rozhodnutí neusnadní.
- Proveditelnost 5: Tři čísla plynou přímo z Proposal (available, unknown) a řazení je jen jiný komparátor; pravděpodobnosti z historie zatím není z čeho brát.
- AI a důvěra 4: Rozhodování za nejistoty: maximin, očekávaný užitek a minimax regret jsou čistá ukázka, ale výchozí pravděpodobnost 0,5 je odhad od stolu a „čekáme 4,5“ předstírá přesnost.

**F04 Plán B předem** (20. místo, známka 3,0, pracnost velká, potřebuje server)

Termín se vyhlásí předběžně s lhůtou a zálohou („do středy čekáme na Petra; když nemůže, platí čtvrtek“). Aplikace ukáže, kolik odřeknutí termín vydrží, a při změně rozpisu rovnou navrhne nejmenší přesun. AI: podmíněné plánování (expectimax), robustní optimalizace.

- Užitek 3: Řeší časté čekání na pozdní rozpisy, ale podmíněný termín lidi mate a potřebuje všechny v aplikaci.
- Proveditelnost 3: Odolnost termínu spočítá kód už dnes, ale lhůty, potvrzení účasti a přepnutí na zálohu chtějí server, oznámení a nepostavené sledování změn.
- AI a důvěra 3: Expectimax, podmíněné plánování: strom jde pěkně ukázat, ale pravděpodobnosti odpovědí i pokuty jsou vymyšlené a u pár neznámých stačí pravidlo se lhůtou.

**F05 Soukromý podnět „záleží to na tobě“** (21. místo, známka 3,0, pracnost střední, potřebuje server)

Jen člověk, jehož jediná směna nebo přednáška blokuje termín pro všechny, dostane soukromou kartu („stačilo by začít ve 20:00“ nebo „stačí vyměnit sobotní odpolední“) s konceptem zprávy kolegovi. Ostatní se nic nedozvědí, dokud sám nic nezmění. AI: kontrafaktuální analýza, nejmenší množina ústupků (hitting set); LLM píše zprávu.

- Užitek 3: Jeden blokující člověk je častý případ, jenže výměna směny bývá mimo jeho moc a podnět působí jako nátlak.
- Proveditelnost 3: Kontrafaktuál je scheduler bez jedné směny (pár dní práce), ale doručení „jen dotyčnému“ nemá bez účtů smysl, dnes vše vidí organizátor.
- AI a důvěra 3: Kontrafaktuální analýza: u jedné směny je to jen cyklus přes scheduler a podnět „záleží to na tobě“ nese sociální tlak a únik chováním.

### Plánování skupiny

**F06 Podmínky účasti a role** (3. místo, známka 4,3, pracnost střední)

Organizátor napíše „aspoň 4 ze 6, určitě Bára a aspoň jeden s autem“. Aplikace to ukáže jako upravitelné štítky, návrhy podle nich filtruje a při nesplnitelnosti řekne, která pravidla se vylučují. AI: LLM překládá větu do malého jazyka podmínek, splnitelnost řeší CSP a minimální konfliktní množina.

- Užitek 4: Oslavenec nebo hostitel musí být u velké části akcí a dnešní řazení podle počtu hlav ho klidně vynechá.
- Proveditelnost 4: Překlad věty je jedno levné volání přes existující generateJson a Zod a pravidla vyhodnotí kód; chybí ručně psaná sada asi 50 vět a UI štítků.
- AI a důvěra 5: Sémantický parser, CSP: LLM převede větu na podmínky, organizátor je potvrdí jako štítky a splnitelnost i konflikt pravidel počítá kód.

**F07 Dva termíny místo jednoho** (5. místo, známka 3,8, pracnost malá)

Když se všichni nevejdou do jednoho termínu, aplikace navrhne nejmenší sadu termínů (2 až 3) tak, aby každý stihl aspoň jeden, s rozdělením lidí a s osobou, která má být na každém. AI: množinové pokrytí (set cover), přesně přes branch and bound, hladový algoritmus jako srovnání.

- Užitek 2: Kamarádi dvě setkání místo jednoho nechtějí; uplatní se jen u učení nebo týmu ve větší skupině.
- Proveditelnost 5: Zhruba 60 kandidátních slotů týdně projde hrubá síla nad evaluateSlot a větší skupiny se složí z 22 existujících rozpisů bez volání modelu.
- AI a důvěra 5: Množinové pokrytí: NP-těžký výběr termínů řeší kód přesně (branch and bound) s hladovým srovnáním a lidi bez dat nepočítá jako pokryté.

**F08 Plovoucí pravidelné setkání** (6. místo, známka 3,7, pracnost střední)

Skupina zadá rytmus („deskovky zhruba jednou za 14 dní“) nebo cíl („6 schůzek do 15. 1.“). Aplikace naplánuje celou sérii s měnícím se dnem v týdnu tak, aby nikdo nevypadával opakovaně, a po novém rozpisu přeplánuje jen zbytek. AI: optimalizace posloupnosti (dynamické programování nebo lokální prohledávání), maximalizace nejnižší účasti; LLM převádí cíl z věty na omezení.

- Užitek 4: Pravidelná setkání jsou u směnařů opakovaná bolest a důvod se vracet, i když směny jsou známé jen 2–4 týdny dopředu.
- Proveditelnost 3: Série na týdny dopředu nemá data: rozpisy bývají známé 2–4 týdny, eval pokrývá 1–2 týdny a série je nová entita vedle Action.
- AI a důvěra 4: Optimalizace posloupnosti: série s rozestupy a co nejvyšší nejnižší účastí je víc než hladový výběr, jenže zadní část stojí na rozpisech, které ještě nejsou.

**F09 Víc akcí najednou** (12. místo, známka 3,5, pracnost střední)

Několik akcí se společnými lidmi (i napříč partami) se naplánuje jako jeden plán: každá akce dostane termín, nikdo nemá dvě akce v jeden večer a rozjednané termíny se drží předběžně. AI: CSP s optimalizací (backtracking, MRV, forward checking, branch and bound).

- Užitek 2: Souběh rozjednaných akcí se stejnými lidmi je vzácný a napříč partami chce hodně uživatelů.
- Proveditelnost 4: CSP nad uloženými akcemi je čistý kód měřitelný novými scénáři bez modelu, jen lidé dnes nemají identitu napříč akcemi a verze napříč partami chce účty.
- AI a důvěra 5: CSP s optimalizací: učebnicová formulace (proměnná = termín akce, MRV, forward checking) celá v kódu; hlídat je třeba jen únik mezi partami.

**F10 Příchody a odchody** (13. místo, známka 3,4, pracnost střední)

U delší akce časová osa, kdo kdy dorazí a kdo odejde na směnu, a doporučený čas hlavního bodu (dort, přípitek), kdy je přítomné jádro skupiny. AI: optimalizace začátku podle společně strávených hodin; LLM složí větu do pozvánky.

- Užitek 4: „Přijdu po směně“ je u směnařů norma, a přitom dnes takový člověk u delší akce vyjde jako „nemůže“.
- Proveditelnost 4: Intervaly přítomnosti se dopočítají z blockedInterval; hlavní práce je nová časová osa v UI a nové příznaky u akce.
- AI a důvěra 2: Optimalizace začátku: stačí výčet pár desítek začátků, tedy aritmetika, a osa příchodů prozrazuje konce směn, víc než může/nemůže.

**F11 Férovost a cena termínu** (22. místo, známka 3,0, pracnost střední, potřebuje server)

Návrhy zohlední, kdo chyběl posledně a co termín koho stojí (jde rovnou z noční, před ranní mu zbude 5 hodin spánku). Skupina si může zvolit režim „aby nikdo nechyběl pořád“; důvod vidí jen dotyčný. AI: společenská volba (leximin, Nashův součin) a model únavy ze sledu směn.

- Užitek 3: Při shodě počtu lidí pomůže tomu, kdo chybí pořád, ale potřebuje historii akcí a opakované používání.
- Proveditelnost 3: Cenu termínu z okolních směn spočítá kód, ale „kdo chyběl posledně“ potřebuje historii a stálou identitu lidí napříč akcemi, tedy účty.
- AI a důvěra 3: Společenská volba (leximin): pravidla blahobytu jsou čistý koncept, ale „cena“ z modelu únavy odvozuje ze směn údaj blízký zdraví.

**F12 Rozpis služeb z dostupnosti** (26. místo, známka 2,9, pracnost velká, potřebuje server)

Pro spolky a týmy: koordinátor zadá bloky a počty lidí („so 10–18 po dvou hodinách, vždy 2 lidi“) a aplikace z nahraných rozpisů navrhne obsazení služeb a při vrácení služby náhradníka. AI: přiřazovací úloha s omezeními (CSP nebo celočíselné programování); LLM převádí zadání na strukturu.

- Užitek 2: Je to potřeba spolků a týmů, ne part kamarádů, a přihlašovací tabulky ji už pokrývají.
- Proveditelnost 3: Přiřazovací CSP je standardní kód nad stejnou dostupností, ale potvrzování a vracení služeb chce účty a rozsahem je to jiný produkt.
- AI a důvěra 4: Přiřazovací CSP/ILP: klasická NP-těžká úloha (nurse scheduling) řešená solverem v kódu; chybu čtení rozpisu tu ale odnese konkrétní člověk přidělenou službou.

**F13 Vzácná okna a tichý zájem** (30. místo, známka 2,8, pracnost střední, potřebuje server)

I bez založené akce aplikace upozorní na vzácné společné okno („v listopadu můžete všichni jen jednou, čt 26. 11.“). Zájem každý projeví soukromě a odhalí se až ve chvíli, kdy ho projeví dost lidí. AI: statistika vzácnosti okna proti historii skupiny, koordinace se skrytou informací.

- Užitek 4: Upozornění na jediný společný večer v měsíci vytvoří setkání, která by nevznikla, chce však čerstvé rozpisy všech.
- Proveditelnost 2: Stojí na průběžně čerstvých rozpisech všech členů, oznámeních a historii skupiny; při měsíčním nahrávání a pár uživatelích vyjdou okna jako „nevíme“.
- AI a důvěra 2: Statistika vzácnosti: jde o počítání oken a prahové pravidlo odhalení, žádná AI technika, a upozornění samo říká, že lidé mají volno.

### Čtení podkladů

**F14 Můj řádek a začernění v zařízení** (4. místo, známka 4,1, pracnost velká)

U týmového rozpisu uživatel ťukne na svůj řádek, zbytek se začerní už v zařízení a ukáže se přesně to, co odejde modelu. Řeší dnešní stav, kdy se podklad s více lidmi nečte vůbec. AI: lokální detekce tabulky a OCR v prohlížeči, multimodální LLM čte jen výřez.

- Užitek 5: Týmový rozpis z nástěnky je nejběžnější reálný podklad a dnes se nepřečte vůbec.
- Proveditelnost 3: Výběr řádku v Excelu je kód a generátor týmové tabulky umí, ale detekce řádků a OCR z fotek v prohlížeči je nespolehlivá a skutečná fotka v sadě není.
- AI a důvěra 4: Lokální počítačové vidění: začernění v zařízení pošle modelu jen můj řádek a ukáže, co odchází; posun o řádek ale znamená cizí směny.

**F15 AI vidí jen legendu (čtecí předpis)** (18. místo, známka 3,2, pracnost velká)

Model dostane jen záhlaví, legendu a seznam různých značek a barev, bez jmen a bez směn. Vrátí předpis („data jsou v řádku 3, R = 6–14, žlutá = dovolená“), uživatel ho potvrdí a buňky přečte kód v prohlížeči. Levnější, soukromější a opakovatelné pro další měsíc. AI: LLM syntetizuje pravidla čtení místo čtení dat.

- Užitek 2: Uživatel uvidí jen potvrzení legendy; fotkám to nepomůže a soukromí kolegů většinu studentů netrápí.
- Proveditelnost 3: Chce nový jazyk předpisů a interpret pro libovolné rozložení tabulky; změřit jde jen na 9 tabulkových podkladech (xlsx a text) a vznikne druhá cesta čtení.
- AI a důvěra 5: Syntéza čtecích pravidel: LLM vyloží jen legendu a rozložení, buňky čte deterministicky kód, takže model nevidí jména ani směny.

**F16 Živý skener s hlídáním kvality** (23. místo, známka 3,0, pracnost střední)

Kamera s rámečkem a pokyny („blíž“, „odlesk vpravo“), automatické narovnání a kontrola ostrosti po částech ještě před odesláním; velký rozpis jde vyfotit nadvakrát s překryvem. AI: klasické počítačové vidění v zařízení, překryvy dlaždic jako druhé čtení zdarma.

- Užitek 3: Špatná fotka je hlavní zdroj chyb čtení, ale snímkům přeposlaným od kamarádů navádění při focení nepomůže.
- Proveditelnost 3: Narovnání umí hotová knihovna, ale prahy ostrosti nejde vyladit bez 30–50 skutečných fotek a kamera v telefonu chce HTTPS, kde by dnes byl vidět API klíč.
- AI a důvěra 3: Klasické počítačové vidění: brána ostrosti zachytí špatnou fotku před čtením, ale je to knihovní zpracování obrazu a bez reálných fotek ho nejde změřit.

**F17 Směny nadiktované hlasem** (27. místo, známka 2,9, pracnost střední)

Uživatel nadiktuje směny nebo nahraje hlasovku od vedoucí. Uvidí přepis a směny s daty, nejasná místa („od dvou“ je 14:00?) jako otázku se dvěma tlačítky. AI: model s audio vstupem nebo přepis, pak stejné strukturální čtení.

- Užitek 2: Totéž jde už dnes napsat nebo nadiktovat klávesnicí jako text; hlasovky od vedoucí jsou vzácné.
- Proveditelnost 4: Gemini adaptér pošle zvuk do stejného ReadingSchema (Claude adaptér ho odmítne, nahrávku z Chromu je třeba převést na WAV) a testovací nahrávky vyrobí macOS hlas.
- AI a důvěra 3: Rozpoznání řeči, NLP: hovorovou češtinu pravidla nepokryjí, ale číslovky se v přepisu pletou a hlasovka vedoucí je cizí hlas poslaný do cloudu.

**F18 Ručně psané opravy jako vrstva** (24. místo, známka 3,0, pracnost střední)

Škrty a dopsané změny na vytištěném rozpisu se zobrazí zvlášť („vytištěno R, dopsáno O“) s výřezem z fotky a tlačítky Platí / Neplatí. AI: multimodální model rozliší tisk od rukopisu a vrátí obě verze, rukopis vždy jako nejistý.

- Užitek 3: Dopsané výměny jsou na papírových rozpisech běžné a vedou k tiché chybě, jde ale jen o pár dní v měsíci.
- Proveditelnost 3: Fotky s ručními opravami v sadě nejsou a vygenerovat nejdou, tým si je musí vyrobit z výtisků; čtení rukopisu a souřadnice výřezů jsou nespolehlivé.
- AI a důvěra 3: Multimodální čtení rukopisu: návrh je opatrný (rukopis vždy nejistý), ale čtení rukopisu i souřadnice výřezu jsou nespolehlivé a bez reálných fotek neměřitelné.

**F19 Harmonogram fakulty jako zdroj pravdy** (8. místo, známka 3,6, pracnost střední)

Lichý a sudý týden, děkanská volna a zkouškové se berou z harmonogramu fakulty (jedno čtení sdílené všem studentům fakulty) místo z čísla týdne podle ISO, které pro část fakult a přes Nový rok vychází obráceně. AI: LLM čte harmonogram (PDF, web) do struktury s místem v dokumentu.

- Užitek 3: Tichá chyba je vážná, ale zasáhne jen studenty s lichými a sudými bloky tam, kde parita nesedí s ISO.
- Proveditelnost 4: Stačí jedno čtení veřejného PDF do mapy týden–parita a úprava expand.ts; chyba je skutečná (ISO týdny 53/2026 a 1/2027 jsou oba liché), sdílení mezi studenty až se serverem.
- AI a důvěra 4: Multimodální čtení dokumentu: odstraňuje ověřenou tichou chybu (parita z ISO týdne v expand.ts) a kód hlídá návaznost týdnů; sdílená chyba by ale zasáhla celou fakultu.

**F20 Co opravdu blokuje** (14. místo, známka 3,4, pracnost střední)

Bloky se dělí na povinné, „dá se vynechat“ (přednáška proti cvičení) a neblokující; totéž pro události z kalendáře a termíny odevzdání. V návrzích přibude stav „může, když něco vynechá“, ostatní dál vidí jen může nebo nemůže. AI: LLM třídí bloky podle názvu a kontextu a páruje duplicity z více zdrojů.

- Užitek 4: Rozdíl mezi přednáškou a cvičením řeší každý student a bez něj vypadá přes den obsazený, i když by přišel.
- Proveditelnost 3: Čtvrtý stav prochází schématem, schedulerem, UI i měřením a kalendářová část stojí na nepostaveném importu kalendáře.
- AI a důvěra 3: Klasifikace textu LLM: názvy bloků pravidla neroztřídí, ale chybné „neblokuje“ znamená falešné „může“ a názvy událostí jsou citlivé.

**F21 Rozpoznání turnusu** (9. místo, známka 3,6, pracnost střední)

Z 3–4 týdnů směn aplikace pozná cyklus (krátký a dlouhý týden, 2-2-3) a po potvrzení ho promítne dopředu jako zvláštní stav „podle turnusu“, odlišený od přečtených směn. Pro skupinu z toho plyne mapa „kdy se potkáváte“. AI: detekce periody (autokorelace) a katalog běžných turnusů, bez LLM.

- Užitek 3: Lidem s turnusem ušetří měsíční nahrávání a prodlouží výhled, většina brigádníků ale pravidelný cyklus nemá.
- Proveditelnost 4: Detekce periody je čistý kód měřitelný bez modelu, ale čtení dnes zahazuje směny mimo hledané období a eval má 1–2 týdny, takže je nutná úprava pipeline i generátoru.
- AI a důvěra 4: Detekce periodicity: robustní odhad cyklu se skóre shody bez LLM, promítnutý až po potvrzení jako oddělený stav; falešný vzor by byl tichá chyba.

**F22 Kalibrovaná jistota čtení** (34. místo, známka 2,6, pracnost velká)

Místo příznaku jistá / nejistá odhad pravděpodobnosti chyby u každé směny. Uživatel dostane krátkou frontu „zkontroluj tyto 3“ a druhé čtení se platí jen tam, kde se vyplatí. AI: naivní Bayes nebo logistická regrese s kalibrací nad signály čtení (typ podkladu, legenda, shoda dvou čtení, zásahy pravidel).

- Užitek 2: Uživatel uvidí jen kratší frontu ke kontrole, kterou z velké části dá už řazení podle dopadu z F02.
- Proveditelnost 2: Při 110 ze 110 správně není jediná chyba, ze které by se dalo učit; chce to stovky ručně ověřených směn ze skutečných fotek a kalibrace padne se změnou modelu.
- AI a důvěra 4: Naivní Bayes, kalibrace: spojuje signály čtení do pravděpodobnosti chyby a míří přímo na tiché chyby, jenže dnešní měření má 0 chyb, takže není z čeho učit.

**F23 Red-team sada proti podvrženým pokynům** (19. místo, známka 3,1, pracnost střední)

Útočné podklady (skrytý text, falešná legenda, pokyn v obrázku) jako součást měření s řádkem „úspěšné útoky: 0 z N“. Varování pro uživatele jen z pevného katalogu, ne volný text modelu. AI: LLM generuje útoky, měří se odolnost čtení.

- Užitek 1: Uživatel z toho nevidí nic a podvržené pokyny ve vlastním rozpisu nejsou jeho problém.
- Proveditelnost 5: Je to rozšíření stávajícího evalu o asi 20 podkladů z existujícího generátoru a jeden řádek metriky; úspěch útoku se pozná porovnáním s expected.json.
- AI a důvěra 4: Red-teaming prompt injection: dnes brání jen odstavec v instrukcích a volný text modelu se zobrazuje jako hlas aplikace; měření útoků a pevný katalog varování to zavírají.

**F24 „Můžu?“ přes sdílení** (15. místo, známka 3,3, pracnost střední, potřebuje server)

Pozvánku, plakát nebo screenshot zprávy člověk nasdílí do aplikace a do pár sekund vidí „můžeš“ nebo „nemůžeš, po noční tě počítáme až od 14:00“. U veřejných akcí s více termíny řekne, který partě vychází. AI: multimodální extrakce data, času a délky akce s označením domyšlených údajů.

- Užitek 3: Dotaz „můžu?“ je častý, ale pohled do rozpisu trvá stejně dlouho a sdílení do aplikace na iPhonu nejde.
- Proveditelnost 3: Jádro (datum z obrázku a attendanceInSlot) je týden práce přes vložení souboru, ale sdílení do aplikace chce PWA na HTTPS a v iOS Safari nefunguje.
- AI a důvěra 4: Multimodální extrakce: datum a čas z plakátu pravidla nevytáhnou, verdikt počítá scheduler a přečtené údaje jsou na kartě; hrozí sebejistě špatné datum.

**F25 Čistopis rozpisu a export** (7. místo, známka 3,7, pracnost malá)

Z přečteného rozpisu vznikne čistý obrázek „moje směny tento měsíc“ a soubor .ics do kalendáře, widgetu a hodinek. Užitek i pro jednoho člověka bez skupiny. AI: jen na vstupu (čtení cizího formátu), volitelně porovnání čistopisu s původní fotkou.

- Užitek 4: Dává užitek jednomu člověku hned po prvním nahrání a každý měsíc znovu, i když podobné aplikace existují.
- Proveditelnost 5: Obrázek i .ics vykreslí kód přímo z PersonSchedule.shifts za pár dní a ověří to jednotkové testy.
- AI a důvěra 2: Multimodální čtení vstupu: čistopis i .ics kreslí kód, nová AI práce tu není; zajímavé je jen volitelné porovnání čistopisu s fotkou.

**F49 Rozpis a návrhy nahlas** (36. místo, známka 2,6, pracnost střední)

Tlačítko „Přečíst“ shrne výsledek pár větami a přečte je nahlas; barvy rozpisu se převedou na významy podle legendy. AI: LLM vybere podstatné z faktů scheduleru, řeč je systémová.

- Užitek 2: Čtení nahlas ocení malá menšina; barvoslepým pomůžou vzory a popisky v mřížce i bez něj.
- Proveditelnost 4: speechSynthesis a zpětná kontrola čísel ve větě jsou na týden, ale kvalitu shrnutí a přínos pro uživatele čteček tým nemá jak změřit.
- AI a důvěra 2: Shrnutí dat textem: výběr podstatného zvládne šablona s prioritami a kontrola čísel nezachytí špatně přiřazené jméno, které si nevidomý neověří.

### Život směnaře

**F26 Výběr termínů zkoušek kolem směn** (10. místo, známka 3,6, pracnost střední)

Student vloží vypsané termíny zkoušek a aplikace ukáže 2–3 kombinace s počtem volných hodin na učení před každou zkouškou a bez zkoušky po noční. AI: LLM čte výpis termínů, výběr kombinace je CSP (branch and bound).

- Užitek 3: Použije se dvakrát ročně a rozpis na zkouškové při zápisu většinou ještě není, takže směny hrají malou roli.
- Proveditelnost 4: Výpis termínů je nové malé schéma ve stejné pipeline a výběr kombinace malý CSP; chybí pár vlastních výpisů ze studijních systémů a tok pro jednoho člověka.
- AI a důvěra 4: Branch and bound: LLM čte výpis termínů a kombinaci s největší rezervou vybírá kód; špatně přečtený čas zkoušky je ale drahá chyba.

**F27 Hlášení dostupnosti pro vedoucího** (16. místo, známka 3,3, pracnost střední)

Aplikace připraví měsíční hlášení „kdy můžu na směny“ ve tvaru, který vedoucí chce (zpráva, tabulka podle šablony). Hotový text zpětně přečte vlastní čtecí pipeline a kód ověří, že sedí se spočítanými okny. AI: LLM píše dokument z dat (obrácená pipeline) se zpětnou kontrolou.

- Užitek 3: Hlášení možností je běžné, ale své volno zná většina z hlavy a část ho zadává v systému zaměstnavatele.
- Proveditelnost 4: Zpětnou kontrolu udělá existující extractSchedule nad vygenerovaným textem; ukázky formátů vedoucích tým nemá a šablona tabulky je těžší než zpráva.
- AI a důvěra 3: Generování textu LLM: zpětné čtení vlastní pipeline hlídá časy, ale model tu píše místo čte, kontrola stejným modelem není nezávislá a často stačí šablona.

**F28 Mám tu směnu vzít?** (25. místo, známka 3,0, pracnost velká)

Z nabídky volných směn aplikace spočítá hrubý výdělek, kolize a limity dohod a doporučí kombinaci, která splní cíl („60 hodin v prosinci“) a zachová společné večery s partou. AI: LLM čte nabídky, výběr je optimalizace s omezeními (úloha o batohu, celočíselné programování).

- Užitek 3: Rozhodování o směnách je časté, ale chce zadat sazby, hodiny i nabídky a rozpisy kamarádů na další měsíc nejsou.
- Proveditelnost 3: Chybí vzorky nabídek směn i evidence hodin za celý rok a parametry dohod se každý rok mění.
- AI a důvěra 3: Úloha o batohu: výběr směn je skutečná optimalizace, ale stojí na limitech dohod z rozporných zdrojů a na roční evidenci hodin, která tiše nesedí.

**F29 Sedí výplata s rozpisem?** (38. místo, známka 2,3, pracnost střední)

Student vyfotí výplatní pásku a aplikace porovná zaplacené hodiny s odpracovanými směnami (noční, víkendy, svátky) a vypíše dny, na které se zeptat mzdové. AI: multimodální čtení pásky; součty a porovnání počítá kód.

- Užitek 2: Vyžaduje potvrzovat skutečně odpracované směny a páska má jen měsíční součty, které si člověk porovná sám.
- Proveditelnost 3: Výplatní pásky v sadě nejsou (citlivé, stovky podob) a skutečně odpracované hodiny by si uživatel musel měsíc potvrzovat.
- AI a důvěra 2: Multimodální čtení pásky: do cloudu jde rodné číslo, účet i mzda a přestávky či příplatky z průměrného výdělku vyrobí falešné rozdíly.

**F30 Výměna směn** (39. místo, známka 2,3, pracnost velká, potřebuje server)

Aplikace najde, s kým si prohodit směnu, včetně řetězu přes tři lidi („ty vezmeš Evinu nedělní, Eva Markovu páteční, Marek tvoji sobotní“), a připraví zprávy kolegům a vedoucímu. AI: hledání cyklů v grafu výměn (jako u párových výměn ledvin).

- Užitek 2: Prosba ve skupinovém chatu směny je rychlejší a řetěz přes tři lidi potřebuje kolegy v aplikaci.
- Proveditelnost 2: Řetěz přes tři lidi předpokládá víc kolegů z jednoho pracoviště v aplikaci a čtení týmových rozpisů, které pipeline dnes odmítá; výměnu stejně schvaluje vedoucí.
- AI a důvěra 3: Cykly v grafu: řetěz výměn je pěkná ukázka (kidney exchange), ale návrh nutně odhaluje směny kolegů a aplikace nezná pravidla pracoviště.

**F31 Hlídač rozpisu: odpočinek a limity** (32. místo, známka 2,7, pracnost střední)

Po přečtení rozpisu upozornění typu „mezi sobotní a nedělní směnou je jen 7 hodin“ nebo „na DPP máš letos 270 z 300 hodin“, vždy s odkazem na pravidlo a místo v podkladu. AI: vyhledání a citace přesného znění pravidla (RAG nad zákoníkem práce); kontroly počítá kód.

- Užitek 3: Ukáže se samo po přečtení a limit 300 hodin brigádníky zajímá, podle upozornění ale bude jednat málokdo.
- Proveditelnost 4: Kontroly odpočinku jsou pár pravidel vedle checks.ts s testy; roční limit DPP ale chce hodiny za celý rok, které aplikace nemá, a čísla ze zákona je nutné ověřit.
- AI a důvěra 1: RAG nad zákoníkem: pár pevných kontrol pokryje tabulka odkazů na paragrafy, a kde by model přidal výklad nebo výjimky, jde o právní radu.

**F32 Zápis rozvrhu, i s partou** (17. místo, známka 3,3, pracnost velká)

Z nabídky paralelek aplikace navrhne rozvrh s místem na práci; pro víc lidí tak, aby měli společná volná okna („s touhle volbou máte všichni volné úterý odpoledne“). AI: LLM čte nabídku paralelek, výběr je CSP s optimalizací přes více lidí.

- Užitek 3: Skládání rozvrhu bolí, ale jen dvakrát ročně, chce screenshoty všech paralelek a místa mizí během minut.
- Proveditelnost 3: Hustá tabulka paralelek je nový typ podkladu bez testovacích dat a v praxi ji jde ověřit jen dvakrát ročně při zápisu.
- AI a důvěra 4: Rozvrhový CSP: výběr paralelek přes více lidí je učebnicová úloha a kolize hlídá kód; čtení husté nabídky je ale těžší a chyba stojí semestr.

**F33 Termín před rozpisem** (31. místo, známka 2,8, pracnost střední, potřebuje server)

Pro akci, na kterou rozpisy ještě nejsou, aplikace vybere datum z toho, co je jisté, a každému připraví žádost o volno s datem, do kdy ji podat. Odhadne také, kdy komu rozpis obvykle vyjde. AI: plánování pozpátku od uzávěrek, odhad z historie nahrání; LLM píše žádost.

- Užitek 4: Na akce za tři a více týdnů rozpisy nejsou a připomenutí „řekni si o volno do…“ zaplňuje právě tuhle díru.
- Proveditelnost 2: Potřebuje účty a připomínky, odhad vydání rozpisu má jeden bod na člověka měsíčně a výběr data z „jistého“ stojí na nepostaveném turnusu.
- AI a důvěra 2: Zpětné plánování: lhůty jsou aritmetika s daty, odhad vydání rozpisu má jeden bod na člověka za měsíc a LLM píše jen krátkou žádost.

**F34 Místo a dojezd** (37. místo, známka 2,4, pracnost velká, potřebuje server)

Zdroje mají město (doma nebo město školy) a návrhy počítají jen s lidmi, kteří tam v tu dobu jsou, s dojezdem podle jízdních řádů a posledním spojem domů. AI: LLM odhadne místo z podkladu, z historie se odhadne vzor přesunů.

- Užitek 3: Party rozptýlené mezi městem školy a domovem jsou běžné, ale odhad „jsem doma“ bude často špatně.
- Proveditelnost 2: Účty, citlivá poloha a jízdní řády: IDOS veřejné API nemá a Transitous je jen nekomerční s neověřeným pokrytím ČR.
- AI a důvěra 2: Extrakce místa LLM: město zdroje zadá člověk jedním klepnutím, AI tedy přidává málo, a vzor přesunů je odhad toho, kde kdo je.

**F35 Stárnutí dat** (33. místo, známka 2,7, pracnost střední, potřebuje server)

Každý zdroj má odhad platnosti („rozvrh platí asi do poloviny prosince“). Po něm se dny přepnou z „může“ na „neznámé, ověř“ a majitel dostane dotaz na jedno klepnutí. AI: model přežití platnosti zdroje a detekce zlomu, když směny přestanou sedět na vzor.

- Užitek 3: Brání falešnému „může“ ze starého rozvrhu; pro uživatele je to hygiena, ne důvod se vracet.
- Proveditelnost 2: Předpokládá trvalé osobní zdroje na serveru a historii nahrazování, bez které je model jen ruční tabulka lhůt.
- AI a důvěra 3: Analýza přežití, CUSUM: brání nejhorší tiché chybě (zastaralé „může“), ale bez nasbírané historie je model jen tabulka lhůt, tedy pravidlo.

### Agenti a predikce

**F36 Samostatnost agenta a stínový režim** (44. místo, známka 1,9, pracnost velká, potřebuje server)

Agent odpovídá za uživatele podle pravidel napsaných větou („na pivo mě hlas, když mám druhý den volno“), s deníkem kroků a vrácením. Nejdřív dva týdny běží nanečisto a ukáže, v kolika případech by rozhodl stejně jako člověk. AI: LLM překládá věty do jazyka pravidel, shoda se měří zpětně.

- Užitek 1: Odpovědět na pár pozvánek měsíčně není zátěž a účast u kamarádů za sebe automatu nikdo nesvěří.
- Proveditelnost 2: Účty, oznámení, deník s vrácením a hodně rozhraní; shodu agenta s člověkem z pár akcí měsíčně nejde rozumně změřit.
- AI a důvěra 3: Sémantický parser pravidel: model větu jen přeloží a vyhodnocuje kód, jenže agent pak jedná za člověka a pár akcí měsíčně dá nevypovídající míru shody.

**F37 Deník předpovědí s pojistkou** (45. místo, známka 1,9, pracnost střední, potřebuje server)

Každý zobrazený odhad se uloží a po čase sám vyhodnotí („minulý měsíc sedělo 26 z 30 dní“). Komu odhady nesedí, tomu se přestanou zobrazovat. AI: průběžná kalibrace (Brierovo skóre), srovnání se základní metodou.

- Užitek 1: Je to infrastruktura pro odhady, které zatím neexistují, a uživatel z ní vidí jedno číslo.
- Proveditelnost 2: Zatím neexistuje žádný odhad, který by se vyhodnocoval, a skutečnost přibývá jedním rozpisem na člověka měsíčně.
- AI a důvěra 3: Kalibrace, Brierovo skóre: správná pojistka proti špatným odhadům, ale jen měřicí vrstva bez účinku, dokud neexistuje aspoň jeden odhad.

**F38 Odhad skutečné účasti** (49. místo, známka 1,0, pracnost velká, potřebuje server)

U termínu „očekávaná účast 4–5 z 6“ odhadnutá z kontextu směn (po sérii nočních lidé odříkají), jen za celou skupinu. AI: hierarchická logistická regrese z příznaků odvozených ze směn.

- Užitek 1: Pár akcí měsíčně model nenaučí a organizátor zná své kamarády líp než odhad „4–5 z 6“.
- Proveditelnost 1: Chce měsíce spárovaných dat pozvánka–účast–směny, která při pár akcích měsíčně základní metodu nepřekonají, a jde o profilování podle GDPR.
- AI a důvěra 1: Hierarchická logistická regrese: předpovídá chování jednotlivých kamarádů (profilování) z pár akcí měsíčně, takže nejspíš nepřekoná ani základní odhad.

**F39 Statistický slovník značek** (40. místo, známka 2,3, pracnost střední, potřebuje server)

Když rozpis nemá legendu, časy značek se berou podle toho, jak je mají ostatní rozpisy se stejnou sadou značek, a aplikace se ptá jen tam, kde se praxe rozchází. AI: rozdělení P(čas | značka) z potvrzených legend a oprav.

- Užitek 2: Časy značek se liší podle pracoviště, takže se aplikace stejně musí zeptat; ušetří jen pár potvrzení napoprvé.
- Proveditelnost 2: Rozdělení časů značek potřebuje potvrzené legendy od mnoha uživatelů z různých pracovišť; při pár uživatelích je to dnešní glossary.md.
- AI a důvěra 3: Četnostní odhad značek: P(čas | značka) je jednoduchá tabulka s vyhlazením, většinový význam ale může být pro dané pracoviště špatně a chce data mnoha uživatelů.

### Soukromí

**F40 Zrcadlo soukromí** (28. místo, známka 2,9, pracnost střední, potřebuje server)

Uživatel vidí, co o jeho týdnu jde odvodit z odpovědí, které skupina už viděla („út a čt jsi zaneprázdněný asi 13–23 h“), a může přepnout na hrubší sdílení. AI: simulace útočníka (šíření omezení přes zveřejněné odpovědi).

- Užitek 2: Kamarádi si dnes posílají celé rozpisy; hrubší sdílení ocení jen menšina ve volnějších skupinách.
- Proveditelnost 3: Simulace útočníka je čistý kód testovatelný už teď, uživateli ale dává smysl až se serverovým logem zobrazených odpovědí.
- AI a důvěra 4: Šíření omezení: simulace útočníka spočítá, co jde z odpovědí odvodit, bez LLM a poslouží i jako test pravidel zobrazení; je to však jen dolní odhad.

**F41 Pojistky proti sondování** (47. místo, známka 1,6, pracnost střední, potřebuje server)

Přehled „kdo si ověřoval tvou dostupnost“ a upozornění na podezřelý vzorec, například devět akcí za týden mířených na jednoho člověka. AI: detekce anomálií ve vzorcích dotazů.

- Užitek 1: Sondování přes falešné akce je mezi kamarády velmi vzácné a stačí možnost skupinu opustit.
- Proveditelnost 2: Bez serverového logu a skutečného provozu není na čem ladit prahy ani čím změřit úspěch, zbudou jen pevné limity.
- AI a důvěra 2: Detekce anomálií: při desítkách uživatelů není na čem prahy učit, zbydou pevné limity, a falešný poplach jmenovitě obviní kamaráda.

**F42 Server zná jen masku** (41. místo, známka 2,3, pracnost střední, potřebuje server)

Na server jde jen „kdy nemůžu“ po půlhodinách s datem spotřeby. Rozpis, názvy směn a podklady zůstávají v zařízení a ke každému čtení je účtenka (model, kdy byl originál smazán). AI: malá, jde hlavně o architekturu.

- Užitek 2: Uživatel získá jen ujištění o soukromí a zaplatí ztrátou podrobností při změně zařízení.
- Proveditelnost 3: Je to architektura backendu, který ještě není (maska z blockedInterval, IndexedDB, expirace), a komplikuje funkce, které potřebují směny na serveru.
- AI a důvěra 2: Žádná AI technika: čistě architektura minimalizace dat, v předmětu není co ukázat, i když soukromí ostatních AI funkcí zlepšuje nejvíc.

### Integrace

**F43 Rozpoznání zdrojové aplikace** (42. místo, známka 2,3, pracnost střední, potřebuje server)

Z podkladu aplikace pozná směnový systém („vypadá to na Planday“) a poradí, kde v něm vzít odkaz na kalendář, aby se směny příště načítaly samy. AI: jedno pole navíc ve fázi rozpoznání podkladu.

- Užitek 2: České směnové systémy odkaz na kalendář většinou nenabízejí, takže rada pomůže málokomu.
- Proveditelnost 3: Pole navíc v rozpoznání je hodina práce, ale živý odkaz chce server kvůli CORS, skutečné screenshoty systémů tým nemá a české systémy odkaz většinou nedávají.
- AI a důvěra 2: Zero-shot klasifikace: jedno pole navíc, které nahradí výběr systému ze seznamu; návody jsou z ručního katalogu, takže riziko je malé.

**F44 Bot pro Discord a Telegram** (43. místo, známka 2,3, pracnost velká, potřebuje server)

Příkaz /sraz vypíše návrhy a anketu přímo ve skupinovém chatu. Odpověď větou („ve čtvrtek nemůžu“) bot převede na údaj a nechá potvrdit. AI: LLM převádí volné odpovědi na strukturovaná omezení.

- Užitek 2: Většina českých part je na WhatsAppu a Messengeru, bot na Discordu a Telegramu jich zasáhne málo.
- Proveditelnost 2: Backend, hosting bota a propojení účtů na dvou platformách; do Messengeru a WhatsAppu, kde české party jsou, bota přidat nejde.
- AI a důvěra 3: Sémantický parser odpovědí: volnou češtinu převede na omezení a uloží až po potvrzení, je to ale stejný převod jako u už navržené akce z věty.

**F45 MCP konektor** (46. místo, známka 1,9, pracnost střední, potřebuje server)

Dostupnost party jako nástroje pro asistenta, kterého už uživatel má. Zeptá se „kdy může tenhle týden naše parta?“ a asistent zavolá aplikaci; ta neplatí žádné volání modelu. AI: běží v asistentovi uživatele, aplikace vystavuje jen nástroje může / nemůže / nevíme.

- Užitek 1: Vlastní konektor do asistenta si nastaví jen hrstka technicky zdatných uživatelů.
- Proveditelnost 3: Vzdálený MCP server s OAuth čeká na backend; lokální ukázku nad čistým src/core jde udělat za pár dní, úspěch se ale měří těžko.
- AI a důvěra 2: Agent s nástroji: model běží v cizím asistentovi, aplikace sama žádnou AI techniku neukáže a názvy akcí od jiných členů mohou působit jako podvržený pokyn.

**F46 Počasí u venkovních akcí** (35. místo, známka 2,6, pracnost malá)

Aplikace z názvu pozná venkovní akci a u návrhů ukáže předpověď („déšť 70 %“). AI: malé klasifikační volání při založení akce.

- Užitek 2: Předpověď má každý v telefonu a spolehlivá je jen na pár dní; přínos je sezónní.
- Proveditelnost 5: Open-Meteo je zdarma, bez klíče a volatelné z prohlížeče (ověřeno), klasifikace názvu je jedno volání přes existující generateJson; stačí přidat místo akce.
- AI a důvěra 1: Klasifikace názvu akce: jedno malé volání nahradí zaškrtávátko „venkovní akce“, AI je tu jen ozdoba.

**F47 Rozdělení účtenky s QR platbou** (29. místo, známka 2,9, pracnost střední)

Organizátor vyfotí účtenku, účastníci odkliknou své položky a každý dostane QR kód k platbě. AI: multimodální čtení účtenky stejným postupem jako rozpisy.

- Užitek 2: Problém je častý, ale řeší ho Revolut, Settle Up nebo QR z banky a s rozpisy nesouvisí.
- Proveditelnost 4: Účtenku přečte stejná cesta jako rozpisy a SPAYD je jen řetězec do QR knihovny; bez backendu ale položky odkliká jen organizátor na jednom zařízení.
- AI a důvěra 3: Multimodální čtení účtenky: stejný postup jako u rozpisů s kontrolou součtu v kódu; jde ale o peníze a přiřazení položek lidem součet neodhalí.

**F48 Parťáci z předmětu** (48. místo, známka 1,3, pracnost velmi velká, potřebuje server)

Kdo chce, zapne u předmětu „hledám parťáky“ a aplikace sestaví skupinky lidí se společnými volnými okny, aniž kdo vidí cizí rozvrh. AI: sjednocení názvů předmětů (embeddingy) a párování podle dostupnosti.

- Užitek 1: Bez desítek uživatelů na jedné fakultě nikoho nenajde a parťáky dnes řeší fakultní skupiny.
- Proveditelnost 1: Funguje až s desítkami uživatelů z jedné fakulty a seznamování cizích lidí nese nároky na bezpečnost a moderaci, které tým neunese.
- AI a důvěra 2: Embeddingy a párování: sjednocení názvů předmětů nejde předvést bez desítek uživatelů jedné fakulty a seznamování neznámých lidí žádá moderaci.

## Co v katalogu chybělo

Kritik úplnosti doplnil osm nápadů. Neprošly známkováním ani prověrkou. Jeho hlavní poznámka: katalog je bohatý na funkce a chudý na měření. Čtyři z osmi doplnění proto něco měří (zátěžová sada, namátkový audit, hlídač vět, simulátor party) a bez nich nejde velkou část katalogu vyhodnotit. V jeho textech je pracnost značená písmeny (S malá, M střední, L velká) a „backend“ znamená plánovaný server.

**Zátěžová sada: zhoršené a skutečné podklady**

Tým pustí měření na stejných rozpisech v několika stupních zhoršení (ostrý, rozmazaný, šikmý, s odleskem, zmenšený messengerem) a na rozpisech skutečné velikosti: celý měsíc, týmová tabulka, slovenština, angličtina. Zpráva ukáže křivku přesnosti a tichých chyb podle stupně, bod zlomu a cenu pro každý model. Uživatel může po opravě čtení podklad darovat do testů: jména se začerní v zařízení, uvidí náhled a jeho opravené směny se stanou správnou odpovědí.

- Co dělá AI: Zhoršování vykreslených podkladů v kódu se zachovanou správnou odpovědí (augmentace dokumentů: rozmazání, perspektiva, odlesk, komprese, moaré, stín; například knihovna Augraphy). Metamorfní testy bez správné odpovědi: tentýž podklad v několika podobách musí dát stejné směny, neshoda je nález; fungují i na darovaných fotkách. Sada se dělí na ladicí a testovací část, aby se instrukce neladily na testu. Generativní model obrázků se nepoužije, komolí znaky.
- Proč na tom záleží: Dnešních 110 ze 110 je na 22 čistých podkladech po 3–8 směnách. Funkce čtení z katalogu (F14, F16, F18, F22) tak nemají na čem ukázat zlepšení a nejdůležitější číslo, tiché chyby, není změřené v podmínkách skutečného použití. Je to předpoklad pro většinu oblasti Čtení podkladů. Pracnost M, bez backendu (darování až s účty).

**Kontrola v podkladu: co jsme přečetli a co ne**

Klepnutí na směnu zvýrazní její místo v náhledu podkladu (buňka Excelu, řádek textu, pás řádku a sloupce na fotce) a obráceně. Režim kontroly ukáže u nejisté směny výřez vedle přečtené hodnoty s tlačítky Platí / Oprav. Zvlášť je seznam nepřečteného: „Značky V (8×) a DOV (2×) nebereme jako směnu, souhlasí?“ a na fotce vyšrafovaná políčka, ze kterých žádná směna nevznikla.

- Co dělá AI: Vizuální ukotvení: model vrací u bloku řádek, sloupec a přibližný rámeček, kód je převede na pixely; u Excelu a textu stačí dnešní adresa v poli source. Audit pokrytí v kódu: neprázdné buňky v mřížce vymezené přečtenými bloky (na fotce políčka s inkoustem), na které žádný blok neodkazuje, se seskupí podle značky a nabídnou k jednomu potvrzení. Detekci mřížky sdílí s F14; nepřesné ukotvení se počítá jako signál nejistoty.
- Proč na tom záleží: Vynechaná směna je nejhorší tichá chyba, člověk pak vypadá volný. Příznak nejistoty jde dát jen směně, kterou model vrátil, takže vynechání dnes odhalí nanejvýš druhé čtení, pokud se spustí. Ruční kontrola je hlavní práce člověka v aplikaci a dnes znamená hledat v podkladu podle textového popisu místa; popis pipeline to sám uvádí mezi chybějícím. Pracnost M (Excel a text S), bez backendu.

**Namátkový audit: skutečná míra tichých chyb**

Po čtení dostane uživatel pár otázek na jedno klepnutí (obvykle 3–5) i ke směnám, které vypadají jistě: jednu za každou značku, první a poslední den (posun sloupců) a jednu náhodnou, vždy s výřezem z podkladu. Když vše sedí, rozpis má štítek „namátkově ověřeno“; první neshoda spustí druhé čtení a plnou kontrolu. Tým vidí průběžné číslo „tiché chyby v provozu: X z N ověřených směn“ podle formátu a modelu.

- Co dělá AI: Stratifikovaný výběr podle struktury chyb: chyby čtení jsou systematické (špatně vyložená značka, posun o sloupec), takže jedna kontrola na značku pokryje víc než náhodný vzorek. Bayesovský odhad míry tichých chyb (beta-binomický model s intervalem) souhrnně přes podklady a sekvenční pravidlo, kdy přestat a kdy eskalovat. Odpovědi jsou nezkreslené příklady pro kalibraci v F22.
- Proč na tom záleží: Podíl chybných směn bez označení nejistoty je podle popisu pipeline nejdůležitější číslo pro důvěru, ale měří se jen na vygenerovaných datech. Opravy uživatelů ho nenahradí, neopravená chyba vypadá jako správné čtení. Poctivě: tři klepnutí u jednoho podkladu statisticky dokážou málo (při nule chyb ze tří je horní mez chybovosti kolem 60 %), přínos je v odhalení systematických chyb a v součtu přes všechny podklady. Pracnost S až M; souhrnné číslo potřebuje backend.

**Vícedenní akce a akce přes noc**

Organizátor zadá „chata, aspoň 2 noci, někdy 4.–20. 12.“ nebo večírek do 2:00. Aplikace ukáže nejlepší běhy dnů: kdo je celou dobu, kdo dorazí později nebo odjede dřív („Petr až v sobotu ráno po noční“) a kolik směn by bylo potřeba vyměnit nebo pokrýt volnem, aby jeli všichni. Dnes se akce musí vejít do jednoho denního okna, takže víkend ani akce přes půlnoc zadat nejde.

- Co dělá AI: Optimalizace nad intervaly dnů místo půlhodinových slotů: pro každý běh N nocí se spočítají člověko-noci, souvislá přítomnost jádra skupiny a nejmenší množina směn, které výjezdu brání (hitting set přes více dnů, branch and bound). Výsledkem je Pareto fronta délka × účast × počet potřebných volen. LLM jen převede větu na parametry a formuluje shrnutí z hotových čísel.
- Proč na tom záleží: Výjezdy a oslavy přes noc jsou akce, na kterých partě záleží nejvíc, a u směnařů se domlouvají nejhůř: najít šesti lidem dva volné dny po sobě. Katalog řeší jen jednodenní termíny; F10 počítá příchody a odchody během jednoho dne, F33 žádost o volno na jedno datum. Pracnost M, bez backendu, mění schéma akce.

**Domluva z chatu**

Organizátor vloží text nebo screenshot vlákna ze skupinového chatu. Aplikace vypíše, co kdo řekl o svém čase („Bára: ve čtvrtek nemůžu, mám noční“, „Tom: kdykoli po šesté“), přiřadí výroky lidem v akci a každý nabídne k potvrzení jako ruční údaj dne s původem „z chatu“ a citací. Upozorní na rozpor s rozpisem a vypíše, kdo se nevyjádřil.

- Co dělá AI: LLM dělá extrakci z rozhovoru více lidí: přiřadí výrok autorovi, odliší „nemůžu“ od „radši ne“ a relativní výrazy („ve čtvrtek“, „příští víkend“) vrací neurčené; datum dopočítá kód z data zprávy. Nejasný výrok nepřevádí a vrátí ho jako otázku. Porovnání s rozpisy a zápis dělá kód.
- Proč na tom záleží: České party se domlouvají v Messengeru, WhatsAppu a na Instagramu, kam bota z F44 přidat nejde nebo to není ověřené, a F44 navíc čeká na backend. Tohle funguje v dnešní aplikaci a pokryje lidi, kteří rozpis nikdy nenahrají: z „nevíme“ se stane údaj s dohledatelným zdrojem. Dnešní pipeline podklad s více lidmi odmítá, jde tedy o nový typ čtení. Riziko: modelu jdou zprávy ostatních, proto náhled a výběr zpráv před odesláním. Pracnost M, bez backendu.

**Hlídač vět: věrnost a soukromí textů od AI**

Každá věta, kterou napíše model (vysvětlení návrhu, shrnutí nahlas, soukromá karta, zpráva vedoucímu, odpověď asistenta), projde před zobrazením kontrolou. Když obsahuje datum, čas, počet nebo jméno, které nesedí s výpočtem, nebo údaj, který čtenář nesmí vidět, zobrazí se místo ní pevná šablona. Ve zprávě z měření přibudou řádky „nevěrné věty: 0 z N“ a „úniky cizích údajů: 0 z N pokusů“.

- Co dělá AI: Model dostane jen fakta, která smí vidět konkrétní čtenář (každý fakt nese vlastníka), takže hranici soukromí nedrží prompt. Kód z hotové věty vytáhne data, časy, počty a jména a porovná je s fakty scheduleru; citaci zákona v F31 ověří doslovně proti textu. LLM generuje útočné otázky („proč Petr nemůže?“, „v kolik mu končí směna?“) a druhý model jako soudce hodnotí, zda odpověď prozradila cizí směnu.
- Proč na tom záleží: Katalog přidává řadu míst, kde model píše text z čísel (F01, F05, F10, F27, F30, F33, F49 a už navržené připomínky a asistent), ale měří se jen čtení. Vymyšlený čas ve větě je tichá chyba a vysvětlení je nejsnazší cesta, jak prozradit cizí směnu; F23 hlídá jen pokyny podvržené v podkladech. Jedna sdílená kontrola je levnější a spolehlivější než vlastní v každé funkci. Pracnost M; věrnost jde bez backendu, únikové testy až s daty více lidí.

**Simulátor party v čase**

Tým pustí virtuální skupinu na půl roku: lidé s turnusy a rozvrhy, rozpisy přicházejí se zpožděním a mění se, lidé odpovídají, odříkají a občas nepřijdou. Funkce závislé na historii (F03, F04, F08, F11, F35, F37, F38) se na ní přehrají a porovnají s dnešním řazením: účast, nejhůř vycházející člen, počet přeplánování. V aplikaci jde stejná data pustit jako ukázkový režim s posuvníkem času.

- Co dělá AI: Generativní model rozpisů (katalog turnusů, Markovův řetězec směn, šum a změny) a agentní simulace chování s nastavitelnými parametry (kdy kdo nahrává, šance odřeknutí po noční). Strategie se hodnotí metodou Monte Carlo proti základní metodě, včetně citlivosti na parametry, které tým neumí změřit. Scheduler a hodnocené strategie zůstávají skutečný kód.
- Proč na tom záleží: 21 ze 49 funkcí katalogu čeká na backend a měsíce provozu, které semestrální projekt mít nebude, a dnešní generátor testovacích dat losuje značky náhodně, bez turnusů a bez historie. Simulátor je jediná cesta, jak tyto funkce v předmětu změřit a předvést a jak ještě před stavbou zjistit, které základní metodu vůbec překonají. Výsledky platí jen za předpokladů simulace a zpráva to musí říkat. Pracnost M, bez backendu.

**Schránka podnětů a rozpočet pozornosti**

Všechno, co aplikace po člověku chce (rozhodující otázka z F02, soukromý podnět z F05, vzácné okno z F13, lhůta žádosti z F33, „platí to ještě?“ z F35), jde do jedné schránky seřazené podle důležitosti. Upozornění mimo aplikaci mají týdenní strop, který si člověk nastaví; zbytek počká ve schránce nebo vyprší. U každé položky je vidět, proč přišla právě teď.

- Co dělá AI: Každý podnět má odhad hodnoty (o kolik může změnit rozhodnutí × šance, že člověk odpoví včas) a lhůtu; výběr do stropu je plánování úloh s termíny a vahami. Šanci na odpověď se systém učí z reakcí podle typu podnětu a člověka (beta-bernoulliho model, Thompsonovo vzorkování) se sdílenými výchozími hodnotami pro nové lidi.
- Proč na tom záleží: Osm funkcí katalogu (F02, F04, F05, F13, F33, F35, F36, F41) a už navržené připomínky a sledování změn posílají vlastní podněty, každá s vlastním stropem. Dohromady je to spam: lidé upozornění vypnou a přestanou fungovat všechny proaktivní funkce naráz. Každý podnět navíc něco prozrazuje (na kom to stojí, že ostatní mohou), takže méně zpráv je i ochrana soukromí. Pracnost M, potřebuje backend.

Při slučování sta nápadů do 49 funkcí se ztratily hlavně dva a stojí za vrácení:

- **Vlastní pravidla slovy.** „V týdnu nejdřív po šesté, v neděli vůbec.“ Osobní pravidla dostupnosti zadaná větou, tvrdá i měkká. Zanikla ve funkci F36, která je o agentovi a čeká na server. Přitom jde o samostatnou funkci bez serveru se stejným mechanismem jako F06.
- **Původ údaje a zámek ručních oprav.** U každé směny vědět, odkud je (zadaná ručně, z kalendáře, přečtená a potvrzená, přečtená a nepotvrzená), a nenechat nové čtení přepsat ruční opravu. Ve funkci F22 to chybí.

Čtyři mezery, které se netýkají AI:

- **„Může“ není „chce“.** Chybí soukromá blokace, která se navenek neliší od směny.
- **Souhlas kamarádů.** Organizátor dnes nahrává rozpisy kamarádů a posílá je modelu, aniž o tom vědí. Všechny funkce pro soukromí v katalogu čekají na server.
- **Dovolená a nemoc se nečtou jako blok** (`src/llm/skill/SKILL.md`), takže člověk na dovolené vypadá jako volný.
- **Jeden souvislý rozsah pokrytí.** Dny mezi dvěma přečtenými obdobími vyjdou jako volné.

## Co sloučit

Kritik našel pět dvojic, které řeší totéž:

- **F26 Výběr termínů zkoušek kolem směn + F32 Zápis rozvrhu, i s partou.** Stejné jádro: LLM přečte nabídku termínů ze studijního systému a CSP vybere jednu možnost na předmět kolem směn. Liší se jen cílem (rezerva na učení vs. společná volná okna) a obdobím použití. Stačí jedna funkce „Výběr z nabídky školy“ se dvěma režimy; čtečku nabídky a kostru řešiče může využít i F28.
- **F03 Jistý, nebo nadějný termín + F38 Odhad skutečné účasti.** Obě ukazují u návrhu očekávanou účast skupiny („čekáme 4,5“ vs. „očekávaná účast 4–5 z 6“); dvě různá čísla vedle sebe by mátla. F38 je jen pozdější zdroj pravděpodobností pro F03 (model z kontextu směn místo výchozích 0,5). Příznaky ze sledu směn navíc sdílí s modelem únavy v F11 a „kolik odřeknutí termín vydrží“ z F04 patří do téhož čísla.
- **F14 Můj řádek a začernění v zařízení + F15 AI vidí jen legendu (čtecí předpis).** Dvě řešení téhož problému: týmový rozpis, modelu poslat jen nutné minimum a ukázat, co odchází. U Excelu a textu jsou to alternativy a tým postaví jednu; u fotek jde jen F14. Stačí jedna funkce „Můj řádek“ se dvěma cestami podle typu podkladu: fotka → začernění, tabulka → čtecí předpis.
- **F40 Zrcadlo soukromí + F41 Pojistky proti sondování.** Obě stojí na stejném logu „kdo co viděl“ a na stejné simulaci útočníka; F41 ji používá jako rozpočet prozrazení. Je to jedna ochrana proti odvozování se dvěma výstupy: co o mně jde zjistit a kdo se o to pokouší.
- **F35 Stárnutí dat + F37 Deník předpovědí s pojistkou.** Obě řeší, kdy aplikace přestane věřit tomu, co sama promítá do budoucna, a obě to pak vypnou (model přežití a detekce zlomu vs. Brierovo skóre a sekvenční test). U turnusu z F21 dělají totéž dvakrát. Platnost školního rozvrhu navíc přesně určuje harmonogram z F19, takže F35 zbývá málo vlastního obsahu. Shoda je slabší než u ostatních skupin.

Hodnotitelé navíc doporučují stavět několik funkcí jako jednu vrstvu:

- **F01 + F02 + F03: jedna vrstva „co kdyby“.** Všechny tři jen opakovaně pouštějí `findProposals` nad upravenými vstupy. Počítaly by z ní i F04 a F05.
- **F02 + F22: jedna fronta „zkontroluj jen tohle“**, řazená podle toho, jak pravděpodobná je chyba a jak moc by změnila termín.
- **F07 + F08 + F09: výběr sady termínů.** Jedna rodina úloh, stačí jeden řešič.
- **F25 + F29 + F31: osobní přehled „můj měsíc“.**
- **F27 + F33: ovlivnit rozpis dřív, než vznikne.**

Nepřesnosti v katalogu, na které hodnotitelé upozornili:

- F16 slibuje druhé čtení zdarma. Čtení po dlaždicích ale zvedne počet volání modelu třikrát až pětkrát.
- F09 (plánování napříč partami), F47 (odklikávání položek účastníky) a sdílená část F19 potřebují server, i když to u nich katalog neuvádí.
- F25 (soubor `.ics`), F21 a F39 se zčásti kryjí s dřív navrženým exportem do kalendáře, odhadem chybějící dostupnosti a učením z oprav.
- F24 na iPhonu fungovat nebude. Safari v iOS neumí přijmout obsah sdílený do webové aplikace.

## Slabá místa dnešního kódu

Na tohle prověrky narazily cestou. U opravených položek je ve sloupci Stav datum opravy, u otevřených, kterou funkci z katalogu brzdí nebo která funkce je řeší.

| Co                                                                                                                                                   | Kde                                             | Stav                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modelu odcházel název souboru, ve kterém bývá jméno.                                                                                                 | `src/llm/extract.ts`                            | Opraveno 19. 11.                                                                                                                                                                                       |
| Z Excelu odcházely modelu i skryté listy, řádky a sloupce.                                                                                           | `src/llm/ingest.ts`                             | Opraveno 19. 11. Na vynechaný obsah upozorní poznámka ke čtení. Zbývá řádek s nulovou výškou bez příznaku skrytí, ten knihovna nepozná.                                                                |
| Lichý a sudý týden se bere z čísla týdne podle ISO. Týdny 53/2026 a 1/2027 jsou oba liché, takže se rozvrh v lednu 2027 obrátí.                      | `src/core/parity.ts`, `src/llm/expand.ts`       | Opraveno 19. 11. Platí „dle kalendáře“ z podkladu, nebo potvrzení člověka do nejbližší přestávky ve výuce. Do potvrzení se počítá s oběma bloky.                                                       |
| Plánovač nečte příznak nejisté směny. Nejistá směna blokuje stejně jako jistá a návrh nepozná, že na ní stojí.                                       | `src/core/sensitivity.ts`                       | Částečně 19. 11. Při řazení se nejistá směna dál počítá jako skutečná, analýza jistého termínu ale bere její den jako neznámý a řekne, zda na něm nejlepší termín stojí.                               |
| Akci nejde po založení upravit (délka, denní okno, období).                                                                                          | `updateActionDetails` v `src/core/newAction.ts` | Opraveno 19. 11. Formulář „Upravit akci“ s krokem zpět.                                                                                                                                                |
| Ruční úprava dne roztáhne pokryté období a dny mezi tím přejdou z „nevíme“ na „volno“. V simulaci jedna oprava udělala volno z 19 nepřečtených dnů.  | `setDayOverride` v `src/core/actionEdits.ts`    | Opraveno 19. 11. Ruční úprava je samostatný záznam a pokrývá jen svůj den.                                                                                                                             |
| Rozpis má jediný souvislý rozsah pokrytí. Rozvrh platný do 18. 12. a rozpis směn do 6. 12. dají pokrytí do 18. 12. a dny mezi tím vyjdou jako volné. | `src/core/compose.ts`, `src/core/coverage.ts`   | Opraveno 19. 11. Pokrytí je seznam úseků a člověk má zdroje v okruzích (Práce, Škola). Den je známý, jen když ho pokrývá každý okruh.                                                                  |
| Čtení zahazuje směny mimo hledané období.                                                                                                            | `src/llm/expand.ts`, `src/llm/skill/SKILL.md`   | Opraveno 19. 11. v kódu a instrukcích. Na modelu zatím neměřeno.                                                                                                                                       |
| Noční směna z večera před obdobím se zahodí. První den období pak člověk vypadá ráno jako volný, i když je v práci nebo po noční.                    | `src/llm/expand.ts`, `src/core/scheduler.ts`    | Opraveno 19. 11. Předvečer se čte a když ho neznáme, je první den do 14:00 „nevíme“.                                                                                                                   |
| Schéma pustí akci delší než denní okno. Aplikace pak nevrátí žádný návrh a neřekne proč.                                                             | `src/core/schema.ts`                            | Opraveno 19. 11. Formulář řekne, že se akce do okna nevejde.                                                                                                                                           |
| Nové nahrání podkladů smaže rozpis člověka i s ručními opravami.                                                                                     | `addSource` v `src/core/actionEdits.ts`         | Opraveno 19. 11. Nový podklad se přidá jako další zdroj, starší zdroje i ruční úpravy zůstanou.                                                                                                        |
| Dovolená a nemoc se nečtou jako blok.                                                                                                                | `src/llm/skill/SKILL.md`                        | Otevřené, rozhodnutí k diskusi.                                                                                                                                                                        |
| Podklad s více lidmi se nečte vůbec.                                                                                                                 | `triage` v `src/llm/extract.ts`                 | Otevřené. Řeší F14. U Excelu pomůže ostatní řádky skrýt.                                                                                                                                               |
| Fotky a PDF odcházejí modelu i s metadaty souboru.                                                                                                   | `src/llm/ingest.ts`                             | Otevřené.                                                                                                                                                                                              |
| V testovací sadě není skutečná fotka, týmový rozpis ani rozpis delší než dva týdny. Jen jedna skupina (g05) nemá termín pro všechny.                 | `eval/data`, `eval/generate-data.ts`            | Částečně 19. 11. Přibylo 10 skupin bez společného termínu, 3 rozvrhy s lichým a sudým týdnem a 3 skupiny s nimi. Skutečná fotka a týmová tabulka dál chybí, týmové tabulky přijdou s funkcí Můj řádek. |
