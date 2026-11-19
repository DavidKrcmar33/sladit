import { createHash, randomUUID } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { z } from 'zod'
import {
  CreateActionRequestSchema,
  ImportRequestSchema,
  PersonNameSchema,
  ReadingRequestSchema,
  SetOverrideRequestSchema,
  UpdateActionRequestSchema,
  UpdateSourceRequestSchema,
  type ErrorResponse,
  type User,
} from '@/contract/api'
import { withAnchor } from '@/core/parity'
import { DateStringSchema, type SourceContent } from '@/core/schema'
import type { ExtractInput } from '@/llm/extract'
import { codeChallengeOf, fakeGoogleCode, randomToken, type GoogleAuth } from './auth/google'
import type { ServerConfig } from './config'
import type { Store } from './db/store'
import { InvalidSourceError, MAX_READING_BODY_BYTES, pragueDay, validateParts } from './reading'

export interface AppDeps {
  config: ServerConfig
  store: Store
  google: GoogleAuth
  /** Čtení podkladů modelem (src/llm/extract.ts). V testech se nahrazuje. */
  extract: (input: ExtractInput) => Promise<SourceContent>
  now?: () => Date
  /** Adresář se sestaveným frontendem. Bez něj server podává jen API (vývoj, testy). */
  clientDir?: string
}

type Env = { Variables: { user: User } }

const SESSION_COOKIE = 'sladit_session'
const STATE_COOKIE = 'sladit_oauth_state'
const SESSION_DAYS = 30

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function fail(
  c: Context,
  status: 400 | 401 | 403 | 404 | 413 | 422 | 429 | 502 | 503,
  body: ErrorResponse,
) {
  return c.json(body, status)
}

/** Tělo požadavku ověřené schématem. Při chybě vrátí první zprávu, ne celý výpis. */
async function parseBody<T extends z.ZodType>(c: Context, schema: T) {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return { ok: false as const, response: fail(c, 400, { error: 'Tělo požadavku není JSON.' }) }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false as const,
      response: fail(c, 400, { error: issue?.message ?? 'Neplatný požadavek.' }),
    }
  }
  return { ok: true as const, data: parsed.data as z.infer<T> }
}

