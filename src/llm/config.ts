import { z } from 'zod'

/**
 * Nastavení čtení modelem. Čte ho jen server a měření z proměnných prostředí, nikdy prohlížeč:
 * klíč k modelu nesmí skončit v sestavené aplikaci.
 */
export interface LlmConfig {
  provider: 'gemini' | 'claude'
  geminiApiKey?: string
  geminiModel?: string
  anthropicApiKey?: string
  anthropicModel: string
  /** Druhé čtení při nejistotě. */
  verify: 'auto' | 'never'
  /** Jiný model pro druhé čtení, jinak se použije stejný. */
  verifyModel?: string
}

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5'

type Env = Record<string, string | undefined>

const NAMES = [
  'LLM_PROVIDER',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'LLM_VERIFY',
  'LLM_VERIFY_MODEL',
] as const

const EnvSchema = z.object(
  Object.fromEntries(NAMES.map((name) => [name, z.string().trim().optional()])) as Record<
    (typeof NAMES)[number],
    z.ZodOptional<z.ZodString>
  >,
)

/**
 * Hodnota proměnné. Dřívější názvy s předponou VITE_ ještě fungují, ale vrátí se i v seznamu
 * k přejmenování: s touto předponou by je Vite mohl vložit do aplikace pro prohlížeč.
 */
function read(env: Env, name: string, legacy: string[]): string | undefined {
  const value = env[name]?.trim()
  if (value) return value
  const old = env[`VITE_${name}`]?.trim()
  if (old) {
    legacy.push(`VITE_${name}`)
    return old
  }
  return undefined
}

export function llmConfigFromEnv(env: Env): { config: LlmConfig; legacyNames: string[] } {
  const legacy: string[] = []
  const values = EnvSchema.parse(
    Object.fromEntries(NAMES.map((name) => [name, read(env, name, legacy)])),
  )
  return {
    config: {
      provider: values.LLM_PROVIDER === 'claude' ? 'claude' : 'gemini',
      geminiApiKey: values.GEMINI_API_KEY || undefined,
      geminiModel: values.GEMINI_MODEL || undefined,
      anthropicApiKey: values.ANTHROPIC_API_KEY || undefined,
      anthropicModel: values.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL,
      verify: values.LLM_VERIFY === 'off' ? 'never' : 'auto',
      verifyModel: values.LLM_VERIFY_MODEL || undefined,
    },
    legacyNames: legacy,
  }
}

/** Název modelu pro zprávy a cache, například „claude:claude-opus-5-5“. */
export function modelName(config: LlmConfig): string {
  return config.provider === 'claude'
    ? `claude:${config.anthropicModel}`
    : `gemini:${config.geminiModel ?? ''}`
}

/** Co v nastavení chybí, aby šlo číst. Prázdné, když je vše v pořádku. */
export function missingSettings(config: LlmConfig): string[] {
  if (config.provider === 'claude') return config.anthropicApiKey ? [] : ['ANTHROPIC_API_KEY']
  return [
    ...(config.geminiApiKey ? [] : ['GEMINI_API_KEY']),
    ...(config.geminiModel ? [] : ['GEMINI_MODEL']),
  ]
}
