# Server, účty a nasazení

Jak funguje serverová část Sladitu: přihlášení, ukládání rozpisů a akcí, čtení modelem přes server a nasazení na internet. Popis čtení rozpisů je v [PIPELINE.md](PIPELINE.md).

> Stav k 20. 11. 2026: hotové jsou fáze 3 až 6 (přihlášení, vlastní rozpis v účtu, čtení přes server, převzetí dat z prohlížeče, přátelé a skupiny přes odkaz, akce s pozvanými, potvrzení termínu, sdílení jen tří stavů a Google Kalendář). Aplikace je nasazená na https://sladit-production.up.railway.app a přihlášení přes Google tam funguje (viz [Současné nasazení](#současné-nasazení)). Google Kalendář je hotový v kódu, v produkci ho zapne až klíč `TOKEN_ENCRYPTION_KEY` a nastavení v Google Cloudu (viz návody).

## Proč server

- **Klíč k modelu nesmí být v prohlížeči.** Dřív byl v sestavené aplikaci čitelný. Teď ho zná jen server.
- **Rozpis patří člověku, ne akci.** Každý si spravuje svůj rozpis v účtu a použije ho ve více akcích.
- **Souhlas.** Dřív organizátor posílal modelu rozpisy kamarádů, aniž o tom věděli. Teď má každý účet a nahrává si svůj rozpis sám. Hosté bez účtu nejsou.
- **Kalendář.** Google Kalendář bez serveru připojit nejde (fáze 6).

Server je záměrně malý a nudný: jeden proces v Node, Postgres, čisté SQL bez ORM, žádná fronta úloh.

## Architektura

```
prohlížeč                                   server (Node)                     Postgres
──────────                                   ─────────────                     ────────
src/ui ─► src/session.ts ─► src/client/http.ts ──HTTPS──► server/app.ts ─► server/db/store.ts ─► tabulky
                 │             (fetch, ověření               │   (trasy, přihlášení,
                 │              odpovědí schématy)           │    kontrola vlastníka)
                 ▼                                           ▼
          src/llm/ingest.ts                          src/llm/extract.ts ─► model (Claude, Gemini)
          (příprava podkladu)                        (čtení, kontroly)
                 └──────── oba konce: src/contract/api.ts (Zod) a src/core (čistá logika) ────────┘
```

| Složka         | Co v ní je                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `src/core`     | Čistá logika: schémata, skládání rozpisu, plánovač, jistý termín. Bez sítě, databáze a Vue.          |
| `src/contract` | Schémata Zod pro požadavky a odpovědi API. Server jimi ověřuje požadavky, prohlížeč odpovědi.        |
| `src/llm`      | Čtení modelem. `ingest.ts` běží v prohlížeči (příprava podkladu), zbytek jen na serveru a v měření.  |
| `src/client`   | Rozhraní k serveru: `http.ts` (skutečný server), `memory.ts` (v paměti pro testy a ukázku bez účtu). |
| `server`       | `app.ts` trasy, `view.ts` pohled na akci pro člena skupiny, `auth/` přihlášení, `db/` databáze.      |

Pravidlo závislostí: v prohlížeči `ui → session → client → contract → core`, na serveru `server → llm → core`. `core` nezávisí na ničem dalším.

Frontend i API jsou na stejném původu (stejná adresa), takže není potřeba CORS a cookie relace funguje bez triků. Ve vývoji to zařídí proxy ve Vite, v produkci server podává i sestavený frontend.

## Datový model

Migrace jsou v `server/db/migrations/`, spouští je server sám při startu (`migrate` v `server/db/db.ts`). Nová změna schématu je nový soubor a nový řádek v seznamu `MIGRATIONS`, staré migrace se nemění.

