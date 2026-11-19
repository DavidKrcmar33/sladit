import type { LlmConfig } from './config'
import { generateJson as generateGeminiJson } from './gemini'
import type { ModelPart } from './ingest'

export interface ModelRequest {
  systemInstruction: string
  parts: ModelPart[]
  jsonSchema: object
  /** Jiný model než výchozí z nastavení, například pro druhé čtení. */
  model?: string
}

export type GenerateJson = (request: ModelRequest) => Promise<unknown>

/**
 * Volání vybraného poskytovatele s klíčem a modelem z nastavení. Vrátí odpověď jako JSON,
 * schéma výsledku tu nezná, ověřuje ho volající.
 */
export function createGenerateJson(config: LlmConfig): GenerateJson {
  if (config.provider === 'claude') {
    return async (request) =>
      // SDK je velké, načte se jen když se opravdu používá.
      (await import('./claude')).generateJson({
        ...request,
        apiKey: config.anthropicApiKey,
        model: request.model ?? config.anthropicModel,
      })
  }
  return (request) =>
    generateGeminiJson({
      ...request,
      apiKey: config.geminiApiKey,
      model: request.model ?? config.geminiModel,
    })
}
