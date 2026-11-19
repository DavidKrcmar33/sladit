# Server, účty a nasazení

Jak funguje serverová část Sladitu: přihlášení, ukládání rozpisů a akcí, čtení modelem přes server a nasazení na internet. Popis čtení rozpisů je v [PIPELINE.md](PIPELINE.md).

> Stav k 19. 11. 2026: hotové jsou fáze 3 a 4 (přihlášení, rozpisy a akce v účtu, čtení přes server, převzetí dat z prohlížeče, skupiny s pozvánkou odkazem a sdílení jen tří stavů). Google Kalendář (fáze 5) zatím není.

## Proč server

- **Klíč k modelu nesmí být v prohlížeči.** Dřív byl v sestavené aplikaci čitelný. Teď ho zná jen server.
- **Rozpis patří člověku, ne akci.** Každý si spravuje svůj rozpis v účtu a použije ho ve více akcích.
- **Souhlas.** Dřív organizátor posílal modelu rozpisy kamarádů, aniž o tom věděli. S účty si každý nahrává svůj. Hosté bez účtu zůstávají a jejich rozpis vidí jen ten, kdo je přidal.
- **Kalendář.** Google Kalendář bez serveru připojit nejde (fáze 5).

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

| Tabulka               | Co drží                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `users`               | Účet podle účtu Google: `google_sub`, e-mail, jméno.                                                        |
| `sessions`            | Přihlášení. V databázi je jen otisk tokenu (SHA-256), samotný token má jen cookie v prohlížeči.             |
| `oauth_states`        | Rozpracované přihlášení: náhodný `state` a ověřovač PKCE. Platí 15 minut a jde použít jen jednou.           |
| `people`              | Člověk s rozpisem. Každý uživatel má jednoho sám za sebe (`is_self`), ostatní jsou jeho hosté.              |
| `sources`             | Přečtený podklad: okruh, názvy souborů, pokrytí, směny, poznámky, parita (JSON podle `src/core/schema.ts`). |
| `day_overrides`       | Ruční úprava jednoho dne. Nové čtení ji nepřepíše.                                                          |
| `actions`             | Akce a její parametry (období, délka, denní okno). `group_id` u akce ve skupině, jinak je akce osobní.      |
| `action_participants` | Lidé přidaní organizátorem: on sám (při založení) a jeho hosté. Členy skupiny se sem neukládají.            |
| `groups`              | Skupina a její název.                                                                                       |
| `memberships`         | Členství s rolí `owner` (zakladatel) nebo `member`.                                                         |
| `invites`             | Pozvánka odkazem: jen otisk tokenu (SHA-256), platnost 7 dní, případné zrušení.                             |
| `read_usage`          | Počet čtení modelem za den podle času v Praze, kvůli limitům.                                               |

Akce ve skupině patří všem současným členům: účastníci jsou lidé z `action_participants` a k nim „sám za sebe“ každého člena. Kdo se přidá později, je v akci hned, kdo odejde, z ní zmizí.

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
| `GET /people`                                          | Lidé uživatele (on a jeho hosté) i s rozpisy.                      |
| `PATCH /people/:id`                                    | Přejmenování.                                                      |
| `POST /people/:id/readings`                            | Přečte připravené podklady modelem a uloží nový zdroj.             |
| `PATCH`, `DELETE /people/:id/sources/:sourceId`        | Okruh, odpověď na lichý týden, smazání zdroje.                     |
| `PUT`, `DELETE /people/:id/overrides/:date`            | Ruční úprava dne a její zrušení.                                   |
| `GET`, `POST /actions`, `PATCH`, `DELETE /actions/:id` | Akce. `POST` s `groupId` založí akci ve skupině.                   |
| `GET /actions/:id/view`                                | Návrhy, jistota termínu a stav dne ostatních (viz Soukromí).       |
| `POST /actions/:id/guests`                             | Nový host v akci (jen organizátor).                                |
| `DELETE /actions/:id/participants/:personId`           | Odebrání z akce. Host, který už v žádné akci není, se smaže.       |
| `GET`, `POST /groups`, `DELETE /groups/:id`            | Moje skupiny, nová skupina, smazání (jen zakladatel).              |
| `POST /groups/:id/leave`                               | Odchod ze skupiny.                                                 |
| `DELETE /groups/:id/members/:userId`                   | Zakladatel odebere člena.                                          |
| `POST /groups/:id/invites`                             | Nový odkaz s pozvánkou. Odkaz je v odpovědi jen tentokrát.         |
| `DELETE /groups/:id/invites/:inviteId`                 | Zrušení pozvánky.                                                  |
| `GET /invites/:token`, `POST /invites/:token/accept`   | Náhled pozvánky (skupina, zakladatel, počet členů) a přijetí.      |
| `POST /import`                                         | Jednorázové převzetí akcí uložených v prohlížeči z doby před účty. |
| `GET /health`                                          | Kontrola pro hosting.                                              |

Chyby mají tvar `{ "error": "česká zpráva", "code": "…" }`. Kód `limit` je vyčerpaný denní limit čtení, `unreadable` nečitelný podklad (s polem `notes`), `busy` přetížený model, `invite` neplatná pozvánka, `full` plná skupina (50 členů).

Akci upravuje, maže a přidává do ní hosty jen organizátor. Člen skupiny dostane `403` s vysvětlením, kdo ve skupině není, dostane `404`.