| Tabulka                | Co drží                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                | Účet podle účtu Google: `google_sub`, e-mail, jméno.                                                                                                                    |
| `sessions`             | Přihlášení. V databázi je jen otisk tokenu (SHA-256), samotný token má jen cookie v prohlížeči.                                                                         |
| `oauth_states`         | Rozpracované přihlášení: náhodný `state` a ověřovač PKCE. Platí 15 minut a jde použít jen jednou.                                                                       |
| `people`               | Rozpis uživatele (`is_self`). Hosté z doby před fází 5 tu zůstali, aplikace je už nepoužívá.                                                                            |
| `sources`              | Přečtený podklad (JSON podle `src/core/schema.ts`) i s otázkami doptání. Jen server zná čtení (`basis`) a odpovědi.                                                     |
| `day_overrides`        | Ruční úprava jednoho dne. Nové čtení ji nepřepíše.                                                                                                                      |
| `actions`              | Akce: období, délka, denní okno (i víkendové), ideální začátek, nejmenší počet lidí, organizátor, navržený termín (`confirmed_*`) a lhůta hlasování.                    |
| `action_invites`       | Pozvánka do akce a odpověď: `invited`, `accepted`, `declined`. Do termínu se počítá jen `accepted`. K tomu odpověď na termín, protinávrh, nezbytnost a prosba o rozpis. |
| `friendships`          | Přátelství, vzájemné. Dvojice je uložená jednou, menší id první.                                                                                                        |
| `friend_invites`       | Osobní odkaz „přidej si mě do přátel“: jen otisk tokenu, platnost 7 dní, případné zrušení.                                                                              |
| `friend_requests`      | Žádost o přátelství podle e-mailu: odesílatel a e-mail adresáta malými písmeny. Platí 30 dní, adresát nemusí mít účet.                                                  |
| `groups`               | Skupina: seznam lidí, které jde pozvat do akce najednou.                                                                                                                |
| `memberships`          | Členství s rolí `owner` (zakladatel) nebo `member`.                                                                                                                     |
| `invites`              | Odkaz s pozvánkou do skupiny: jen otisk tokenu, platnost 7 dní, případné zrušení.                                                                                       |
| `action_candidates`    | Termíny v hlasování (1–3). Hlasování skončí výběrem jednoho z nich, zrušením, nebo přímým návrhem termínu.                                                              |
| `candidate_votes`      | Hlas účastníka u termínu: `yes` (můžu), `maybe` (když bude nutné), `no` (nemůžu).                                                                                       |
| `action_links`         | Odkaz rovnou do akce: jen otisk tokenu, platnost 7 dní, případné zrušení. Přijetí = přátelství s organizátorem a přijatá pozvánka.                                      |
| `read_usage`           | Počet čtení modelem za den podle času v Praze, kvůli limitům.                                                                                                           |
| `calendar_connections` | Připojený Google Kalendář: zašifrovaný obnovovací token, souhlas se zápisem, automatický zápis, stav, kalendář „Sladit“ a obsazenost (jen časy).                        |
| `calendar_events`      | Událost zapsaná z potvrzené akce (kalendář a id události), aby šla změnit nebo smazat.                                                                                  |

Účastníci akce jsou organizátor a ti, kdo pozvánku přijali. Pozvat jde přátele a lidi ze skupin, kde je organizátor členem. Tabulka `action_participants` a hosté z doby před fází 5 zůstaly v databázi, ale nepoužívají se. Migrace 003 převedla akce ve skupinách z fáze 4 na přijaté pozvánky.

Obsah nahraných souborů se na serveru neukládá. Ukládají se jen přečtené směny a názvy souborů, které vidí jen vlastník.

Data jsou uložená jako text `RRRR-MM-DD`, ne jako typ `date`. Ovladač databáze by jinak datum převáděl přes časové pásmo serveru.

## API

Vše pod `/api`. Kromě `/me`, `/health` a přihlášení vyžaduje přihlášení.

