import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { depsFromConfig, extractSchedule } from '@/llm/extract'
import { createApp } from './app'
import { fakeGoogle, realGoogle } from './auth/google'
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

const db = config.databaseUrl ? postgresDb(config.databaseUrl) : await pgliteDb(config.pgliteDir)
const applied = await migrate(db)
if (applied.length > 0) console.log(`Migrace databáze: ${applied.join(', ')}`)

const store = createStore(db)
const google =
  config.google.mode === 'fake'
    ? fakeGoogle(config.appOrigin)
    : realGoogle(config.google.clientId, config.google.clientSecret)
const extractDeps = depsFromConfig(config.llm)

const app = createApp({
  config,
  store,
  google,
  extract: (input) => extractSchedule(input, extractDeps),
  clientDir: config.production ? './dist' : undefined,
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  const mode = config.production ? 'produkce' : 'vývoj'
  const login = config.google.mode === 'fake' ? 'falešný Google' : 'Google'
  console.log(`Sladit server (${mode}, přihlášení: ${login}) na portu ${info.port}`)
})

// Hosting server ukončuje signálem. Spojení s databází se zavřou čistě.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void db.close().finally(() => process.exit(0))
  })
}