## Soukromí a bezpečnost

**Kdo co vidí.** Rozpis (zdroje, směny, ruční úpravy, názvy souborů, poznámky ke čtení) vidí jen jeho vlastník: uživatel u sebe a u hostů, které přidal. Každý dotaz do databáze, který čte nebo mění člověka, má v podmínce id vlastníka (`server/db/store.ts`). Cizí data tak nejde přečíst ani změnit, ani kdyby trasa zapomněla na kontrolu: odpověď je `404` a neprozradí, zda data existují. Testy v `server/app.test.ts` (oddíl „cizí data“) to zkoušejí za jiného uživatele i bez přihlášení.

**Skupiny.** Akci vidí její organizátor a členové skupiny, ve které je. O ostatních účastnících člen dostane jen:

- jméno a zda jde o člena, nebo hosta organizátora (`GET /actions`),
- pro každý den období akce jen „může / nemůže / nevíme“ (`GET /actions/:id/view`),
- zda může v každém ze tří návrhů,
- u křehkého termínu den, na kterém záleží, bez důvodu (chybí rozpis, nebo nejisté čtení).

Návrhy a jejich jistotu počítá server ze všech rozpisů (`server/view.ts`). Rozpisy cizích lidí jen použije, ven je nepustí. Jediná metoda úložiště, která čte cizí rozpisy, je `actionForView` a volá ji jen tento výpočet. Členové o sobě navzájem nevidí e-mail. Testy v `server/groups.test.ts` hledají v odpovědích pro člena skutečné časy, označení, text z podkladu, poznámky i název souboru a zkoušejí přístup za člena, za organizátora i za člověka mimo skupinu.

**Pozvánka.** Náhodný token (32 bajtů) v odkazu `/pozvanka/<token>`. Server zná jen jeho otisk, takže odkaz ukáže jen jednou. Platí 7 dní, víc lidí ho může použít, zakladatel ho může kdykoli zrušit. Prohlížeč adresu s tokenem hned přepíše na `/`, aby nezůstala v historii, a token podrží v `sessionStorage` přes přihlášení u Googlu.

**Odchod a konec skupiny.** Kdo ze skupiny odejde nebo je odebrán, přijde o akce, které v ní pořádal, i s hosty, kteří nebyli jinde. Zakladatel při odchodu nebo smazání účtu předá skupinu nejdéle přítomnému členovi, poslední člen ji odchodem smaže.

**Zbytkové riziko.** Kdo smí měnit denní okno akce, může opakovanou změnou odhadnout, kdy končí cizí směny. Proto akci upravuje jen organizátor. Detekci takového zkoušení server nemá. Podobně trochu prozradí čas nejlepšího návrhu, když nezačíná na začátku okna.

**Přihlášení.** OAuth 2.0 s autorizačním kódem na serveru, s `state` (proti podstrčenému přihlášení je uložený v databázi i v cookie prohlížeče) a s PKCE. Z účtu Google se bere jen `openid email profile`. O kalendář se bude žádat zvlášť, až ho uživatel připojí (fáze 5). Relace je náhodný token v cookie `HttpOnly`, `SameSite=Lax` a v produkci `Secure`, platí 30 dní.

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

1. Účet na railway.com, plán Hobby.
2. **Nový projekt** z GitHub repozitáře (nebo prázdný a pak `railway up` z pracovního stromu).
3. **Databáze.** V projektu „+ New“, Database, PostgreSQL. Do služby s aplikací přidej proměnnou `DATABASE_URL` jako odkaz na databázi (Railway nabídne `${{Postgres.DATABASE_URL}}`).
4. **Proměnné služby:**
   - `NODE_ENV=production`
   - `APP_ORIGIN=https://<adresa služby>`, bez lomítka na konci
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` z produkčního projektu Google
   - `LLM_PROVIDER` a klíč k modelu (`ANTHROPIC_API_KEY`, nebo `GEMINI_API_KEY` a `GEMINI_MODEL`)
   - volitelně `ALLOWED_EMAILS`, `READ_LIMIT_PER_USER_PER_DAY`, `READ_LIMIT_TOTAL_PER_DAY`
5. **Veřejná adresa.** Settings, Networking, Generate Domain. Tu dej do `APP_ORIGIN` a do redirect URI v Googlu.
6. **Sestavení a start** Railway pozná sám: `npm run build` a `npm start`. Verze Node je v `package.json` (`engines`). Migrace databáze spustí server při startu. Kontrola běhu je `GET /api/health`.

Zálohy databáze na plánu Hobby Railway podle dostupných informací automaticky nedělá. Před ukázkou nebo odevzdáním si zálohu udělej sám: `pg_dump "$DATABASE_URL" > zaloha.sql`.

## Co zatím chybí

- Google Kalendář: obsazenost a zápis potvrzeného termínu (fáze 5).
- Člen skupiny se nemůže z jedné akce ve skupině odhlásit. Účastní se všech, dokud ve skupině je.
- Pohled ze serveru se obnoví při otevření akce a po vlastní změně. Změnu rozpisu jiného člena uvidíš až po přepnutí na jinou akci a zpět nebo po obnovení stránky.
- Nasazení zatím neproběhlo, čeká na účty v Google Cloudu a na Railway.