| Metoda a cesta                                         | Co dělá                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `GET /me`                                              | Kdo je přihlášený (nebo `null`).                                   |
| `GET /auth/google`, `GET /auth/google/callback`        | Přihlášení přes Google.                                            |
| `POST /auth/logout`                                    | Odhlášení, relace se smaže i na serveru.                           |
| `DELETE /me`                                           | Smaže účet a kaskádou všechna jeho data.                           |
| `GET /people`                                          | Můj rozpis (zdroje a ruční úpravy).                                |
| `PATCH /people/:id`                                    | Přejmenování (jméno, které vidí ostatní).                          |
| `POST /people/:id/readings`                            | Přečte připravené podklady modelem a uloží nový zdroj.             |
| `PATCH`, `DELETE /people/:id/sources/:sourceId`        | Okruh, odpověď na lichý týden, smazání zdroje.                     |
| `POST /people/:id/sources/:sourceId/answers`           | Odpovědi na doptání. Zdroj se hned přepočítá.                      |
| `POST /people/:id/sources/:sourceId/clarify`           | Věta vlastními slovy: AI vrátí návrh změn, nic se neuloží.         |
| `PUT`, `DELETE /people/:id/overrides/:date`            | Ruční úprava dne a její zrušení.                                   |
| `GET`, `POST /actions`, `PATCH`, `DELETE /actions/:id` | Akce. `POST` s `inviteUserIds` rovnou pozve.                       |
| `GET /actions/:id/view`                                | Návrhy, jistota termínu a stav dne ostatních (viz Soukromí).       |
| `POST /actions/draft`                                  | Akce z jedné věty: AI vrátí parametry do formuláře, nic neuloží.   |
| `POST /actions/:id/invites`                            | Pozvat další lidi (jen organizátor).                               |
| `POST`, `DELETE /actions/:id/links(/:linkId)`          | Odkaz rovnou do akce (jen tentokrát v odpovědi), zrušení.          |
| `DELETE /actions/:id/invites/:userId`                  | Zrušit pozvánku nebo odebrat účastníka (jen organizátor).          |
| `PATCH /actions/:id/invites/:userId`                   | Nezbytný účastník (jen organizátor).                               |
| `POST /actions/:id/invites/:userId/remind`             | Prosba o rozpis, nejvýš jednou za 12 hodin (jen organizátor).      |
| `GET /actions/:id/days/:date`                          | Všechny začátky dne a kdo v nich může (výběr vlastního času).      |
| `PUT`, `DELETE /actions/:id/poll`                      | Hlasování o 1–3 termínech s lhůtou, zrušení (jen organizátor).     |
| `PUT /actions/:id/poll/votes`                          | Hlasy účastníka.                                                   |
| `POST /actions/:id/poll/candidates/:id/choose`         | Výběr vítěze: stane se navrženým termínem (jen organizátor).       |
| `POST /actions/:id/response`                           | Odpověď pozvaného: `accept` přijme, jinak odmítne nebo odejde.     |
| `PUT`, `DELETE /actions/:id/confirmed`                 | Navržení termínu a jeho zrušení (jen organizátor).                 |
| `POST /actions/:id/slot-response`                      | Odpověď na termín: jdu, nejdu, nebo jiný termín.                   |
| `POST /actions/:id/counters/:userId/adopt`             | Organizátor přijme jiný termín, který navrhl účastník.             |
| `GET /friends`, `DELETE /friends/:userId`              | Moji přátelé a moje platné odkazy, zrušení přátelství.             |
| `POST`, `DELETE /friends/invites(/:inviteId)`          | Nový osobní odkaz do přátel (jen tentokrát v odpovědi), zrušení.   |
| `POST /friends/requests`                               | Žádost o přátelství podle e-mailu (nejvýš 20 za 24 hodin).         |
| `POST /friends/requests/:id/accept`, `DELETE …/:id`    | Přijetí žádosti, odmítnutí nebo zrušení vlastní.                   |
| `GET`, `POST /groups`, `DELETE /groups/:id`            | Moje skupiny, nová skupina, smazání (jen zakladatel).              |
| `POST /groups/:id/leave`                               | Odchod ze skupiny.                                                 |
| `POST /groups/:id/members`                             | Zakladatel přidá rovnou někoho ze svých přátel.                    |
| `DELETE /groups/:id/members/:userId`                   | Zakladatel odebere člena.                                          |
| `POST /groups/:id/invites`                             | Nový odkaz s pozvánkou. Odkaz je v odpovědi jen tentokrát.         |
| `DELETE /groups/:id/invites/:inviteId`                 | Zrušení pozvánky.                                                  |
| `GET /invites/:token`, `POST /invites/:token/accept`   | Náhled a přijetí odkazu: do skupiny, přátel, nebo akce (`kind`).   |
| `GET`, `PATCH`, `DELETE /calendar`                     | Stav kalendáře, automatický zápis, odpojení (odvolá přístup).      |
| `GET /calendar/connect`                                | Souhlas s kalendářem u Googlu, návrat přes stejné přesměrování.    |
| `POST /calendar/sync`                                  | Načíst obsazenost hned (jinak nejvýš jednou za 10 minut).          |
| `POST`, `DELETE /actions/:id/calendar`                 | Termín, na který jdu, do mého kalendáře a jeho odebrání.           |
| `POST /import`                                         | Jednorázové převzetí akcí uložených v prohlížeči z doby před účty. |
| `GET /health`                                          | Kontrola pro hosting.                                              |

