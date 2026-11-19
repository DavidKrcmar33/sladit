import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateJson, type GeminiRequest } from './gemini'

const request: GeminiRequest = {
  systemInstruction: 'Čteš rozpis.',
  parts: [{ text: 'Podklad' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }],
  jsonSchema: { type: 'object' },
  apiKey: 'test-key',
  model: 'test-model',
  sleep: async () => {},
}

function reply(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init })
}

function candidate(...texts: string[]) {
  return { candidates: [{ content: { parts: texts.map((text) => ({ text })) } }] }
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn()
  for (const response of responses) fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('generateJson', () => {
  it('sends the request in the generateContent format', async () => {
    const fetchMock = stubFetch(reply(candidate('{"a":1}')))

    await generateJson(request)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
    )
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'test-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual({
      systemInstruction: { parts: [{ text: 'Čteš rozpis.' }] },
      contents: [{ role: 'user', parts: request.parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
      },
    })
  })

  it('joins the text parts and parses them as JSON', async () => {
    stubFetch(reply(candidate('{"shifts":', '[1,2]}')))
    expect(await generateJson(request)).toEqual({ shifts: [1, 2] })
  })

  it('fails when the key or the model is not configured', async () => {
    stubFetch()
    await expect(generateJson({ ...request, apiKey: '' })).rejects.toThrow(/GEMINI_API_KEY/)
    await expect(generateJson({ ...request, model: '' })).rejects.toThrow(/GEMINI_MODEL/)
  })

  it('retries on 429 and waits for Retry-After', async () => {
    const fetchMock = stubFetch(
      new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } }),
      reply(candidate('{"ok":true}')),
    )
    const sleep = vi.fn(async () => {})

    expect(await generateJson({ ...request, sleep })).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(7000)
  })

  it('uses 2 s and then 5 s when Retry-After is missing and gives up after two retries', async () => {
    const fetchMock = stubFetch(
      new Response('a', { status: 503 }),
      new Response('b', { status: 503 }),
      new Response('overloaded', { status: 503 }),
    )
    const sleep = vi.fn(async () => {})

    await expect(generateJson({ ...request, sleep })).rejects.toThrow(/503.*overloaded/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[2000], [5000]])
  })

  it('does not retry other client errors and includes the API message', async () => {
    const fetchMock = stubFetch(reply({ error: { message: 'API key not valid' } }, { status: 400 }))

    await expect(generateJson(request)).rejects.toThrow(/400.*API key not valid/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails with a clear message when the answer is empty or not JSON', async () => {
    stubFetch(reply({ candidates: [] }), reply(candidate('not json')))
    await expect(generateJson(request)).rejects.toThrow(/prázdnou odpověď/)
    await expect(generateJson(request)).rejects.toThrow(/není platný JSON/)
  })
})
