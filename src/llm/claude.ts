import Anthropic from '@anthropic-ai/sdk'
import type { ModelPart } from './ingest'
import { DEFAULT_CLAUDE_MODEL } from './config'
import type { ModelRequest } from './model'

export interface ClaudeRequest extends ModelRequest {
  /** Výchozí hodnoty jsou z .env, přepis je pro testy a měření. */
  apiKey?: string
  model?: string
  client?: Anthropic
}

const MAX_TOKENS = 16000

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

function isImageType(mimeType: string): mimeType is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(mimeType)
}

/** Převede části požadavku (ve tvaru pro Gemini) na obsah zprávy pro Claude. */
export function toClaudeContent(parts: ModelPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  return parts.map((part): Anthropic.Beta.BetaContentBlockParam => {
    if ('text' in part) return { type: 'text', text: part.text }
    const { mimeType, data } = part.inlineData
    if (mimeType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: mimeType, data } }
    }
    if (isImageType(mimeType)) {
      return { type: 'image', source: { type: 'base64', media_type: mimeType, data } }
    }
    throw new Error(`Claude neumí přečíst soubor typu ${mimeType}.`)
  })
}

// Omezení, která strukturovaný výstup Claude nepřijímá. Hodnoty stejně znovu ověřuje zod u volajícího.
const UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'default',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
])

export function toClaudeSchema(schema: unknown): object {
  if (Array.isArray(schema)) return schema.map(toClaudeSchema)
  if (typeof schema !== 'object' || schema === null) return schema as object

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue
    // Klíče v `properties` jsou názvy polí, ne klíčová slova schématu.
    result[key] =
      key === 'properties' && typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.entries(value).map(([name, child]) => [name, toClaudeSchema(child)]),
          )
        : toClaudeSchema(value)
  }
  return result
}

function createClient(apiKey: string | undefined): Anthropic {
  // Běží jen na serveru a v měření. Bez klíče SDK zkusí ANTHROPIC_API_KEY z prostředí.
  return new Anthropic({ apiKey: apiKey || undefined })
}

/** Zavolá Claude a vrátí odpověď jako JSON. Schéma výsledku tu nezná, ověřuje ho volající. */
export async function generateJson(request: ClaudeRequest): Promise<unknown> {
  const client = request.client ?? createClient(request.apiKey)
  const model = request.model ?? DEFAULT_CLAUDE_MODEL

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      // Při odmítnutí ze strany bezpečnostních pravidel API samo zkusí záložní model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: request.systemInstruction,
      messages: [{ role: 'user', content: toClaudeContent(request.parts) }],
      output_config: {
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: toClaudeSchema(request.jsonSchema) as Record<string, unknown>,
        },
      },
    })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude vrátilo ${error.status}: ${error.message}`)
    }
    throw error
  }

  if (response.stop_reason === 'refusal') throw new Error('Claude odmítl požadavek.')
  if (response.stop_reason === 'max_tokens') throw new Error('Odpověď Claude je useknutá.')

  const text = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
  if (!text) throw new Error('Claude vrátil prázdnou odpověď.')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Odpověď Claude není platný JSON.')
  }
}