Chyby mají tvar `{ "error": "česká zpráva", "code": "…" }`. Kód `limit` je vyčerpaný denní limit čtení, `unreadable` nečitelný podklad (s polem `notes`), `busy` přetížený model, `invite` neplatná pozvánka, `full` plná skupina (50 členů), `self` vlastní odkaz do přátel.

Akci upravuje, maže, zve do ní a navrhuje termín jen organizátor. Pozvaný dostane `403` s vysvětlením, kdo pozvaný není, dostane `404`. Navržený termín (i protinávrh) musí ležet v období a denním okně akce a mít její délku. Účastníci, kteří pozvánku přijali, odpoví „jdu“, „nejdu“, nebo navrhnou jiný termín. Domluveno je, když jdou všichni. „Nejdu“ termín nezruší, rozhodne organizátor. Nový termín (i přijatý protinávrh) odpovědi vynuluje, kdo protinávrh poslal, rovnou jde. Když se změní období, délka nebo okno, termín i odpovědi zmizí.

## Soukromí a bezpečnost

**Kdo co vidí.** Rozpis (zdroje, směny, ruční úpravy, názvy souborů, poznámky ke čtení) vidí jen jeho vlastník. Každý dotaz do databáze, který čte nebo mění člověka, má v podmínce id vlastníka (`server/db/store.ts`). Cizí data tak nejde přečíst ani změnit, ani kdyby trasa zapomněla na kontrolu: odpověď je `404` a neprozradí, zda data existují. Testy v `server/app.test.ts` (oddíl „cizí data“) to zkoušejí za jiného uživatele i bez přihlášení.

**Akce.** Akci vidí organizátor a ti, kdo do ní dostali pozvánku a neodmítli ji. Do výpočtu termínu se pozvaný započítá až po přijetí. O ostatních účastnících každý dostane jen:

- jméno a odpověď na pozvánku (`GET /actions`),
- pro každý den období akce jen „může / nemůže / nevíme“ (`GET /actions/:id/view`),
- zda může v každém ze tří návrhů,
- u křehkého termínu den, na kterém záleží, bez důvodu (chybí rozpis, nebo nejisté čtení),
- ve výběru vlastního času (`GET /actions/:id/days/:date`) pro každý začátek v denním okně akce, zda může, nemůže, nebo nevíme. Je to víc než stav dne, ale pořád jen „kdy můžeš“ uvnitř okna akce, se kterým účastník při přijetí souhlasil. Směny, časy směn ani označení ven nejdou,
- zda má nahraný rozpis (u pozvánky, aby ho organizátor mohl poprosit),
- hlasy v hlasování (to jsou odpovědi samotných účastníků).

