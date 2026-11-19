# Server, účty a nasazení

Jak funguje serverová část Sladitu: přihlášení, ukládání rozpisů a akcí, čtení modelem přes server a nasazení na internet. Popis čtení rozpisů je v [PIPELINE.md](PIPELINE.md).

> Stav k 20. 11. 2026: hotové jsou fáze 3 až 5 (přihlášení, vlastní rozpis v účtu, čtení přes server, převzetí dat z prohlížeče, přátelé a skupiny přes odkaz, akce s pozvanými, potvrzení termínu a sdílení jen tří stavů). Aplikace je nasazená na https://sladit-production.up.railway.app a přihlášení přes Google tam funguje (viz [Současné nasazení](#současné-nasazení)). Google Kalendář (fáze 6) zatím není.

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

| Tabulka          | Co drží                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `users`          | Účet podle účtu Google: `google_sub`, e-mail, jméno.                                                        |
| `sessions`       | Přihlášení. V databázi je jen otisk tokenu (SHA-256), samotný token má jen cookie v prohlížeči.             |
| `oauth_states`   | Rozpracované přihlášení: náhodný `state` a ověřovač PKCE. Platí 15 minut a jde použít jen jednou.           |
| `people`         | Rozpis uživatele (`is_self`). Hosté z doby před fází 5 tu zůstali, aplikace je už nepoužívá.                |
| `sources`        | Přečtený podklad: okruh, názvy souborů, pokrytí, směny, poznámky, parita (JSON podle `src/core/schema.ts`). |
| `day_overrides`  | Ruční úprava jednoho dne. Nové čtení ji nepřepíše.                                                          |
| `actions`        | Akce: období, délka, denní okno, organizátor a potvrzený termín (`confirmed_*`).                            |
| `action_invites` | Pozvánka do akce a odpověď: `invited`, `accepted`, `declined`. Do termínu se počítá jen `accepted`.         |
| `friendships`    | Přátelství, vzájemné. Dvojice je uložená jednou, menší id první.                                            |
| `friend_invites` | Osobní odkaz „přidej si mě do přátel“: jen otisk tokenu, platnost 7 dní, případné zrušení.                  |
| `groups`         | Skupina: seznam lidí, které jde pozvat do akce najednou.                                                    |
| `memberships`    | Členství s rolí `owner` (zakladatel) nebo `member`.                                                         |
| `invites`        | Odkaz s pozvánkou do skupiny: jen otisk tokenu, platnost 7 dní, případné zrušení.                           |
| `read_usage`     | Počet čtení modelem za den podle času v Praze, kvůli limitům.                                               |

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
| `PUT`, `DELETE /people/:id/overrides/:date`            | Ruční úprava dne a její zrušení.                                   |
| `GET`, `POST /actions`, `PATCH`, `DELETE /actions/:id` | Akce. `POST` s `inviteUserIds` rovnou pozve.                       |
| `GET /actions/:id/view`                                | Návrhy, jistota termínu a stav dne ostatních (viz Soukromí).       |
| `POST /actions/:id/invites`                            | Pozvat další lidi (jen organizátor).                               |
| `DELETE /actions/:id/invites/:userId`                  | Zrušit pozvánku nebo odebrat účastníka (jen organizátor).          |
| `POST /actions/:id/response`                           | Odpověď pozvaného: `accept` přijme, jinak odmítne nebo odejde.     |
| `PUT`, `DELETE /actions/:id/confirmed`                 | Potvrzení termínu a jeho zrušení (jen organizátor).                |
| `GET /friends`, `DELETE /friends/:userId`              | Moji přátelé a moje platné odkazy, zrušení přátelství.             |
| `POST`, `DELETE /friends/invites(/:inviteId)`          | Nový osobní odkaz do přátel (jen tentokrát v odpovědi), zrušení.   |
| `GET`, `POST /groups`, `DELETE /groups/:id`            | Moje skupiny, nová skupina, smazání (jen zakladatel).              |
| `POST /groups/:id/leave`                               | Odchod ze skupiny.                                                 |
| `DELETE /groups/:id/members/:userId`                   | Zakladatel odebere člena.                                          |
| `POST /groups/:id/invites`                             | Nový odkaz s pozvánkou. Odkaz je v odpovědi jen tentokrát.         |
| `DELETE /groups/:id/invites/:inviteId`                 | Zrušení pozvánky.                                                  |
| `GET /invites/:token`, `POST /invites/:token/accept`   | Náhled a přijetí odkazu: do skupiny (`kind: group`), nebo přátel.  |
| `POST /import`                                         | Jednorázové převzetí akcí uložených v prohlížeči z doby před účty. |
| `GET /health`                                          | Kontrola pro hosting.                                              |

