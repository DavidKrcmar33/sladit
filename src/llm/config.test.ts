import { describe, expect, it } from 'vitest'
import { DEFAULT_CLAUDE_MODEL, llmConfigFromEnv, missingSettings, modelName } from './config'

describe('llmConfigFromEnv', () => {
  it('uses Gemini unless Claude is selected', () => {
    const { config, legacyNames } = llmConfigFromEnv({})
    expect(config).toMatchObject({ provider: 'gemini', verify: 'auto' })
    expect(missingSettings(config)).toEqual(['GEMINI_API_KEY', 'GEMINI_MODEL'])
    expect(legacyNames).toEqual([])
  })

  it('reads Claude settings with the default model', () => {
    const { config } = llmConfigFromEnv({ LLM_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' })
    expect(config).toMatchObject({ provider: 'claude', anthropicModel: DEFAULT_CLAUDE_MODEL })
    expect(missingSettings(config)).toEqual([])
    expect(modelName(config)).toBe(`claude:${DEFAULT_CLAUDE_MODEL}`)
  })

  it('switches the second reading off and sets its model', () => {
    const { config } = llmConfigFromEnv({ LLM_VERIFY: 'off', LLM_VERIFY_MODEL: 'jiny' })
    expect(config).toMatchObject({ verify: 'never', verifyModel: 'jiny' })
  })

  it('still reads the old VITE_ names but lists them for renaming', () => {
    const { config, legacyNames } = llmConfigFromEnv({
      VITE_LLM_PROVIDER: 'claude',
      VITE_ANTHROPIC_API_KEY: 'k',
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
    })
    expect(config).toMatchObject({ provider: 'claude', anthropicApiKey: 'k' })
    expect(config.anthropicModel).toBe('claude-sonnet-5-5')
    expect(legacyNames).toEqual(['VITE_LLM_PROVIDER', 'VITE_ANTHROPIC_API_KEY'])
  })

  it('prefers the new name when both are set', () => {
    const { config, legacyNames } = llmConfigFromEnv({
      GEMINI_MODEL: 'novy',
      VITE_GEMINI_MODEL: 'stary',
    })
    expect(config.geminiModel).toBe('novy')
    expect(legacyNames).toEqual([])
  })
})