Návrhy a jejich jistotu počítá server ze všech rozpisů (`server/view.ts`). Rozpisy cizích lidí jen použije, ven je nepustí. Jediná metoda úložiště, která čte cizí rozpisy, je `actionForView` a volá ji jen tento výpočet. Přátelé a členové společných skupin o sobě vidí jméno a e-mail (stránka Přátelé, seznam členů skupiny, výběr pozvaných), aplikace to říká v textech u pozvánek. Účastník akce, který s druhým není přítel ani ve stejné skupině, vidí jen jméno. U žádosti o přátelství podle e-mailu adresát vidí jméno a e-mail odesílatele, aby poznal, od koho je (formulář to odesílateli řekne předem). Odesílatel se naopak nedozví, zda e-mail patří k účtu: odpověď je stejná pro e-mail s účtem i bez něj. Výpočet je v `src/core/sharedView.ts`, stejně ho počítá i ukázka bez přihlášení. Testy v `server/events.test.ts` hledají v odpovědích pro účastníka skutečné časy, označení, text z podkladu, poznámky i název souboru a zkoušejí přístup za pozvaného, za organizátora i za člověka, který pozvaný není.

**Odkazy s pozvánkou.** Do skupiny i do přátel vede odkaz `/pozvanka/<token>` s náhodným tokenem (32 bajtů). Server zná jen jeho otisk, takže odkaz ukáže jen jednou. Platí 7 dní, víc lidí ho může použít a ten, kdo ho vytvořil, ho může kdykoli zrušit. Přátelství vznikne, až druhý odkaz otevře a potvrdí. Prohlížeč adresu s tokenem hned přepíše na `/`, aby nezůstala v historii, a token podrží v `sessionStorage` přes přihlášení u Googlu.

**Odchod ze skupiny a konec přátelství.** Akcí se to netýká: kdo už pozvánku má nebo přijal, zůstává. Jen ho přes skupinu nebo přátelství nejde pozvat znovu. Zakladatel při odchodu nebo smazání účtu předá skupinu nejdéle přítomnému členovi, poslední člen ji odchodem smaže. Smazáním účtu zmizí i účast ve všech akcích.

**Zbytkové riziko.** Kdo smí měnit denní okno akce, může opakovanou změnou odhadnout, kdy končí cizí směny. Proto akci upravuje jen organizátor. Detekci takového zkoušení server nemá. Podobně trochu prozradí čas nejlepšího návrhu, když nezačíná na začátku okna.

**Přihlášení.** OAuth 2.0 s autorizačním kódem na serveru, s `state` (proti podstrčenému přihlášení je uložený v databázi i v cookie prohlížeče) a s PKCE. Z účtu Google se bere jen `openid email profile`. O kalendář se žádá zvlášť, až ho uživatel připojuje (viz Google Kalendář). Relace je náhodný token v cookie `HttpOnly`, `SameSite=Lax` a v produkci `Secure`, platí 30 dní.

**Požadavky z cizí stránky (CSRF).** Server přijme změnu (`POST`, `PATCH`, `PUT`, `DELETE`) jen s hlavičkou `Origin` rovnou adrese aplikace, nebo bez ní se `Sec-Fetch-Site: same-origin`. Cookie navíc má `SameSite=Lax`.

**Čtení modelem.** Podklad se připraví v prohlížeči (`src/llm/ingest.ts`): z Excelu jde jen viditelná část, název souboru se modelu neposílá. Server přijme nejvýš 6 souborů, každý do 10 MB a dohromady do 25 MB. U obrázků a PDF podle prvních bajtů ověří, že soubor opravdu je tím, za co se vydává. Pokyny pro model skládá jen server. Denní limity: `READ_LIMIT_PER_USER_PER_DAY` (výchozí 30) a `READ_LIMIT_TOTAL_PER_DAY` (300). Čtení se započítá předem, i když selže. Do stejného limitu se počítá každá zpráva v doptání vlastními slovy. Volitelně `ALLOWED_EMAILS` pustí dovnitř jen vyjmenované účty.

**Tajemství.** Klíče jsou jen v proměnných prostředí serveru, v repozitáři žádné nejsou. Žádný klíč nesmí mít jméno začínající `VITE_`: takové proměnné Vite může vložit do aplikace pro prohlížeč. Server dřívější názvy s touto předponou ještě přečte, ale při startu vypíše, které je potřeba přejmenovat. Sestavení v `dist/` klíč neobsahuje, ověřeno 19. 11. 2026.

