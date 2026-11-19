import { afterEach, describe, expect, it, vi } from 'vitest'

const gemini = vi.hoisted(() => ({ generateJson: vi.fn(async () => 'gemini') }))
const claude = vi.hoisted(() => ({ generateJson: vi.fn(async () => 'claude') }))
vi.mock('./gemini', () => gemini)
vi.mock('./claude', () => claude)

import { llmConfigFromEnv } from './config'
import { createGenerateJson } from './model'

const request = { systemInstruction: 's', parts: [{ text: 'p' }], jsonSchema: {} }

afterEach(() => {
  vi.clearAllMocks()
})

describe('createGenerateJson', () => {
  it('calls Gemini with the key and model from the settings', async () => {
    const { config } = llmConfigFromEnv({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-x' })
    expect(await createGenerateJson(config)(request)).toBe('gemini')
    expect(gemini.generateJson).toHaveBeenCalledWith({
      ...request,
      apiKey: 'k',
      model: 'gemini-x',
    })
    expect(claude.generateJson).not.toHaveBeenCalled()
  })

  it('calls Claude when it is selected, and lets a request pick another model', async () => {
    const { config } = llmConfigFromEnv({ LLM_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' })
    const generate = createGenerateJson(config)
    expect(await generate(request)).toBe('claude')
    expect(await generate({ ...request, model: 'claude-sonnet-5-5' })).toBe('claude')
    expect(claude.generateJson).toHaveBeenNthCalledWith(1, {
      ...request,
      apiKey: 'k',
      model: 'claude-opus-5-5',
    })
    expect(claude.generateJson).toHaveBeenNthCalledWith(2, {
      ...request,
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
    })
  })
})
