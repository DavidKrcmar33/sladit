import { z } from 'zod'
import { llmConfigFromEnv, type LlmConfig } from '@/llm/config'
import { developmentKey } from './crypto'

/**
 * Nastavení serveru z proměnných prostředí. Při chybě server nenastartuje a řekne proč,
 * místo aby běžel s nebezpečným nastavením.
 */
export interface ServerConfig {
  production: boolean
  port: number
  /** Veřejná adresa aplikace bez lomítka na konci. Frontend i API jsou na ní. */
  appOrigin: string
  /** Postgres. Bez něj (jen mimo produkci) běží PGlite v adresáři pgliteDir. */
  databaseUrl?: string
  pgliteDir: string
  google: { mode: 'real'; clientId: string; clientSecret: string } | { mode: 'fake' }
  /** Prázdné = může se přihlásit kdokoli s účtem Google. */
  allowedEmails: string[]
  readLimitPerUser: number
  readLimitTotal: number
  llm: LlmConfig
  /** Proměnné s předponou VITE_, které je potřeba přejmenovat. */
  legacyLlmNames: string[]
  /**
   * Klíč k šifrování tokenů ke kalendáři (32 bajtů). Bez něj je Google Kalendář vypnutý,
   * zbytek aplikace běží. S falešným Googlem stačí vývojový klíč.
   */
  tokenKey: Buffer | null
  /**
   * E-mailová upozornění. `resend` je posílá, `console` je ve vývoji jen vypíše a `off`
   * je neposílá (produkce bez klíče).
   */
  mail: { mode: 'resend'; apiKey: string; from: string } | { mode: 'console' } | { mode: 'off' }
}

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.local/pglite'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_FAKE: z.string().optional(),
  ALLOWED_EMAILS: z.string().optional(),
  READ_LIMIT_PER_USER_PER_DAY: z.coerce.number().int().positive().default(30),
  READ_LIMIT_TOTAL_PER_DAY: z.coerce.number().int().positive().default(300),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
})

export function serverConfigFromEnv(env: Record<string, string | undefined>): ServerConfig {
  const values = EnvSchema.parse(env)
  const production = values.NODE_ENV === 'production'
  const appOrigin = values.APP_ORIGIN.replace(/\/+$/, '')
  const problems: string[] = []

  if (production && !appOrigin.startsWith('https://')) {
    problems.push('APP_ORIGIN musí v produkci začínat https://.')
  }
  if (production && !values.DATABASE_URL) {
    problems.push('V produkci chybí DATABASE_URL.')
  }

  const wantsFake = values.GOOGLE_FAKE === '1'
  if (wantsFake && production) {
    problems.push('Falešný Google (GOOGLE_FAKE=1) nejde zapnout v produkci.')
  }
  if (!wantsFake && (!values.GOOGLE_CLIENT_ID || !values.GOOGLE_CLIENT_SECRET)) {
    problems.push(
      'Chybí GOOGLE_CLIENT_ID a GOOGLE_CLIENT_SECRET. Pro vývoj bez Googlu nastav GOOGLE_FAKE=1.',
    )
  }
  const tokenKey = values.TOKEN_ENCRYPTION_KEY
    ? Buffer.from(values.TOKEN_ENCRYPTION_KEY, 'base64')
    : wantsFake
      ? developmentKey()
      : null
  if (tokenKey && tokenKey.length !== 32) {
    problems.push('TOKEN_ENCRYPTION_KEY musí být 32 bajtů zapsaných v base64.')
  }
  if (values.RESEND_API_KEY && !values.MAIL_FROM) {
    problems.push('K RESEND_API_KEY patří MAIL_FROM, třeba „Sladit <upozorneni@tvoje-domena.cz>“.')
  }
  if (problems.length > 0) throw new Error(`Nastavení serveru: ${problems.join(' ')}`)

  const { config: llm, legacyNames } = llmConfigFromEnv(env)
  return {
    production,
    port: values.PORT,
    appOrigin,
    databaseUrl: values.DATABASE_URL || undefined,
    pgliteDir: values.PGLITE_DIR,
    google: wantsFake
      ? { mode: 'fake' }
      : {
          mode: 'real',
          clientId: values.GOOGLE_CLIENT_ID!,
          clientSecret: values.GOOGLE_CLIENT_SECRET!,
        },
    allowedEmails: (values.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    readLimitPerUser: values.READ_LIMIT_PER_USER_PER_DAY,
    readLimitTotal: values.READ_LIMIT_TOTAL_PER_DAY,
    llm,
    legacyLlmNames: legacyNames,
    tokenKey,
    mail: values.RESEND_API_KEY
      ? { mode: 'resend', apiKey: values.RESEND_API_KEY, from: values.MAIL_FROM! }
      : production
        ? { mode: 'off' }
        : { mode: 'console' },
  }
}