**Upozornění v aplikaci.** E-maily aplikace neposílá. Nová pozvánka do akce, navržený termín a protinávrh se ukážou nahoře v aplikaci a u akce v menu (na telefonu tečka na tlačítku menu). Aplikace si jednou za minutu a po návratu do záložky potichu načte akce a přátele, takže se upozornění objeví i bez obnovení stránky. Ve skryté záložce nic nestahuje.

**Odkaz do akce.** Organizátor vytvoří odkaz a pošle ho třeba do skupinového chatu. Kdo ho otevře, uvidí název akce, organizátora a období a před přijetím i to, co z jeho rozvrhu ostatní uvidí. Přijetím je přítel organizátora a účastník akce v jednom kroku. Platí 7 dní, jde zrušit a v databázi je jen otisk tokenu.

**Akce z jedné věty.** Věta organizátora jde modelu s dnešním datem a kalendářem na 10 týdnů (`src/llm/actionDraft.ts`), takže „příští pátek“ model najde v seznamu a nepočítá ho. Výsledek projde stejnou kontrolou jako formulář a člověk ho před založením vidí. Počítá se do denního limitu čtení.

**Google Kalendář.** Aplikace žádá jen `calendar.freebusy` (kdy je člověk obsazený, bez názvů a popisů událostí) a `calendar.app.created` (zápis jen do kalendáře „Sladit“, který si sama založí, ostatní kalendáře nevidí ani nemění). Obnovovací token je v databázi zašifrovaný (AES-256-GCM, klíč `TOKEN_ENCRYPTION_KEY` jen v proměnných prostředí). Obsazenost se čte nejvýš jednou za 10 minut na 13 týdnů a v rozpisu je okruh, který jen přidává „nemůže“: nepokrývá dny a ostatní z něj vidí jen tři stavy. Termín se týká jen těch, kdo jdou (organizátor a kdo odpověděl „jdu“): server ho zapíše tomu, kdo má automatický zápis, ostatních se aplikace zeptá. Změna názvu události změní. Odpověď „nejdu“, nový termín, zrušení termínu, odchod z akce, zrušení pozvánky nebo smazání akce je smaže. Odpojení a smazání účtu odvolá přístup u Googlu. V režimu Testing Google přístup ke kalendáři po 7 dnech odvolá, aplikace to pozná a nabídne připojit znovu. Bez klíče je kalendář vypnutý a zbytek aplikace běží (`server/calendar/`, testy v `server/calendar.test.ts`).

**Vývojové přihlášení.** `GOOGLE_FAKE=1` zapne falešný Google s formulářem na e-mail a jméno a falešný kalendář se souhlasem jedním kliknutím (obsazenost prázdná, klíč k tokenům vývojový). V produkci (`NODE_ENV=production`) server s tímto nastavením odmítne nastartovat.

## Vývoj

