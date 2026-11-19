import type { ModelRequest } from './model'

export interface GeminiRequest extends ModelRequest {
  apiKey?: string
  model?: string
  sleep?: (ms: number) => Promise<void>
}

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
// Prodlevy před 1. a 2. opakováním, když server neuvede Retry-After.
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000]

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterSeconds = Number(response.headers.get('Retry-After'))
  return retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : DEFAULT_RETRY_DELAYS_MS[attempt]
}

async function describeError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const message = (JSON.parse(text) as { error?: { message?: string } }).error?.message
    if (message) return message
  } catch {
    // Odpověď není JSON, použije se celý text.
  }
  return text
}

function extractText(body: unknown): string {
  const parts = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts
  return (parts ?? []).map((part) => part.text ?? '').join('')
}

/** Zavolá model a vrátí jeho odpověď jako JSON. Schéma výsledku tu nezná, ověřuje ho volající. */
export async function generateJson(request: GeminiRequest): Promise<unknown> {
  const { apiKey, model } = request
  if (!apiKey) throw new Error('Chybí GEMINI_API_KEY v nastavení serveru.')
  if (!model) throw new Error('Chybí GEMINI_MODEL v nastavení serveru.')
  const sleep = request.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  const init: RequestInit = {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.systemInstruction }] },
      contents: [{ role: 'user', parts: request.parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
      },
    }),
  }

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API_URL}/${model}:generateContent`, init)
    if (response.ok) {
      const text = extractText(await response.json())
      if (!text) throw new Error('Model vrátil prázdnou odpověď.')
      try {
        return JSON.parse(text)
      } catch {
        throw new Error('Odpověď modelu není platný JSON.')
      }
    }
    if (isRetryable(response.status) && attempt < DEFAULT_RETRY_DELAYS_MS.length) {
      await sleep(retryDelayMs(response, attempt))
      continue
    }
    throw new Error(`Gemini vrátilo ${response.status}: ${await describeError(response)}`)
  }
}
