import { afterEach, expect, it, vi } from 'vitest'
import { realGoogle } from './google'

const auth = realGoogle('test-client', 'test-secret')
const redirectUri = 'https://example.test/callback'
afterEach(() => vi.unstubAllGlobals())

it('exchanges the authorization code with PKCE and reads the verified identity', async () => {
  const claims = {
    iss: 'https://accounts.google.com',
    aud: 'test-client',
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 600,
    email: 'anna@example.test',
    email_verified: true,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id_token: `header.${payload}.signature` }))
  vi.stubGlobal('fetch', fetcher)
  await expect(auth.exchangeCode('code', 'verifier', redirectUri)).resolves.toEqual({
    sub: 'user-1',
    email: claims.email,
    name: claims.email,
  })
  const [url, request] = fetcher.mock.calls[0]
  expect(url).toBe('https://oauth2.googleapis.com/token')
  expect(request?.method).toBe('POST')
  expect(Object.fromEntries(request?.body as URLSearchParams)).toEqual({
    code: 'code',
    code_verifier: 'verifier',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    client_id: 'test-client',
    client_secret: 'test-secret',
  })
})

it('rejects an unsuccessful token exchange', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 400 })))
  await expect(auth.exchangeCode('code', 'verifier', redirectUri)).rejects.toThrow(/400/)
})