1. `npm install`
2. Do `.env` (podle `.env.example`) doplň klíč k modelu a `GOOGLE_FAKE=1`.
3. `npm run dev` spustí frontend (Vite, http://localhost:5173) a server (port 8787) najednou.

Server se po změně v `server/`, `src/core`, `src/contract` nebo `src/llm` restartuje jako nový proces: starý se zastaví, zavře databázi a skončí, teprve pak se spustí nový (`scripts/dev.mjs`). Nepouštěj server přes `vite-node --watch`. Ten ho spouští znovu ve stejném procesu, nad adresářem PGlite pak můžou běžet dvě instance a databázi poškodí.

Bez `DATABASE_URL` běží databáze PGlite v adresáři `.local/pglite` (Postgres v procesu, nic se neinstaluje). Smazáním adresáře začneš s prázdnou databází. Testy serveru (`npm test`) běží nad PGlite v paměti a s falešným Googlem, model nevolají.

Ukázka bez přihlášení je na adrese `/?ukazka`: běží celá v prohlížeči, nic neukládá a podklady nečte.

## Návod: Google Cloud

Ověřeno v dokumentaci Googlu k 19. 11. 2026. Nastavení se teď jmenuje Google Auth Platform a nahradilo dřívější stránku „OAuth consent screen“.

Založ dva projekty: jeden pro vývoj (adresa `http://localhost:5173`) a jeden pro nasazenou aplikaci. Zásady Googlu chtějí, aby produkční klient neobsahoval testovací adresy.

1. **Projekt.** console.cloud.google.com, nabídka, IAM & Admin, Create a Project.
2. **Kalendář.** APIs & Services, Library, Google Calendar API, Enable.
3. **Obrazovka souhlasu.** Google Auth Platform, Branding, Get Started. Vyplň název aplikace a kontaktní e-mail, v Audience zvol External.
4. **Testovací uživatelé.** Audience, Test users, Add users: e-maily týmu.
5. **Oprávnění.** Data Access, Add or remove scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Pro kalendář přidej `.../auth/calendar.freebusy` a `.../auth/calendar.app.created` (objeví se až po zapnutí Google Calendar API). Console je 20. 11. 2026 zařadila obě mezi necitlivá, takže kvůli nim uživatel neuvidí varování o citlivých oprávněních.
6. **Klient.** Google Auth Platform, Clients, Create Client, typ Web application. Do Authorized redirect URIs zadej přesně:
   - vývoj: `http://localhost:5173/api/auth/google/callback`
   - produkce: `https://<adresa z hostingu>/api/auth/google/callback`

   Tajemství klienta se ukáže jen jednou, hned si ho ulož.

Do proměnných prostředí (do `.env`, nebo do hostingu) pak patří `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`. Nikomu je neposílej, ani do chatu.

**Co znamená režim aplikace.** V režimu Testing se přihlásí nejvýš 100 ručně zapsaných uživatelů. Pro samotné přihlášení (jen `openid email profile`) souhlas nevyprší, oprávnění ke kalendáři ale po 7 dnech ano. Po zveřejnění (Publish app) bez ověření se může přihlásit kdokoli. Pokud jsou oprávnění ke kalendáři citlivá, uživatel uvidí varování o neověřené aplikaci a strop je 100 uživatelů. Ověření aplikace (doména, video, až 10 dní) pro semestrální projekt nedoporučujeme. Doporučení: vývojový projekt nechat v Testing, produkční zveřejnit.

## Návod: hosting na Railway

Doporučení z 19. 11. 2026: Railway, plán Hobby za 5 USD měsíčně (zahrnuje 5 USD využití, odhadem stačí). Server i Postgres jsou v jednom projektu, region Amsterdam. Je potřeba platební karta. Záloha: Render (Frankfurt), asi 13 USD měsíčně.

Heroku se studentským kreditem by vyšlo zdarma, ale jeho směrovač ukončí požadavek, který do 30 sekund nevrátí první bajt. Čtení modelem trvá déle a vyžadovalo by frontu úloh.

1. Účet na railway.com. Zkušební verze stačí na vyzkoušení, pro trvalý provoz plán Hobby.
2. **Databáze.** V projektu „+ New“, Database, PostgreSQL. Veřejný přístup (Public Networking, TCP Proxy) u databáze nezapínej, aplikace se k ní připojí po vnitřní síti Railway.
3. **Služba s aplikací.** „+ New“, Empty Service (nebo rovnou GitHub Repository). V Settings, Networking dej Generate Domain: adresu potřebuješ dřív než klienta v Googlu.
4. **Region.** Výchozí je US East. V Settings, Scale přepni aplikaci i databázi na EU West (Amsterdam), obě musí být ve stejném regionu. Přesun databáze s daty způsobí krátký výpadek.
5. **Proměnné služby** (Variables, Raw Editor jde použít pro netajné hodnoty, tajné vlož každou zvlášť):
   - `NODE_ENV=production`
   - `APP_ORIGIN=https://<adresa služby>`, bez lomítka na konci
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (odkaz na databázi)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` z produkčního projektu Google
   - `LLM_PROVIDER` a klíč k modelu (`ANTHROPIC_API_KEY` a případně `ANTHROPIC_MODEL`, nebo `GEMINI_API_KEY` a `GEMINI_MODEL`)
   - `TOKEN_ENCRYPTION_KEY`: 32 náhodných bajtů v base64 pro šifrování tokenů ke kalendáři. Vyrobíš ho u sebe příkazem `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` a vložíš rovnou do Railway. Když ho později změníš, připojené kalendáře je potřeba připojit znovu.
   - volitelně `ALLOWED_EMAILS`, `READ_LIMIT_PER_USER_PER_DAY`, `READ_LIMIT_TOTAL_PER_DAY`
6. **Zdroj.** Settings, Source, Connect Repo a větev `main`. Railway musí mít na GitHubu přístup k repozitáři (aplikace Railway na GitHubu). Ke cizímu repozitáři ho musí povolit jeho vlastník.
7. **Kontrola běhu.** Settings, Deploy, Healthcheck Path: `/api/health`. Nová verze se pak pustí ven, až když server odpovídá.
8. **Sestavení a start** Railway (Railpack) pozná sám: `npm install`, `npm run build` a `npm start`. Verzi Node bere nejdřív z `.nvmrc` (proto je tam `22`), až potom z `engines` v `package.json`. Migrace databáze spustí server při startu.

Změny v Railway se nejdřív jen připraví a projeví se až po „Deploy“ nahoře. Před potvrzením se podívej do „Details“, co čeká: jednou tam bylo omylem připravené smazání databáze. Pozor, Details ukazuje hodnoty proměnných i s klíči.

Bez kompletního nastavení server záměrně nenastartuje a v Deploy Logs řekne proč, třeba „Chybí GOOGLE_CLIENT_ID a GOOGLE_CLIENT_SECRET“.

Zálohy databáze na plánu Hobby Railway podle dostupných informací automaticky nedělá. Před ukázkou nebo odevzdáním si zálohu udělej sám: `pg_dump "$DATABASE_URL" > zaloha.sql`.

## Současné nasazení

Stav k 19. 11. 2026.

| Co              | Jak                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Adresa          | https://sladit-production.up.railway.app                                                              |
| Hosting         | Railway, zkušební verze (30 dní nebo 5 USD), služby `sladit` a `Postgres`, region EU West (Amsterdam) |
| Zdroj kódu      | Soukromá kopie repozitáře u jednoho člena týmu, větev `main`. Každý push do ní spustí nové nasazení.  |
| Model           | Claude (`claude-opus-5-5`), klíč jen v proměnných Railway                                             |
| Přihlášení      | Produkční projekt „Sladit“ v Google Cloudu, režim Testing, jen `openid email profile`                 |
| Kdo se přihlásí | Jen testovací uživatelé zapsaní v Google (Audience) a zároveň uvedení v `ALLOWED_EMAILS`              |

Ověřeno po nasazení: `/api/health` odpovídá (databáze připojená, migrace proběhly), přihlášení přes Google funguje, bez přihlášení API vrací `401`, změny bez hlavičky Origin nebo z cizí stránky `403`, falešný Google v produkci neexistuje, přesměrování na Google má správnou redirect URI, PKCE a cookie s `HttpOnly`, `Secure` a `SameSite`. JavaScript pro prohlížeč neobsahuje žádný klíč.

Nového člena týmu pustíš dovnitř ve dvou krocích: přidej jeho e-mail do Test users v Google Auth Platform (Audience) a do `ALLOWED_EMAILS` v Railway.

## Co zatím chybí

- Google Kalendář v produkci: Google Calendar API je zapnuté a obě oprávnění přidaná (20. 11. 2026), chybí ještě `TOKEN_ENCRYPTION_KEY` v Railway.
- Návrhy a upozornění od AI (fáze 7), třeba „dlouho jste se neviděli“.
- Pohled ze serveru se obnoví při otevření akce a po vlastní změně. Změnu rozpisu jiného člena uvidíš až po přepnutí na jinou akci a zpět nebo po obnovení stránky.
- Nasazení běží ze soukromé kopie repozitáře. Až bude práce ve společném repozitáři, přepni v Railway zdroj služby na něj (vlastník repozitáře musí Railway povolit přístup).
- Po skončení zkušební verze Railway je potřeba plán Hobby (platební karta).
