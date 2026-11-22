import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { draftAction } from '@/llm/actionDraft'
import { clarifyAnswers } from '@/llm/clarify'
import { buildSource } from '@/llm/review'
import { depsFromConfig, extractWithReport } from '@/llm/extract'
import { createApp } from './app'
import { fakeGoogle, realGoogle } from './auth/google'
import { fakeCalendar, realCalendar } from './calendar/api'
import { serverConfigFromEnv } from './config'
import { migrate, pgliteDb, postgresDb } from './db/db'
import { createStore } from './db/store'

/**
 * Spuštění serveru. Ve vývoji (`npm run dev`) podává jen API a frontend běží přes Vite,
 * v produkci (`npm start`) podává i sestavený frontend z dist/.
 */

// Ve vývoji se nastavení čte z .env. V produkci ho dodává hosting v proměnných prostředí.
if (process.env.NODE_ENV !== 'production' && existsSync('.env')) process.loadEnvFile('.env')

const config = serverConfigFromEnv(process.env)
if (config.legacyLlmNames.length > 0) {
  console.warn(`Přejmenuj v .env: ${config.legacyLlmNames.join(', ')} (bez předpony VITE_).`)
}

/** Spustí server. Když mezitím přijde restart (vývoj), skončí dřív, než otevře port. */
async function start() {
  const db = config.databaseUrl ? postgresDb(config.databaseUrl) : await pgliteDb(config.pgliteDir)
  const applied = await migrate(db)
  if (applied.length > 0) console.log(`Migrace databáze: ${applied.join(', ')}`)
  if (stopping) return { db, server: null }

  const store = createStore(db)
  // Oprava přepočtu doptání se projeví i u podkladů, které už jsou zodpovězené.
  const rebuilt = await store.rebuildReviewedSources(buildSource)
  if (rebuilt > 0) console.log(`Přepočítané podklady s doptáním: ${rebuilt}`)
  const google =
    config.google.mode === 'fake'
      ? fakeGoogle(config.appOrigin)
      : realGoogle(config.google.clientId, config.google.clientSecret)
  const extractDeps = depsFromConfig(config.llm)

  const calendar =
    config.google.mode === 'fake'
      ? fakeCalendar(config.appOrigin)
      : realCalendar(config.google.clientId, config.google.clientSecret)
  if (!config.tokenKey) {
    console.warn('Google Kalendář je vypnutý: chybí TOKEN_ENCRYPTION_KEY (32 bajtů v base64).')
  }

  const app = createApp({
    config,
    store,
    google,
    calendar,
    extract: async (input) => {
      const { source, basis } = await extractWithReport(input, extractDeps)
      return { source, basis }
    },
    clarify: (input) => clarifyAnswers(input, extractDeps),
    draftAction: (input) => draftAction(input, extractDeps),
    clientDir: config.production ? './dist' : undefined,
  })

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    const mode = config.production ? 'produkce' : 'vývoj'
    const login = config.google.mode === 'fake' ? 'falešný Google' : 'Google'
    console.log(`Sladit server (${mode}, přihlášení: ${login}) na portu ${info.port}`)
  })
  return { db, server }
}

let stopping = false
const started = start()

// Hosting server ukončuje signálem. Spojení s databází se zavřou čistě.
const stop = () => {
  void started.then(({ db }) => db.close()).finally(() => process.exit(0))
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop)

// Vývoj (vite-node --watch): po změně se tento soubor spustí znovu ve stejném procesu.
// Starý server musí nejdřív doběhnout a uvolnit port i databázi, jinak by dál běžel starý kód
// a dvě PGlite nad jedním adresářem by si mohly poškodit data. vite-node na tohle počká.
import.meta.hot?.on('vite:beforeFullReload', async () => {
  stopping = true
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.off(signal, stop)
  const running = await started.catch(() => null)
  if (!running) return
  const { server } = running
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      if ('closeAllConnections' in server) server.closeAllConnections()
    })
  }
  await running.db.close()
})

await started
