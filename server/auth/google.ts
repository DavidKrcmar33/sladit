import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * Přihlášení přes Google (OAuth 2.0 s autorizačním kódem, `state` a PKCE). Za rozhraním je
 * skutečný Google a falešný pro vývoj a testy, aby šlo vyvíjet bez účtu v Google Cloudu.
 */

export interface GoogleIdentity {
  sub: string
  email: string
  name: string
}

export interface AuthorizationRequest {
  state: string
  codeChallenge: string
  redirectUri: string
}

export interface GoogleAuth {
  authorizationUrl(request: AuthorizationRequest): string
  /** Vymění kód z přesměrování za identitu uživatele. */
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<GoogleIdentity>
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function codeChallengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

const TokenResponseSchema = z.object({ id_token: z.string() })

const IdTokenSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  exp: z.number(),
  email: z.string(),
  email_verified: z.boolean(),
  name: z.string().optional(),
})

/**
 * ID token přišel přímo z tokenového koncového bodu Googlu přes HTTPS a za klientské tajemství,
 * takže podle dokumentace Googlu stačí zkontrolovat vydavatele, příjemce, platnost a e-mail
 * bez ověřování podpisu.
 */
export function identityFromIdToken(idToken: string, clientId: string, now: Date): GoogleIdentity {
  const [, payload] = idToken.split('.')
  if (!payload) throw new Error('Neplatný ID token')
  const claims = IdTokenSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  if (!ISSUERS.includes(claims.iss)) throw new Error('ID token vydal někdo jiný než Google')
  if (claims.aud !== clientId) throw new Error('ID token je pro jinou aplikaci')
  if (claims.exp * 1000 < now.getTime()) throw new Error('ID token vypršel')
  if (!claims.email_verified) throw new Error('E-mail účtu Google není ověřený')
  return { sub: claims.sub, email: claims.email, name: claims.name ?? claims.email }
}

export function realGoogle(clientId: string, clientSecret: string): GoogleAuth {
  return {
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        // Jen přihlášení. O kalendář se žádá zvlášť, až ho uživatel připojuje.
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      })
      return `${AUTH_URL}?${params}`
    },
    async exchangeCode(code, codeVerifier, redirectUri) {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      })
      if (!response.ok) throw new Error(`Google odmítl kód (${response.status})`)
      const { id_token } = TokenResponseSchema.parse(await response.json())
      return identityFromIdToken(id_token, clientId, new Date())
    },
  }
}

/**
 * Falešný Google pro vývoj a testy. Místo Googlu ukáže formulář s e-mailem a jménem
 * a kód je jen zabalená identita. V produkci ho nejde zapnout (config.ts).
 */
export function fakeGoogle(appOrigin: string): GoogleAuth {
  return {
    authorizationUrl({ state, redirectUri }) {
      const params = new URLSearchParams({ state, redirect_uri: redirectUri })
      return `${appOrigin}/api/auth/fake-google?${params}`
    },
    async exchangeCode(code) {
      const identity = z
        .object({ email: z.string().email(), name: z.string().min(1) })
        .parse(JSON.parse(Buffer.from(code, 'base64url').toString('utf8')))
      return { sub: `fake:${identity.email}`, ...identity }
    },
  }
}

export function fakeGoogleCode(email: string, name: string): string {
  return Buffer.from(JSON.stringify({ email, name })).toString('base64url')
}
