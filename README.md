# Sladit

AI nástroj, který z rozpisů směn v libovolném formátu (Excel, fotka, screenshot, PDF, text) najde společný termín pro skupinu.
Semestrální projekt do předmětu Umělá inteligence.

> Stav: přihlášení přes Google, vlastní rozpis v účtu (Můj rozvrh), přátelé přes odkaz i e-mail, skupiny (odkazem i z přátel), doptání po čtení (tlačítka i vlastní slova přes AI), akce s pozvanými (i odkazem rovnou do akce) a domluvou termínu (jdu, nejdu, jiný termín), akce z jedné věty přes AI, upozornění v aplikaci (ostatní vidí jen může, nemůže, nevíme), čtení rozpisů přes server (Gemini nebo Claude), výpočet termínů a měření fungují. Poslední měření na vygenerovaných podkladech: 121 ze 121 směn správně, správný termín u 23 z 23 skupin (model `claude-opus-5-5`). Skutečné fotky rozpisů v testovací sadě zatím nejsou. Aplikace je nasazená na Railway, viz [docs/BACKEND.md](docs/BACKEND.md). Google Kalendář (obsazenost a zápis domluvených akcí) se připojuje v Nastavení.

## Spuštění u sebe

Potřebuješ jen Git a [Node.js](https://nodejs.org) 22 (s nvm stačí `nvm use`, verze je v `.nvmrc`). Databáze ve vývoji běží v procesu (PGlite v `.local/pglite`), nic dalšího se neinstaluje ani nenastavuje v Google Cloudu.

1. **Kód.** Poprvé `git clone <adresa repa>` a `cd sladit`, příště jen `git pull`.
2. **Závislosti.** `npm install`. Po `git pull` znovu, když se změnil `package.json`.
3. **Nastavení.** Zkopíruj `.env.example` jako `.env` (`cp .env.example .env`) a vyplň:
   - `GOOGLE_FAKE=1`: přihlášení i Google Kalendář jsou falešné, Google účet ani klíče k němu nepotřebuješ.
   - klíč k modelu, který čte rozpisy: buď `LLM_PROVIDER=claude` a `ANTHROPIC_API_KEY`, nebo `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` a `GEMINI_MODEL`. Klíč si vyžádej v týmu soukromou zprávou, do gitu ani do společného chatu nepatří. Bez klíče funguje všechno kromě čtení podkladů.
   - ostatní nech prázdné.
4. **Spuštění.** `npm run dev` spustí frontend i server najednou. Server se po změně kódu restartuje sám, frontend se obnoví v prohlížeči.
5. **Přihlášení.** Otevři http://localhost:5173 a klikni na „Přihlásit přes Google“. Otevře se stránka „Falešný Google“, kde zadáš libovolný e-mail a jméno. Druhého uživatele (třeba na zkoušku přátel a akcí) přihlas v anonymním okně nebo v jiném prohlížeči s jiným e-mailem.

Ukázka bez přihlášení je na http://localhost:5173/?ukazka: běží celá v prohlížeči a nic neukládá.

### Když něco nejde

- **`npm install` nebo `npm run dev` hlásí chybu:** zkontroluj `node -v`, má být 22.
- **Port 5173 nebo 8787 je obsazený:** nejspíš ti běží starší `npm run dev`. Ukonči ho (Ctrl+C) a spusť znovu.
- **Čtení podkladu skončí chybou:** chybí nebo nesedí klíč k modelu v `.env`. Po změně `.env` restartuj `npm run dev`.
- **Chyba databáze nebo podivná data:** zastav `npm run dev` a smaž adresář `.local/pglite`. Začneš s prázdnou databází.
- **Nahoře „V tomto prohlížeči jsou uložené akce z doby před účty“:** stará data z prohlížeče, stačí „Teď ne“.

### Než pushneš

Pusť `npm run typecheck`, `npm run lint` a `npm test`. Testy model nevolají a nic nestojí. `npm run eval` volá placený model, pouštěj ho jen po domluvě v týmu.

Klíče čte jen server, do prohlížeče se nedostanou. Proto v `.env` nesmí žádný klíč mít předponu `VITE_`. Soubor `.env` se do gitu nedává. Všechny proměnné jsou v `.env.example`, server, soukromí a nasazení popisuje [docs/BACKEND.md](docs/BACKEND.md).

## Příkazy

| Příkaz                    | Co dělá                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`             | vývoj: frontend i server                                                   |
| `npm run build`           | kontrola typů, sestavení frontendu do `dist/` a serveru do `dist-server/`  |
| `npm start`               | spuštění sestavené aplikace (produkce)                                     |
| `npm run typecheck`       | jen kontrola typů                                                          |
| `npm test`                | testy (Vitest)                                                             |
| `npm run test:coverage`   | pokrytí Vitestu nad `src/` a `server/`, HTML a JSON v `coverage/`          |
| `npm run test:e2e`        | test v Chromiu nad sestavenou aplikací a izolovanou databází v paměti      |
| `npm run test:profile-db` | časy otevření PGlite, migrací a zbytku scénářů ve dvou integračních sadách |
| `npm run lint`            | kontrola kódu (ESLint)                                                     |
| `npm run format`          | formátování (Prettier)                                                     |
| `npm run eval`            | měření (eval/), viz níže                                                   |
| `npm run eval:data`       | znovu vygeneruje testovací data                                            |

Před prvním během E2E nainstaluj Chromium příkazem `npx playwright install chromium`. Testy modulů a komponent leží vedle zdrojového kódu, scénáře přes celou aplikaci v `e2e/`. Pokrytí V8 zahrnuje i nenačtené komponenty Vue. Běh v Chromiu se vykazuje samostatně.

## Jak se čtou rozpisy

Čtení má čtyři fáze: rozpoznání podkladu, strukturální čtení modelem, převod na konkrétní dny v kódu a kontroly s druhým čtením při nejistotě. Popis, schéma odpovědi modelu, pravidla kontrol a postup, jak pipeline měnit, jsou v [docs/PIPELINE.md](docs/PIPELINE.md).

## Měření

`npm run eval` přečte testovací rozpisy z `eval/data/schedules/` modelem, porovná je se správnými směnami (`expected.json`) a ověří, zda se správný termín objeví mezi 3 návrhy ve skupinách z `eval/data/scenarios/`. Hlídá i falešné „může“ v návrzích a zda verdikt „jistý termín“ nikdy neselže. Co které skupiny ověřují, je v [docs/PIPELINE.md](docs/PIPELINE.md). Výsledky jsou v `eval/results/<datum>.md` a `.json`. Surové odpovědi modelu se ukládají do `eval/results/cache/requests/`, takže změna kódu se přepočítá bez volání modelu.

- `npm run eval -- --expected-only` počítá jen scheduler nad správnými směnami, bez modelu.
- `npm run eval -- --only s01,s05` měří jen vybrané rozpisy.
- `npm run eval -- --no-cache` ignoruje uloženou cache.

Data jsou fiktivní a vyrábí je `npm run eval:data` (jen macOS, používá `cupsfilter` a `sips`). Už vykreslené podklady nepřepisuje, aby zůstala platná cache odpovědí modelu, `-- --force` vykreslí vše znovu. Správné směny jsou zdroj pravdy, z nich se vykreslí podklad (xlsx, text, PDF, PNG) i `expected.json`. PDF a snímky jsou vykreslený text, žádná skutečná fotka rozpisu, tu je potřeba doplnit ručně. Očekávaný termín skupiny je nejlepší návrh schedulerem nad správnými směnami, takže měření ověřuje, zda chyby čtení termín nezmění.

Skutečnou anonymizovanou fotografii přidej do vlastního adresáře v `eval/data/schedules/` jako `input.jpg` nebo `input.png` spolu s ručně ověřeným `expected.json` a odpovídajícím `meta.json`. Zadej `"format": "photo"`, aby report vypočítal pro fotografie samostatnou precision a recall.

Příklady v `src/llm/skill/examples/` nejsou součástí testovacích dat.

## Technologie

Vue 3, TypeScript, Vite, Tailwind CSS, Zod, ExcelJS (čtení xlsx), Vitest, ESLint, Prettier. Server: Node, Hono, Postgres (`pg`, ve vývoji PGlite). Model: Gemini přes REST (`fetch`), volitelně Claude přes `@anthropic-ai/sdk`.

## Struktura

```
src/
├─ main.ts, App.vue, styles.css
├─ session.ts   stav aplikace v prohlížeči: kopie dat z účtu, nepřečtené soubory, otevřená stránka
├─ core/        čistá logika (schémata, skládání rozpisu, plánovač), bez Vue a bez sítě
├─ contract/    schémata požadavků a odpovědí API, sdílí je prohlížeč i server
├─ client/      rozhraní k serveru (HTTP) a jeho varianta v paměti pro testy a ukázku
├─ llm/         čtení modelem (jen server a měření), ingest.ts připravuje podklad v prohlížeči
│  ├─ reading / expand / checks   čtení modelem, převod na dny, kontroly
│  └─ skill/    instrukce, slovník zkratek, vzorové rozpisy
└─ ui/
   ├─ pages/       stránky: Můj rozvrh, Přátelé, Nastavení, akce
   └─ components/  komponenty
server/         API: přihlášení, rozpisy, akce, přátelé, skupiny, čtení (app.ts), pohled pro účastníky (view.ts), databáze (db/)
docs/           pipeline čtení rozpisů, server a nasazení, nápady na funkce
eval/
├─ data/schedules/   testovací rozpisy se správnými odpověďmi
├─ data/scenarios/   testovací skupiny se správným termínem
└─ results/          výsledky měření
```

Pravidlo závislostí: v prohlížeči `ui → session → client → contract → core`, na serveru `server → llm → core`. Složka `core` neimportuje nic z ostatních.

Barvy a písmo jsou v `src/styles.css` jako Tailwind proměnné (například `bg-ground`, `text-ink`, `bg-accent`).

## Tým

Ondřej Studničný, Radek Dvořák, David Krčmář, Lukáš Řehořek