Chyby mají tvar `{ "error": "česká zpráva", "code": "…" }`. Kód `limit` je vyčerpaný denní limit čtení, `unreadable` nečitelný podklad (s polem `notes`), `busy` přetížený model, `invite` neplatná pozvánka, `full` plná skupina (50 členů), `self` vlastní odkaz do přátel.

Akci upravuje, maže, zve do ní a potvrzuje termín jen organizátor. Pozvaný dostane `403` s vysvětlením, kdo pozvaný není, dostane `404`. Potvrzený termín musí ležet v období a denním okně akce a mít její délku. Když se změní období, délka nebo okno, potvrzení zmizí.

## Soukromí a bezpečnost

**Kdo co vidí.** Rozpis (zdroje, směny, ruční úpravy, názvy souborů, poznámky ke čtení) vidí jen jeho vlastník. Každý dotaz do databáze, který čte nebo mění člověka, má v podmínce id vlastníka (`server/db/store.ts`). Cizí data tak nejde přečíst ani změnit, ani kdyby trasa zapomněla na kontrolu: odpověď je `404` a neprozradí, zda data existují. Testy v `server/app.test.ts` (oddíl „cizí data“) to zkoušejí za jiného uživatele i bez přihlášení.

**Akce.** Akci vidí organizátor a ti, kdo do ní dostali pozvánku a neodmítli ji. Do výpočtu termínu se pozvaný započítá až po přijetí. O ostatních účastnících každý dostane jen:

- jméno a odpověď na pozvánku (`GET /actions`),
- pro každý den období akce jen „může / nemůže / nevíme“ (`GET /actions/:id/view`),
- zda může v každém ze tří návrhů,
- u křehkého termínu den, na kterém záleží, bez důvodu (chybí rozpis, nebo nejisté čtení).

Návrhy a jejich jistotu počítá server ze všech rozpisů (`server/view.ts`). Rozpisy cizích lidí jen použije, ven je nepustí. Jediná metoda úložiště, která čte cizí rozpisy, je `actionForView` a volá ji jen tento výpočet. Přátelé ani členové skupin o sobě nevidí e-mail. Výpočet je v `src/core/sharedView.ts`, stejně ho počítá i ukázka bez přihlášení. Testy v `server/events.test.ts` hledají v odpovědích pro účastníka skutečné časy, označení, text z podkladu, poznámky i název souboru a zkoušejí přístup za pozvaného, za organizátora i za člověka, který pozvaný není.

**Odkazy s pozvánkou.** Do skupiny i do přátel vede odkaz `/pozvanka/<token>` s náhodným tokenem (32 bajtů). Server zná jen jeho otisk, takže odkaz ukáže jen jednou. Platí 7 dní, víc lidí ho může použít a ten, kdo ho vytvořil, ho může kdykoli zrušit. Přátelství vznikne, až druhý odkaz otevře a potvrdí. Prohlížeč adresu s tokenem hned přepíše na `/`, aby nezůstala v historii, a token podrží v `sessionStorage` přes přihlášení u Googlu.

**Odchod ze skupiny a konec přátelství.** Akcí se to netýká: kdo už pozvánku má nebo přijal, zůstává. Jen ho přes skupinu nebo přátelství nejde pozvat znovu. Zakladatel při odchodu nebo smazání účtu předá skupinu nejdéle přítomnému členovi, poslední člen ji odchodem smaže. Smazáním účtu zmizí i účast ve všech akcích.

**Zbytkové riziko.** Kdo smí měnit denní okno akce, může opakovanou změnou odhadnout, kdy končí cizí směny. Proto akci upravuje jen organizátor. Detekci takového zkoušení server nemá. Podobně trochu prozradí čas nejlepšího návrhu, když nezačíná na začátku okna.

**Přihlášení.** OAuth 2.0 s autorizačním kódem na serveru, s `state` (proti podstrčenému přihlášení je uložený v databázi i v cookie prohlížeče) a s PKCE. Z účtu Google se bere jen `openid email profile`. O kalendář se bude žádat zvlášť, až ho uživatel připojí (fáze 6). Relace je náhodný token v cookie `HttpOnly`, `SameSite=Lax` a v produkci `Secure`, platí 30 dní.

