import type { SourceContent } from '@/core/schema'
import type { ExtractInput } from '@/llm/extract'
import { createApp } from './app'
import { fakeGoogle } from './auth/google'
import { fakeCalendar } from './calendar/api'
import { serverConfigFromEnv, type ServerConfig } from './config'
import { migrate, pgliteDb } from './db/db'
import { createStore } from './db/store'

/** Pomůcky pro testy serveru: aplikace nad PGlite v paměti, falešný Google a prohlížeč s cookies. */

export const ORIGIN = 'http://localhost:5173'

export const readContent: SourceContent = {
  circle: 'Práce',
  coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
  shifts: [
    { date: '2026-11-24', start: '06:00', end: '14:00', label: 'R', raw: 'R', uncertain: false },
  ],
  warnings: [],
  parity: { calendar: false, anchors: [] },
}

export async function testServer(
  env: Record<string, string> = {},
  extract: (input: ExtractInput) => Promise<SourceContent> = async () => readContent,
  /** Hodiny serveru, třeba pro vypršení pozvánky. */
  now?: () => Date,
) {
  const db = await pgliteDb()
  await migrate(db)
  const config: ServerConfig = serverConfigFromEnv({
    GOOGLE_FAKE: '1',
    APP_ORIGIN: ORIGIN,
    LLM_PROVIDER: 'claude',
    ANTHROPIC_API_KEY: 'test',
    ...env,
  })
  const store = createStore(db)
  const calendar = fakeCalendar(ORIGIN)
  const app = createApp({ config, store, google: fakeGoogle(ORIGIN), extract, now, calendar })
  return { app, db, store, config, calendar }
}

type App = Awaited<ReturnType<typeof testServer>>['app']

/** Prohlížeč jednoho uživatele: drží cookies a posílá hlavičku Origin jako skutečný prohlížeč. */
export function browser(app: App) {
  const cookies = new Map<string, string>()

  function remember(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const [name, value] = pair.split('=')
      const expired = attributes.some((item) => /max-age=0/i.test(item.trim()))
      if (expired || value === '') cookies.delete(name.trim())
      else cookies.set(name.trim(), value)
    }
  }

  async function request(path: string, init: RequestInit & { origin?: string | null } = {}) {
    const headers = new Headers(init.headers)
    if (cookies.size > 0) {
      headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    }
    const origin = init.origin === undefined ? ORIGIN : init.origin
    if (origin) headers.set('origin', origin)
    const response = await app.request(path, { ...init, headers })
    remember(response)
    return response
  }

  return {
    cookies,
    request,
    get: (path: string) => request(path),
    send: (method: string, path: string, body?: unknown) =>
      request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    /** Projde přihlášením přes falešný Google až do konce. */
    async login(email: string, name = email.split('@')[0]) {
      const start = await request('/api/auth/google')
      const fake = new URL(start.headers.get('location')!)
      const state = fake.searchParams.get('state')!
      const approve = await request(
        `/api/auth/fake-google/approve?${new URLSearchParams({ state, email, name })}`,
      )
      const callback = new URL(approve.headers.get('location')!)
      return request(`${callback.pathname}${callback.search}`)
    },
  }
}
