# Sladit

AI nástroj, který z rozpisů směn v libovolném formátu (Excel, fotka, screenshot, PDF, text) najde společný termín pro skupinu.
Semestrální projekt do předmětu Umělá inteligence.

> Stav: přihlášení přes Google, rozpisy a akce v účtu, skupiny s pozvánkou odkazem (ostatní vidí jen může, nemůže, nevíme), čtení rozpisů přes server (Gemini nebo Claude), výpočet termínů a měření fungují. Poslední měření na vygenerovaných podkladech: 121 ze 121 směn správně, správný termín u 23 z 23 skupin (model `claude-opus-5-5`). Skutečné fotky rozpisů v testovací sadě zatím nejsou. Google Kalendář se připravuje.

## Spuštění

Potřebuješ [Node.js](https://nodejs.org) 22.

1. `npm install`
2. Zkopíruj `.env.example` jako `.env`. Doplň klíč k modelu (`GEMINI_API_KEY` a `GEMINI_MODEL`, nebo `LLM_PROVIDER=claude` a `ANTHROPIC_API_KEY`) a pro vývoj bez Googlu `GOOGLE_FAKE=1`.
3. `npm run dev` spustí frontend i server najednou.
4. Otevři http://localhost:5173 a přihlas se. S `GOOGLE_FAKE=1` se místo Googlu otevře formulář na e-mail a jméno.

Databáze ve vývoji běží sama (PGlite v `.local/pglite`), nic se neinstaluje. Ukázka bez přihlášení je na `/?ukazka`.

Klíče čte jen server, do prohlížeče se nedostanou. Proto v `.env` nesmí žádný klíč mít předponu `VITE_`. Soubor `.env` se do gitu nedává. Všechny proměnné jsou v `.env.example`, server, soukromí a nasazení popisuje [docs/BACKEND.md](docs/BACKEND.md).

## Příkazy

| Příkaz              | Co dělá                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `npm run dev`       | vývoj: frontend i server                                                  |
| `npm run build`     | kontrola typů, sestavení frontendu do `dist/` a serveru do `dist-server/` |
| `npm start`         | spuštění sestavené aplikace (produkce)                                    |
| `npm run typecheck` | jen kontrola typů                                                         |
| `npm test`          | testy (Vitest)                                                            |
| `npm run lint`      | kontrola kódu (ESLint)                                                    |
| `npm run format`    | formátování (Prettier)                                                    |
| `npm run eval`      | měření (eval/), viz níže                                                  |
| `npm run eval:data` | znovu vygeneruje testovací data                                           |

## Jak se čtou rozpisy

Čtení má čtyři fáze: rozpoznání podkladu, strukturální čtení modelem, převod na konkrétní dny v kódu a kontroly s druhým čtením při nejistotě. Popis, schéma odpovědi modelu, pravidla kontrol a postup, jak pipeline měnit, jsou v [docs/PIPELINE.md](docs/PIPELINE.md).

## Měření

`npm run eval` přečte testovací rozpisy z `eval/data/schedules/` modelem, porovná je se správnými směnami (`expected.json`) a ověří, zda se správný termín objeví mezi 3 návrhy ve skupinách z `eval/data/scenarios/`. Hlídá i falešné „může“ v návrzích a zda verdikt „jistý termín“ nikdy neselže. Co které skupiny ověřují, je v [docs/PIPELINE.md](docs/PIPELINE.md). Výsledky jsou v `eval/results/<datum>.md` a `.json`. Surové odpovědi modelu se ukládají do `eval/results/cache/requests/`, takže změna kódu se přepočítá bez volání modelu.

- `npm run eval -- --expected-only` počítá jen scheduler nad správnými směnami, bez modelu.
- `npm run eval -- --only s01,s05` měří jen vybrané rozpisy.
- `npm run eval -- --no-cache` ignoruje uloženou cache.

Data jsou fiktivní a vyrábí je `npm run eval:data` (jen macOS, používá `cupsfilter` a `sips`). Už vykreslené podklady nepřepisuje, aby zůstala platná cache odpovědí modelu, `-- --force` vykreslí vše znovu. Správné směny jsou zdroj pravdy, z nich se vykreslí podklad (xlsx, text, PDF, PNG) i `expected.json`. PDF a snímky jsou vykreslený text, žádná skutečná fotka rozpisu, tu je potřeba doplnit ručně. Očekávaný termín skupiny je nejlepší návrh schedulerem nad správnými směnami, takže měření ověřuje, zda chyby čtení termín nezmění.

Příklady v `src/llm/skill/examples/` nejsou součástí testovacích dat.

## Technologie

Vue 3, TypeScript, Vite, Tailwind CSS, Zod, ExcelJS (čtení xlsx), Vitest, ESLint, Prettier. Server: Node, Hono, Postgres (`pg`, ve vývoji PGlite). Model: Gemini přes REST (`fetch`), volitelně Claude přes `@anthropic-ai/sdk`.

## Struktura

```
src/
├─ main.ts, App.vue, styles.css
├─ session.ts   stav aplikace v prohlížeči: kopie dat z účtu, rozpracovaný člověk, výběr
├─ core/        čistá logika (schémata, skládání rozpisu, plánovač), bez Vue a bez sítě
├─ contract/    schémata požadavků a odpovědí API, sdílí je prohlížeč i server
├─ client/      rozhraní k serveru (HTTP) a jeho varianta v paměti pro testy a ukázku
├─ llm/         čtení modelem (jen server a měření), ingest.ts připravuje podklad v prohlížeči
│  ├─ reading / expand / checks   čtení modelem, převod na dny, kontroly
│  └─ skill/    instrukce, slovník zkratek, vzorové rozpisy
└─ ui/
   ├─ steps/       obrazovky
   └─ components/  komponenty
server/         API: přihlášení, rozpisy, akce, skupiny, čtení (app.ts), pohled pro členy (view.ts), databáze (db/)
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