export function createApp(deps: AppDeps) {
  const { config, store, google } = deps
  const now = deps.now ?? (() => new Date())
  const secure = config.appOrigin.startsWith('https://')
  const redirectUri = `${config.appOrigin}/api/auth/google/callback`
  const api = new Hono<Env>()

  // Změny jen ze stejného původu: obrana proti CSRF. Cookie relace má navíc SameSite=Lax.
  api.use('*', async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
    const origin = c.req.header('origin')
    const site = c.req.header('sec-fetch-site')
    const sameOrigin = origin ? origin === config.appOrigin : site === 'same-origin'
    if (!sameOrigin) return fail(c, 403, { error: 'Požadavek z cizí stránky.' })
    return next()
  })

  api.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  // Kontrola pro hosting, že server běží a databáze odpovídá.
  api.get('/health', async (c) => {
    await store.db.query('select 1')
    return c.json({ ok: true })
  })

  // Přihlášení

  api.get('/me', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    const user = token ? await store.userBySession(hash(token)) : null
    return c.json({ user, fakeGoogle: config.google.mode === 'fake' })
  })

  api.get('/auth/google', async (c) => {
    const state = randomToken()
    const verifier = randomToken()
    await store.saveOauthState(state, verifier, 'login', null)
    // Stav je i v cookie: zpětné přesměrování musí přijít do stejného prohlížeče.
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/api/auth',
      maxAge: 15 * 60,
    })
    return c.redirect(
      google.authorizationUrl({ state, codeChallenge: codeChallengeOf(verifier), redirectUri }),
    )
  })

  api.get('/auth/google/callback', async (c) => {
    const state = c.req.query('state') ?? ''
    const code = c.req.query('code')
    const cookieState = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/api/auth' })
    if (!code || !state || state !== cookieState) return c.redirect('/?prihlaseni=chyba')
    const saved = await store.takeOauthState(state)
    if (!saved || saved.purpose !== 'login') return c.redirect('/?prihlaseni=chyba')

    let identity
    try {
      identity = await google.exchangeCode(code, saved.verifier, redirectUri)
    } catch {
      return c.redirect('/?prihlaseni=chyba')
    }
    const email = identity.email.toLowerCase()
    if (config.allowedEmails.length > 0 && !config.allowedEmails.includes(email)) {
      return c.redirect('/?prihlaseni=nepovoleno')
    }
    const user = await store.upsertUser(identity.sub, email, identity.name)
    const token = randomToken()
    const expires = new Date(now().getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
    await store.createSession(user.id, hash(token), expires)
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      expires,
    })
    return c.redirect('/')
  })

  // Falešný Google: jen ve vývoji a testech (config.ts ho v produkci nepovolí).
  if (config.google.mode === 'fake') {
    api.get('/auth/fake-google', (c) => {
      const state = c.req.query('state') ?? ''
      return c.html(`<!doctype html><meta charset="utf-8"><title>Falešný Google</title>
<body style="font-family:sans-serif;max-width:28rem;margin:3rem auto">
<h1>Falešný Google</h1><p>Vývojové přihlášení. V produkci tahle stránka neexistuje.</p>
<form method="get" action="/api/auth/fake-google/approve">
<input type="hidden" name="state" value="${encodeURIComponent(state)}">
<p><label>E-mail<br><input name="email" value="vyvojar@example.com" required></label></p>
<p><label>Jméno<br><input name="name" value="Vývojář" required></label></p>
<button>Přihlásit</button></form></body>`)
    })
    api.get('/auth/fake-google/approve', (c) => {
      const state = decodeURIComponent(c.req.query('state') ?? '')
      const code = fakeGoogleCode(c.req.query('email') ?? '', c.req.query('name') ?? '')
      const params = new URLSearchParams({ state, code })
      return c.redirect(`${redirectUri}?${params}`)
    })
  }

  api.post('/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) await store.deleteSession(hash(token))
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // Vše níž jen pro přihlášené.
  api.use('*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE)
    const user = token ? await store.userBySession(hash(token)) : null
    if (!user) return fail(c, 401, { error: 'Nejsi přihlášený.' })
    c.set('user', user)
    return next()
  })

  api.delete('/me', async (c) => {
    await store.deleteUser(c.get('user').id)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // Lidé a jejich rozpisy. Vlastník vidí o svých lidech všechno.

  api.get('/people', async (c) => c.json({ people: await store.peopleOf(c.get('user').id) }))

  api.patch('/people/:id', async (c) => {
    const body = await parseBody(c, PersonNameSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const done = await store.renamePerson(user.id, c.req.param('id'), body.data.name)
    if (!done) return fail(c, 404, { error: 'Člověk nenalezen.' })
    return c.json({ person: await store.personOf(user.id, c.req.param('id')) })
  })

  api.post(
    '/people/:id/readings',
    bodyLimit({
      maxSize: MAX_READING_BODY_BYTES,
      onError: (c) => fail(c, 413, { error: 'Podklady jsou dohromady příliš velké.' }),
    }),
    async (c) => {
      const user = c.get('user')
      const personId = c.req.param('id')
      const body = await parseBody(c, ReadingRequestSchema)
      if (!body.ok) return body.response
      if (!(await store.personOf(user.id, personId))) {
        return fail(c, 404, { error: 'Člověk nenalezen.' })
      }

      let sources
      try {
        sources = validateParts(body.data)
      } catch (error) {
        if (error instanceof InvalidSourceError) return fail(c, 400, { error: error.message })
        throw error
      }

      const reserved = await store.reserveReading(
        user.id,
        pragueDay(now()),
        config.readLimitPerUser,
        config.readLimitTotal,
      )
      if (reserved === 'user') {
        return fail(c, 429, {
          error: 'Dnešní limit čtení je vyčerpaný, zkus to zítra.',
          code: 'limit',
        })
      }
      if (reserved === 'total') {
        return fail(c, 429, {
          error: 'Aplikace dnes vyčerpala limit čtení, zkus to zítra.',
          code: 'limit',
        })
      }

      let content: SourceContent
      try {
        content = await deps.extract({ sources, from: body.data.from, to: body.data.to })
      } catch (error) {
        if (error instanceof Error && error.name === 'UnreadableSourceError') {
          const notes = 'notes' in error && Array.isArray(error.notes) ? error.notes : []
          return fail(c, 422, { error: 'Podklad je nečitelný.', code: 'unreadable', notes })
        }
        const message = error instanceof Error ? error.message : ''
        if (/\b429\b/.test(message)) {
          return fail(c, 503, { error: 'Došel limit modelu, zkus to za chvíli.', code: 'busy' })
        }
        console.error('Čtení podkladu selhalo:', message)
        return fail(c, 502, { error: 'Rozpis se nepodařilo přečíst.' })
      }

      await store.addSource(user.id, personId, {
        ...content,
        id: randomUUID(),
        files: body.data.files,
      })
      return c.json({ person: await store.personOf(user.id, personId) })
    },
  )

  api.patch('/people/:id/sources/:sourceId', async (c) => {
    const body = await parseBody(c, UpdateSourceRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const { circle, weekParity } = body.data
    const done = await store.updateSource(
      user.id,
      c.req.param('id'),
      c.req.param('sourceId'),
      (source) => ({
        ...source,
        circle: circle ?? source.circle,
        parity: weekParity
          ? withAnchor(source.parity, weekParity.date, weekParity.odd)
          : source.parity,
      }),
    )
    if (!done) return fail(c, 404, { error: 'Podklad nenalezen.' })
    return c.json({ person: await store.personOf(user.id, c.req.param('id')) })
  })

  api.delete('/people/:id/sources/:sourceId', async (c) => {
    const user = c.get('user')
    const done = await store.deleteSource(user.id, c.req.param('id'), c.req.param('sourceId'))
    if (!done) return fail(c, 404, { error: 'Podklad nenalezen.' })
    return c.json({ person: await store.personOf(user.id, c.req.param('id')) })
  })

  api.put('/people/:id/overrides/:date', async (c) => {
    const date = DateStringSchema.safeParse(c.req.param('date'))
    if (!date.success) return fail(c, 400, { error: 'Neplatné datum.' })
    const body = await parseBody(c, SetOverrideRequestSchema)
    if (!body.ok) return body.response
    if (body.data.shifts.some((shift) => shift.date !== date.data)) {
      return fail(c, 400, { error: 'Všechny směny musí začínat v upravovaný den.' })
    }
    const user = c.get('user')
    const done = await store.setOverride(user.id, c.req.param('id'), {
      date: date.data,
      shifts: body.data.shifts,
    })
    if (!done) return fail(c, 404, { error: 'Člověk nenalezen.' })
    return c.json({ person: await store.personOf(user.id, c.req.param('id')) })
  })

  api.delete('/people/:id/overrides/:date', async (c) => {
    const user = c.get('user')
    await store.deleteOverride(user.id, c.req.param('id'), c.req.param('date'))
    const person = await store.personOf(user.id, c.req.param('id'))
    if (!person) return fail(c, 404, { error: 'Člověk nenalezen.' })
    return c.json({ person })
  })

  // Akce

  api.get('/actions', async (c) => c.json({ actions: await store.actionsOf(c.get('user').id) }))

  api.post('/actions', async (c) => {
    const body = await parseBody(c, CreateActionRequestSchema)
    if (!body.ok) return body.response
    return c.json({ action: await store.createAction(c.get('user').id, body.data.details) })
  })

  api.patch('/actions/:id', async (c) => {
    const body = await parseBody(c, UpdateActionRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const done = await store.updateAction(user.id, c.req.param('id'), body.data.details)
    if (!done) return fail(c, 404, { error: 'Akce nenalezena.' })
    return c.json({ action: await store.actionOf(user.id, c.req.param('id')) })
  })

  api.delete('/actions/:id', async (c) => {
    const done = await store.deleteAction(c.get('user').id, c.req.param('id'))
    if (!done) return fail(c, 404, { error: 'Akce nenalezena.' })
    return c.json({ ok: true })
  })

  api.post('/actions/:id/guests', async (c) => {
    const body = await parseBody(c, PersonNameSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const person = await store.addGuest(user.id, c.req.param('id'), body.data.name)
    if (!person) return fail(c, 404, { error: 'Akce nenalezena.' })
    return c.json({ person, action: await store.actionOf(user.id, c.req.param('id')) })
  })

  api.delete('/actions/:id/participants/:personId', async (c) => {
    const user = c.get('user')
    const done = await store.removeParticipant(user.id, c.req.param('id'), c.req.param('personId'))
    if (!done) return fail(c, 404, { error: 'Člověk v akci není.' })
    return c.json({ action: await store.actionOf(user.id, c.req.param('id')) })
  })

  // Jednorázové převzetí akcí uložených v prohlížeči.
  api.post(
    '/import',
    bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: (c) => fail(c, 413, { error: 'Uložených dat je příliš mnoho.' }),
    }),
    async (c) => {
      const body = await parseBody(c, ImportRequestSchema)
      if (!body.ok) return body.response
      const imported = await store.importActions(
        c.get('user').id,
        body.data.actions.map(
          ({ name, from, to, durationMinutes, windowStart, windowEnd, people }) => ({
            details: { name, from, to, durationMinutes, windowStart, windowEnd },
            people: people.map(({ name: personName, sources, overrides }) => ({
              name: personName,
              sources,
              overrides,
            })),
          }),
        ),
      )
      return c.json({ imported })
    },
  )

  const app = new Hono()
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
    c.header('X-Frame-Options', 'DENY')
  })
  app.route('/api', api)
  if (deps.clientDir) {
    const root = deps.clientDir
    app.use('*', serveStatic({ root }))
    // Jednostránková aplikace: neznámé cesty mimo API dostanou index.html.
    app.get('*', async (c, next) =>
      c.req.path.startsWith('/api/')
        ? next()
        : serveStatic({ path: `${root}/index.html` })(c, next),
    )
  }
  app.notFound((c) =>
    c.req.path.startsWith('/api/')
      ? fail(c, 404, { error: 'Nenalezeno.' })
      : c.text('Nenalezeno', 404),
  )
  return app
}
