# Sladit

AI nástroj, který z rozpisů směn v libovolném formátu (Excel, fotka, screenshot, PDF, text) najde společný termín pro skupinu.
Semestrální projekt do předmětu Umělá inteligence.

> Stav: hotové rozhraní bez čtení rozpisů a bez výpočtu termínů. Směny jde zadat ručně nebo otevřít ukázkovou akci.

## Spuštění

Potřebuješ [Node.js](https://nodejs.org) 20.12 nebo novější.

1. `npm install`
2. Zkopíruj `.env.example` jako `.env` a doplň vlastní klíč z Google AI Studia.
3. `npm run dev`
4. Otevři adresu, kterou příkaz vypíše (obvykle http://localhost:5173).

Soubor `.env` se do gitu nedává. Sestavenou aplikaci (`dist/`) nikam veřejně nenahrávej, klíč je v ní čitelný.

## Příkazy

| Příkaz              | Co dělá                              |
| ------------------- | ------------------------------------ |
| `npm run dev`       | vývojový server                      |
| `npm run build`     | kontrola typů a sestavení do `dist/` |
| `npm run typecheck` | jen kontrola typů                    |
| `npm test`          | testy (Vitest)                       |
| `npm run lint`      | kontrola kódu (ESLint)               |
| `npm run format`    | formátování (Prettier)               |

## Technologie

Vue 3, TypeScript, Vite, Tailwind CSS, Vitest, ESLint, Prettier. Bez backendu a bez databáze.

## Struktura

```
src/
├─ main.ts, App.vue, styles.css
├─ session.ts   stav aplikace: akce, rozpracovaný člověk, vybraný den
├─ core/        čistá logika (schémata, výpočet termínů), bez Vue a bez sítě
├─ llm/         jediné místo, které mluví s modelem
│  └─ skill/    instrukce, slovník zkratek, vzorové rozpisy
└─ ui/
   ├─ steps/       obrazovky
   └─ components/  komponenty
eval/
├─ data/schedules/   testovací rozpisy se správnými odpověďmi
├─ data/scenarios/   testovací skupiny se správným termínem
└─ results/          výsledky měření
```

Pravidlo závislostí: `ui → llm → core`. Složka `core` neimportuje nic z `ui` ani `llm`.

Barvy a písmo jsou v `src/styles.css` jako Tailwind proměnné (například `bg-ground`, `text-ink`, `bg-accent`).

## Tým

Ondřej Studničný, Radek Dvořák, David Krčmář, Lukáš Řehořek