**Požadavky z cizí stránky (CSRF).** Server přijme změnu (`POST`, `PATCH`, `PUT`, `DELETE`) jen s hlavičkou `Origin` rovnou adrese aplikace, nebo bez ní se `Sec-Fetch-Site: same-origin`. Cookie navíc má `SameSite=Lax`.

**Čtení modelem.** Podklad se připraví v prohlížeči (`src/llm/ingest.ts`): z Excelu jde jen viditelná část, název souboru se modelu neposílá. Server přijme nejvýš 6 souborů, každý do 10 MB a dohromady do 25 MB. U obrázků a PDF podle prvních bajtů ověří, že soubor opravdu je tím, za co se vydává. Pokyny pro model skládá jen server. Denní limity: `READ_LIMIT_PER_USER_PER_DAY` (výchozí 30) a `READ_LIMIT_TOTAL_PER_DAY` (300). Čtení se započítá předem, i když selže. Volitelně `ALLOWED_EMAILS` pustí dovnitř jen vyjmenované účty.

**Tajemství.** Klíče jsou jen v proměnných prostředí serveru, v repozitáři žádné nejsou. Žádný klíč nesmí mít jméno začínající `VITE_`: takové proměnné Vite může vložit do aplikace pro prohlížeč. Server dřívější názvy s touto předponou ještě přečte, ale při startu vypíše, které je potřeba přejmenovat. Sestavení v `dist/` klíč neobsahuje, ověřeno 19. 11. 2026.

**Vývojové přihlášení.** `GOOGLE_FAKE=1` zapne falešný Google s formulářem na e-mail a jméno. V produkci (`NODE_ENV=production`) server s tímto nastavením odmítne nastartovat.

## Vývoj

1. `npm install`
2. Do `.env` (podle `.env.example`) doplň klíč k modelu a `GOOGLE_FAKE=1`.
3. `npm run dev` spustí frontend (Vite, http://localhost:5173) a server (port 8787) najednou.

Bez `DATABASE_URL` běží databáze PGlite v adresáři `.local/pglite` (Postgres v procesu, nic se neinstaluje). Smazáním adresáře začneš s prázdnou databází. Testy serveru (`npm test`) běží nad PGlite v paměti a s falešným Googlem, model nevolají.

Ukázka bez přihlášení je na adrese `/?ukazka`: běží celá v prohlížeči, nic neukládá a podklady nečte.

## Návod: Google Cloud

Ověřeno v dokumentaci Googlu k 19. 11. 2026. Nastavení se teď jmenuje Google Auth Platform a nahradilo dřívější stránku „OAuth consent screen“.

Založ dva projekty: jeden pro vývoj (adresa `http://localhost:5173`) a jeden pro nasazenou aplikaci. Zásady Googlu chtějí, aby produkční klient neobsahoval testovací adresy.

1. **Projekt.** console.cloud.google.com, nabídka, IAM & Admin, Create a Project.
2. **Kalendář** (až pro fázi 5). APIs & Services, Library, Google Calendar API, Enable.
3. **Obrazovka souhlasu.** Google Auth Platform, Branding, Get Started. Vyplň název aplikace a kontaktní e-mail, v Audience zvol External.
4. **Testovací uživatelé.** Audience, Test users, Add users: e-maily týmu.
5. **Oprávnění.** Data Access, Add or remove scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Pro fázi 5 přibudou `.../auth/calendar.freebusy` a `.../auth/calendar.app.created`. Až je přidáš, zapiš si, do které tabulky je Console zařadila (necitlivá, nebo citlivá). Dokumentace to neříká a závisí na tom, co uživatelé uvidí.
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

- Google Kalendář (fáze 6): obsazenost z kalendáře a zápis potvrzeného termínu. Automatický zápis půjde zapnout, kdo ho zapnutý nemá, toho se aplikace po potvrzení zeptá.
- Návrhy a upozornění od AI (fáze 7), třeba „dlouho jste se neviděli“.
- Pohled ze serveru se obnoví při otevření akce a po vlastní změně. Změnu rozpisu jiného člena uvidíš až po přepnutí na jinou akci a zpět nebo po obnovení stránky.
- Nasazení běží ze soukromé kopie repozitáře. Až bude práce ve společném repozitáři, přepni v Railway zdroj služby na něj (vlastník repozitáře musí Railway povolit přístup).
- Po skončení zkušební verze Railway je potřeba plán Hobby (platební karta).
