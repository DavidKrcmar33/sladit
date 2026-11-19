import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { generateJson, toClaudeContent, toClaudeSchema, type ClaudeRequest } from './claude'

function fakeClient(response: unknown) {
  const create = vi.fn(async () => response)
  return { create, client: { beta: { messages: { create } } } as unknown as Anthropic }
}

function message(text: string, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text }] }
}

function request(client: Anthropic, overrides: Partial<ClaudeRequest> = {}): ClaudeRequest {
  return {
    systemInstruction: 'Čteš rozpis.',
    parts: [{ text: 'Podklad' }],
    jsonSchema: { type: 'object' },
    client,
    ...overrides,
  }
}

describe('toClaudeContent', () => {
  it('maps text, images and PDFs to Claude content blocks', () => {
    expect(
      toClaudeContent([
        { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
        { inlineData: { mimeType: 'application/pdf', data: 'BBBB' } },
        { text: 'Pokyn' },
      ]),
    ).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'BBBB' },
      },
      { type: 'text', text: 'Pokyn' },
    ])
  })

  it('rejects image formats Claude cannot read', () => {
    expect(() =>
      toClaudeContent([{ inlineData: { mimeType: 'image/heic', data: 'AAAA' } }]),
    ).toThrow(/image\/heic/)
  })
})

describe('toClaudeSchema', () => {
  it('removes constraints the structured output API does not accept, at any depth', () => {
    const schema = {
      type: 'object',
      properties: {
        date: { type: 'string', pattern: '^\\d{4}$', description: 'Den' },
        label: { type: 'string', default: '' },
        shifts: {
          type: 'array',
          minItems: 1,
          items: { type: 'object', properties: { start: { type: 'string', minLength: 5 } } },
        },
        default: { type: 'string' },
      },
      additionalProperties: false,
    }

    expect(toClaudeSchema(schema)).toEqual({
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Den' },
        label: { type: 'string' },
        shifts: {
          type: 'array',
          items: { type: 'object', properties: { start: { type: 'string' } } },
        },
        default: { type: 'string' },
      },
      additionalProperties: false,
    })
  })
})

describe('generateJson (Claude)', () => {
  it('sends a structured output request with refusal fallbacks and parses the JSON', async () => {
    const { create, client } = fakeClient(message('{"shifts":[]}'))

    const result = await generateJson(request(client, { model: 'claude-opus-5-5' }))

    expect(result).toEqual({ shifts: [] })
    expect(create).toHaveBeenCalledWith({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'Čteš rozpis.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Podklad' }] }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: { type: 'object' } },
      },
    })
  })

  it('fails on a refusal and on a truncated answer', async () => {
    await expect(generateJson(request(fakeClient(message('', 'refusal')).client))).rejects.toThrow(
      /odmítl/,
    )
    await expect(
      generateJson(request(fakeClient(message('{"a"', 'max_tokens')).client)),
    ).rejects.toThrow(/useknutá/)
  })

  it('fails on an empty or non-JSON answer', async () => {
    await expect(
      generateJson(request(fakeClient({ stop_reason: 'end_turn', content: [] }).client)),
    ).rejects.toThrow(/prázdnou odpověď/)
    await expect(generateJson(request(fakeClient(message('ahoj')).client))).rejects.toThrow(
      /není platný JSON/,
    )
  })

  it('turns an API error into a message with the status code', async () => {
    const create = vi.fn(async () => {
      throw new Anthropic.RateLimitError(
        429,
        { error: { message: 'slow down' } },
        'slow down',
        new Headers(),
      )
    })
    const client = { beta: { messages: { create } } } as unknown as Anthropic

    await expect(generateJson(request(client))).rejects.toThrow(/Claude vrátilo 429/)
  })
})
