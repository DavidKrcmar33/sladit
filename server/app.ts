import { createHash, randomUUID } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { z } from 'zod'
import {
  AddMemberSchema,
  AnswerSourceRequestSchema,
  ClarifyRequestSchema,
  ConfirmedSlotSchema,
  CreateActionRequestSchema,
  CreatePollRequestSchema,
  DraftActionRequestSchema,
  SendFriendRequestSchema,
  SlotResponseRequestSchema,
  GroupNameSchema,
  ImportRequestSchema,
  InviteToActionRequestSchema,
  PersonNameSchema,
  ReadingRequestSchema,
  RespondToActionRequestSchema,
  SetOverrideRequestSchema,
  SetRequiredRequestSchema,
  UpdateActionRequestSchema,
  UpdateCalendarRequestSchema,
  UpdateSourceRequestSchema,
  VoteRequestSchema,
  type ConfirmedSlot,
  type ErrorResponse,
  type User,
} from '@/contract/api'
import { withAnchor } from '@/core/parity'
import { DateStringSchema, type ActionDetails, type SourceContent } from '@/core/schema'
import { windowFor } from '@/core/scheduler'
import { toMinutes } from '@/core/time'
import type { ActionDraft, ActionDraftInput } from '@/llm/actionDraft'
import type { ClarifyInput, ClarifyResult } from '@/llm/clarify'
import type { ExtractInput } from '@/llm/extract'
import { buildSource, describeChanges, type ReviewBasis } from '@/llm/review'
import { codeChallengeOf, fakeGoogleCode, randomToken, type GoogleAuth } from './auth/google'
import { fakeCalendarCode, type CalendarApi } from './calendar/api'
import { createCalendarService } from './calendar/service'
import type { ServerConfig } from './config'
import { tokenCipher } from './crypto'
import type { Store } from './db/store'
import { InvalidSourceError, MAX_READING_BODY_BYTES, pragueDay, validateParts } from './reading'
import { actionDaySlots, actionView } from './view'

export interface AppDeps {
  config: ServerConfig
  store: Store
  google: GoogleAuth
  /** Čtení podkladů modelem (src/llm/extract.ts). V testech se nahrazuje. */
  extract: (input: ExtractInput) => Promise<ReadResult>
  /** Doptání vlastními slovy (src/llm/clarify.ts). V testech se nahrazuje. */
  clarify: (input: ClarifyInput) => Promise<ClarifyResult>
  /** Akce z jedné věty (src/llm/actionDraft.ts). V testech se nahrazuje. */
  draftAction: (input: ActionDraftInput) => Promise<ActionDraft>
  now?: () => Date
  /** Adresář se sestaveným frontendem. Bez něj server podává jen API (vývoj, testy). */
  clientDir?: string
  /** Google Kalendář. Bez něj (nebo bez klíče k tokenům) je kalendář vypnutý. */
  calendar?: CalendarApi | null
}

/** Přečtený podklad a strukturální čtení, ze kterého ho jde po doptání přepočítat. */
export interface ReadResult {
  source: SourceContent
  basis: ReviewBasis | null
}

type Env = { Variables: { user: User } }

const SLOT_MISFIT = 'Termín neodpovídá období, oknu nebo délce akce.'

/** Termín leží v období a v denním okně akce (o víkendu ve víkendovém) a má její délku. */
function fitsAction(details: ActionDetails, slot: ConfirmedSlot): boolean {
  const window = windowFor(details, slot.date)
  return (
    details.from <= slot.date &&
    slot.date <= details.to &&
    window.start <= slot.start &&
    slot.end <= window.end &&
    toMinutes(slot.end) - toMinutes(slot.start) === details.durationMinutes
  )
}

const NOT_REVIEWABLE =
  'Tento podklad je přečtený starší verzí aplikace a doptat se k němu nejde. Nahraj ho znovu.'

const SESSION_COOKIE = 'sladit_session'
const STATE_COOKIE = 'sladit_oauth_state'
const SESSION_DAYS = 30
const INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const ORGANIZER_ONLY = 'Akci upravuje jen organizátor.'
const OWNER_ONLY = 'Tohle smí jen zakladatel skupiny.'
const INVALID_INVITE = 'Pozvánka neplatí. Možná vypršela nebo ji ten, kdo ji poslal, zrušil.'
const NOT_CONTACT = 'Pozvat jde jen přátele a lidi z tvých skupin.'

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function fail(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 502 | 503,
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
  const calendarApi = deps.calendar ?? null
  const calendar = createCalendarService({
    store,
    api: calendarApi,
    cipher: config.tokenKey ? tokenCipher(config.tokenKey) : null,
    now,
  })
  const api = new Hono<Env>()

  /** Denní limit volání modelu (čtení i doptání). Vrátí odpověď s chybou, když je vyčerpaný. */
  async function reserveModelCall(c: Context, userId: string): Promise<Response | null> {
    const reserved = await store.reserveReading(
      userId,
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
    return null
  }

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
    const user = token ? await store.userBySession(hash(token), now()) : null
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
    if (!state || state !== cookieState) return c.redirect('/?prihlaseni=chyba')
    const saved = await store.takeOauthState(state)
    if (!saved) return c.redirect('/?prihlaseni=chyba')

    // Připojení kalendáře: relace musí patřit tomu, kdo připojení začal.
    if (saved.purpose === 'calendar') {
      if (!code) return c.redirect('/?kalendar=zamitnuto')
      const session = getCookie(c, SESSION_COOKIE)
      const owner = session ? await store.userBySession(hash(session), now()) : null
      if (!owner || owner.id !== saved.user_id || !calendarApi) {
        return c.redirect('/?kalendar=chyba')
      }
      try {
        await calendar.connect(
          owner.id,
          await calendarApi.exchangeCode(code, saved.verifier, redirectUri),
        )
      } catch {
        return c.redirect('/?kalendar=chyba')
      }
      return c.redirect('/?kalendar=pripojen')
    }
    if (!code || saved.purpose !== 'login') return c.redirect('/?prihlaseni=chyba')

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
    api.get('/auth/fake-google/calendar', (c) => {
      const state = c.req.query('state') ?? ''
      const params = new URLSearchParams({ state, login_hint: c.req.query('login_hint') ?? '' })
      const denied = new URLSearchParams({ state, error: 'access_denied' })
      return c.html(`<!doctype html><meta charset="utf-8"><title>Falešný Google Kalendář</title>
<body style="font-family:sans-serif;max-width:28rem;margin:3rem auto">
<h1>Falešný Google Kalendář</h1><p>Vývojový souhlas s kalendářem. V produkci tahle stránka neexistuje.</p>
<p><a href="/api/auth/fake-google/calendar/approve?${params}">Povolit</a> ·
<a href="${redirectUri}?${denied}">Zamítnout</a></p></body>`)
    })
    api.get('/auth/fake-google/calendar/approve', (c) => {
      const params = new URLSearchParams({
        state: c.req.query('state') ?? '',
        code: fakeCalendarCode(c.req.query('login_hint') ?? ''),
      })
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
    const user = token ? await store.userBySession(hash(token), now()) : null
    if (!user) return fail(c, 401, { error: 'Nejsi přihlášený.' })
    c.set('user', user)
    return next()
  })

  api.delete('/me', async (c) => {
    // Přístup ke kalendáři se odvolá i u Googlu.
    await calendar.disconnect(c.get('user').id)
    await store.deleteUser(c.get('user').id)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // Lidé a jejich rozpisy. Vlastník vidí o svých lidech všechno.

  api.get('/people', async (c) => {
    // Obsazenost z kalendáře se načte znovu, když je starší než 10 minut.
    await calendar.sync(c.get('user').id)
    return c.json({ people: await store.peopleOf(c.get('user').id) })
  })

  // Google Kalendář

  api.get('/calendar', async (c) => c.json({ calendar: await calendar.status(c.get('user').id) }))

  // Souhlas s kalendářem u Googlu. Návrat jde přes stejné přesměrování jako přihlášení.
  api.get('/calendar/connect', async (c) => {
    if (!calendar.available || !calendarApi) return c.redirect('/?kalendar=nedostupny')
    const user = c.get('user')
    const state = randomToken()
    const verifier = randomToken()
    await store.saveOauthState(state, verifier, 'calendar', user.id)
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/api/auth',
      maxAge: 15 * 60,
    })
    return c.redirect(
      calendarApi.authorizationUrl({
        state,
        codeChallenge: codeChallengeOf(verifier),
        redirectUri,
        loginHint: user.email,
      }),
    )
  })

  api.delete('/calendar', async (c) => {
    const user = c.get('user')
    await calendar.disconnect(user.id)
    return c.json({ calendar: await calendar.status(user.id) })
  })

  api.patch('/calendar', async (c) => {
    const body = await parseBody(c, UpdateCalendarRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    await calendar.setAutoWrite(user.id, body.data.autoWrite)
    return c.json({ calendar: await calendar.status(user.id) })
  })

  api.post('/calendar/sync', async (c) => {
    const user = c.get('user')
    await calendar.sync(user.id, true)
    return c.json({ calendar: await calendar.status(user.id) })
  })

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

      const limited = await reserveModelCall(c, user.id)
      if (limited) return limited

      let read: ReadResult
      try {
        read = await deps.extract({ sources, from: body.data.from, to: body.data.to })
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

      await store.addSource(
        user.id,
        personId,
        { ...read.source, id: randomUUID(), files: body.data.files },
        read.basis,
      )
      return c.json({ person: await store.personOf(user.id, personId) })
    },
  )

  // Doptání po čtení. Odpovědi z tlačítek se použijí hned, věta napsaná vlastními slovy jde AI
  // a vrátí se jako návrh: uloží se, až ho člověk potvrdí odesláním odpovědí.

  api.post('/people/:id/sources/:sourceId/answers', async (c) => {
    const body = await parseBody(c, AnswerSourceRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const personId = c.req.param('id')
    const result = await store.answerSource(
      user.id,
      personId,
      c.req.param('sourceId'),
      body.data.answers,
      buildSource,
    )
    if (result === 'missing') return fail(c, 404, { error: 'Podklad nenalezen.' })
    if (result === 'not-reviewable') return fail(c, 409, { error: NOT_REVIEWABLE, code: 'review' })
    return c.json({ person: await store.personOf(user.id, personId) })
  })

  api.post('/people/:id/sources/:sourceId/clarify', async (c) => {
    const body = await parseBody(c, ClarifyRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const review = await store.sourceReview(user.id, c.req.param('id'), c.req.param('sourceId'))
    if (!review) return fail(c, 404, { error: 'Podklad nenalezen.' })
    if (!review.basis) return fail(c, 409, { error: NOT_REVIEWABLE, code: 'review' })

    // Každá zpráva je volání placeného modelu, počítá se do stejného denního limitu jako čtení.
    const limited = await reserveModelCall(c, user.id)
    if (limited) return limited

    let result: ClarifyResult
    try {
      result = await deps.clarify({
        basis: review.basis,
        answers: review.answers,
        message: body.data.message,
        today: pragueDay(now()),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/\b429\b/.test(message)) {
        return fail(c, 503, { error: 'Došel limit modelu, zkus to za chvíli.', code: 'busy' })
      }
      console.error('Doptání selhalo:', message)
      return fail(c, 502, { error: 'Zprávu se nepodařilo zpracovat, zkus to znovu.' })
    }
    const after = buildSource(review.basis, [...review.answers, ...result.answers])
    return c.json({
      reply: result.reply,
      answers: result.answers,
      changes: describeChanges(review.source, after),
    })
  })

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

  /** Úprava akce se nepovedla: pozvaný dostane vysvětlení, cizí člověk jen „nenalezeno“. */
  async function refusedEdit(c: Context<Env>, notFound: string) {
    const visible = await store.actionOf(c.get('user').id, c.req.param('id') ?? '')
    return visible && !visible.isOrganizer
      ? fail(c, 403, { error: ORGANIZER_ONLY })
      : fail(c, 404, { error: notFound })
  }

  async function actionResponse(c: Context<Env>) {
    return c.json({ action: await store.actionOf(c.get('user').id, c.req.param('id') ?? '') })
  }

  api.get('/actions', async (c) => c.json({ actions: await store.actionsOf(c.get('user').id) }))

  api.post('/actions', async (c) => {
    const body = await parseBody(c, CreateActionRequestSchema)
    if (!body.ok) return body.response
    const action = await store.createAction(
      c.get('user').id,
      body.data.details,
      body.data.inviteUserIds,
    )
    if (action === 'not-contact') return fail(c, 400, { error: NOT_CONTACT })
    return c.json({ action })
  })

  // Akce z jedné věty. Nic se neuloží: parametry se vrátí do formuláře ke kontrole.
  api.post('/actions/draft', async (c) => {
    const body = await parseBody(c, DraftActionRequestSchema)
    if (!body.ok) return body.response
    // Volání placeného modelu, počítá se do stejného denního limitu jako čtení.
    const limited = await reserveModelCall(c, c.get('user').id)
    if (limited) return limited
    try {
      return c.json(await deps.draftAction({ text: body.data.text, today: pragueDay(now()) }))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/\b429\b/.test(message)) {
        return fail(c, 503, { error: 'Došel limit modelu, zkus to za chvíli.', code: 'busy' })
      }
      console.error('Akce z věty selhala:', message)
      return fail(c, 502, { error: 'Větu se nepodařilo zpracovat, vyplň akci ručně.' })
    }
  })

  // Návrhy a stav dne ostatních účastníků. Cizí rozpisy server jen použije, nevrátí.
  api.get('/actions/:id/view', async (c) => {
    const user = c.get('user')
    if (!(await store.actionOf(user.id, c.req.param('id')))) {
      return fail(c, 404, { error: 'Akce nenalezena.' })
    }
    // Obsazenost z kalendářů účastníků, když je starší než 10 minut.
    await calendar.syncMany(await store.participantUserIds(c.req.param('id')))
    const found = await store.actionForView(user.id, c.req.param('id'))
    if (!found) return fail(c, 404, { error: 'Akce nenalezena.' })
    return c.json({ view: actionView(user.id, found.action, found.people) })
  })

  api.patch('/actions/:id', async (c) => {
    const body = await parseBody(c, UpdateActionRequestSchema)
    if (!body.ok) return body.response
    const done = await store.updateAction(c.get('user').id, c.req.param('id'), body.data.details)
    if (!done) return refusedEdit(c, 'Akce nenalezena.')
    // Termíny v hlasování, které po úpravě do akce nepasují, z hlasování zmizí.
    const edited = await store.actionOf(c.get('user').id, c.req.param('id'))
    const misfits = (edited?.poll?.candidates ?? []).filter(
      (candidate) => !fitsAction(body.data.details, candidate),
    )
    await store.removeCandidates(
      c.req.param('id'),
      misfits.map((candidate) => candidate.id),
    )
    // Zapsané události: změnil se název, nebo zmizelo potvrzení.
    const updated = await store.actionOf(c.get('user').id, c.req.param('id'))
    if (updated?.confirmed) await calendar.afterConfirm(updated.id)
    else await calendar.removeEvents(c.req.param('id'))
    return actionResponse(c)
  })

  api.delete('/actions/:id', async (c) => {
    const existing = await store.actionOf(c.get('user').id, c.req.param('id'))
    if (existing?.isOrganizer) await calendar.removeEvents(existing.id)
    const done = await store.deleteAction(c.get('user').id, c.req.param('id'))
    if (!done) return refusedEdit(c, 'Akce nenalezena.')
    return c.json({ ok: true })
  })

  // Pozvánky do akce. Zve jen organizátor, a to přátele a lidi ze svých skupin.
  api.post('/actions/:id/invites', async (c) => {
    const body = await parseBody(c, InviteToActionRequestSchema)
    if (!body.ok) return body.response
    const result = await store.inviteToAction(
      c.get('user').id,
      c.req.param('id'),
      body.data.userIds,
    )
    if (result === 'not-found') return refusedEdit(c, 'Akce nenalezena.')
    if (result === 'not-contact') return fail(c, 400, { error: NOT_CONTACT })
    return actionResponse(c)
  })

  // Odkaz rovnou do akce. Kdo ho otevře a přijme, je přítel organizátora i účastník.
  api.post('/actions/:id/links', async (c) => {
    const user = c.get('user')
    const token = randomToken()
    const link = await store.createActionLink(
      user.id,
      c.req.param('id'),
      hash(token),
      new Date(now().getTime() + INVITE_DAYS * DAY_MS),
    )
    if (!link) return refusedEdit(c, 'Akce nenalezena.')
    return c.json({
      link,
      url: `${config.appOrigin}/pozvanka/${token}`,
      action: await store.actionOf(user.id, c.req.param('id')),
    })
  })

  api.delete('/actions/:id/links/:linkId', async (c) => {
    const done = await store.revokeActionLink(
      c.get('user').id,
      c.req.param('id'),
      c.req.param('linkId'),
    )
    if (!done) return refusedEdit(c, 'Odkaz nenalezen.')
    return actionResponse(c)
  })

  api.delete('/actions/:id/invites/:userId', async (c) => {
    const done = await store.cancelInvite(
      c.get('user').id,
      c.req.param('id'),
      c.req.param('userId'),
    )
    if (!done) return refusedEdit(c, 'Pozvánka nenalezena.')
    await calendar.removeEvent(c.req.param('userId'), c.req.param('id'))
    return actionResponse(c)
  })

  // Nezbytný účastník: bez něj se termín nenavrhne.
  api.patch('/actions/:id/invites/:userId', async (c) => {
    const body = await parseBody(c, SetRequiredRequestSchema)
    if (!body.ok) return body.response
    const done = await store.setRequired(
      c.get('user').id,
      c.req.param('id'),
      c.req.param('userId'),
      body.data.required,
    )
    if (!done) return refusedEdit(c, 'Pozvánka nenalezena.')
    return actionResponse(c)
  })

  // Prosba o rozpis: účastník ji uvidí jako upozornění v aplikaci.
  api.post('/actions/:id/invites/:userId/remind', async (c) => {
    const result = await store.remind(
      c.get('user').id,
      c.req.param('id'),
      c.req.param('userId'),
      now(),
    )
    if (result === 'not-found') return refusedEdit(c, 'Pozvánka nenalezena.')
    if (result === 'too-soon') {
      return fail(c, 429, { error: 'Poprosit jde zase až zítra.', code: 'limit' })
    }
    return actionResponse(c)
  })

  // Všechny možné začátky jednoho dne a kdo v nich může (výběr vlastního času).
  api.get('/actions/:id/days/:date', async (c) => {
    const user = c.get('user')
    const date = DateStringSchema.safeParse(c.req.param('date'))
    const found = await store.actionForView(user.id, c.req.param('id'))
    if (!found) return fail(c, 404, { error: 'Akce nenalezena.' })
    const { from, to } = found.action.details
    if (!date.success || date.data < from || date.data > to) {
      return fail(c, 400, { error: 'Den neleží v období akce.' })
    }
    return c.json({ slots: actionDaySlots(found.action, found.people, date.data) })
  })

  // Hlasování o 1–3 termínech místo jednoho návrhu.
  api.put('/actions/:id/poll', async (c) => {
    const body = await parseBody(c, CreatePollRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const action = await store.actionOf(user.id, c.req.param('id'))
    if (!action) return fail(c, 404, { error: 'Akce nenalezena.' })
    if (!action.isOrganizer) return fail(c, 403, { error: ORGANIZER_ONLY })
    if (body.data.slots.some((slot) => !fitsAction(action.details, slot))) {
      return fail(c, 400, { error: SLOT_MISFIT })
    }
    const keys = body.data.slots.map((slot) => `${slot.date} ${slot.start}`)
    if (new Set(keys).size !== keys.length) {
      return fail(c, 400, { error: 'Stejný termín je v hlasování dvakrát.' })
    }
    await store.createPoll(user.id, action.id, body.data.slots, body.data.deadline)
    // Navržený termín zmizel, i z kalendářů.
    await calendar.removeEvents(action.id)
    return actionResponse(c)
  })

  api.delete('/actions/:id/poll', async (c) => {
    const done = await store.deletePoll(c.get('user').id, c.req.param('id'))
    if (!done) return refusedEdit(c, 'Akce nenalezena.')
    return actionResponse(c)
  })

  api.put('/actions/:id/poll/votes', async (c) => {
    const body = await parseBody(c, VoteRequestSchema)
    if (!body.ok) return body.response
    const done = await store.vote(c.get('user').id, c.req.param('id'), body.data.votes)
    if (!done) return fail(c, 404, { error: 'Hlasování nenalezeno.' })
    return actionResponse(c)
  })

  api.post('/actions/:id/poll/candidates/:candidateId/choose', async (c) => {
    const user = c.get('user')
    const slot = await store.choosePoll(user.id, c.req.param('id'), c.req.param('candidateId'))
    if (!slot) return refusedEdit(c, 'Termín v hlasování nenalezen.')
    await calendar.afterConfirm(c.req.param('id'))
    return actionResponse(c)
  })

  // Odpověď pozvaného. Kdo odmítne, akci už neuvidí.
  api.post('/actions/:id/response', async (c) => {
    const body = await parseBody(c, RespondToActionRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const done = await store.respondToAction(user.id, c.req.param('id'), body.data.accept)
    if (!done) return fail(c, 404, { error: 'Pozvánka nenalezena.' })
    if (!body.data.accept) await calendar.removeEvent(user.id, c.req.param('id'))
    return c.json({
      action: body.data.accept ? await store.actionOf(user.id, c.req.param('id')) : null,
    })
  })

  // Navržený termín: musí ležet v období a v denním okně akce a mít její délku. Účastníci pak
  // odpoví, zda jdou. Organizátor jde vždy, jeho kalendáře se to týká hned.
  api.put('/actions/:id/confirmed', async (c) => {
    const body = await parseBody(c, ConfirmedSlotSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const action = await store.actionOf(user.id, c.req.param('id'))
    if (!action) return fail(c, 404, { error: 'Akce nenalezena.' })
    if (!action.isOrganizer) return fail(c, 403, { error: ORGANIZER_ONLY })
    if (!fitsAction(action.details, body.data)) return fail(c, 400, { error: SLOT_MISFIT })
    await store.confirmAction(user.id, action.id, body.data)
    await calendar.afterConfirm(action.id)
    return actionResponse(c)
  })

  // Odpověď účastníka na navržený termín: jdu, nejdu, nebo jiný termín.
  api.post('/actions/:id/slot-response', async (c) => {
    const body = await parseBody(c, SlotResponseRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const action = await store.actionOf(user.id, c.req.param('id'))
    if (!action || action.myStatus === 'invited') return fail(c, 404, { error: 'Akce nenalezena.' })
    if (action.isOrganizer) return fail(c, 400, { error: 'Organizátor na svůj termín neodpovídá.' })
    if (!action.confirmed) return fail(c, 400, { error: 'Akce zatím nemá navržený termín.' })
    if (body.data.response === 'counter' && !fitsAction(action.details, body.data.counter)) {
      return fail(c, 400, { error: SLOT_MISFIT })
    }
    await store.respondToSlot(user.id, action.id, body.data)
    // Kdo jde a má automatický zápis, tomu se termín zapíše. Kdo nejde, tomu se smaže.
    await calendar.afterConfirm(action.id)
    return actionResponse(c)
  })

  // Organizátor přijme jiný termín, který navrhl účastník.
  api.post('/actions/:id/counters/:userId/adopt', async (c) => {
    const user = c.get('user')
    const action = await store.actionOf(user.id, c.req.param('id'))
    if (!action) return fail(c, 404, { error: 'Akce nenalezena.' })
    if (!action.isOrganizer) return fail(c, 403, { error: ORGANIZER_ONLY })
    const adopted = await store.adoptCounter(user.id, action.id, c.req.param('userId'))
    if (!adopted) return fail(c, 404, { error: 'Návrh už neplatí.' })
    await calendar.afterConfirm(action.id)
    return actionResponse(c)
  })

  api.delete('/actions/:id/confirmed', async (c) => {
    const done = await store.confirmAction(c.get('user').id, c.req.param('id'), null)
    if (!done) return refusedEdit(c, 'Akce nenalezena.')
    await calendar.removeEvents(c.req.param('id'))
    return actionResponse(c)
  })

  // Potvrzený termín do mého kalendáře (pro ty, kdo nemají zapnutý automatický zápis).
  api.post('/actions/:id/calendar', async (c) => {
    const user = c.get('user')
    const action = await store.actionOf(user.id, c.req.param('id'))
    if (!action || action.myStatus === 'invited') return fail(c, 404, { error: 'Akce nenalezena.' })
    if (!action.confirmed) return fail(c, 400, { error: 'Akce zatím nemá navržený termín.' })
    if (!action.isOrganizer && action.mySlot !== 'going') {
      return fail(c, 400, { error: 'Do kalendáře jde zapsat, až odpovíš, že jdeš.', code: 'slot' })
    }
    const status = await calendar.status(user.id)
    if (status.state !== 'connected' || !status.canWrite) {
      return fail(c, 400, { error: 'Nejdřív připoj Google Kalendář se zápisem.', code: 'calendar' })
    }
    if (!(await calendar.writeEvent(user.id, action))) {
      return fail(c, 503, { error: 'Termín se do kalendáře nepodařilo zapsat.', code: 'calendar' })
    }
    return actionResponse(c)
  })

  api.delete('/actions/:id/calendar', async (c) => {
    const user = c.get('user')
    if (!(await store.actionOf(user.id, c.req.param('id')))) {
      return fail(c, 404, { error: 'Akce nenalezena.' })
    }
    await calendar.removeEvent(user.id, c.req.param('id'))
    return actionResponse(c)
  })

  // Přátelé

  api.get('/friends', async (c) => c.json(await store.friendsOf(c.get('user').id, now())))

  // Osobní odkaz „přidej si mě do přátel“. Server si nechá jen otisk tokenu.
  api.post('/friends/invites', async (c) => {
    const token = randomToken()
    const invite = await store.createFriendInvite(
      c.get('user').id,
      hash(token),
      new Date(now().getTime() + INVITE_DAYS * DAY_MS),
    )
    return c.json({ invite, url: `${config.appOrigin}/pozvanka/${token}` })
  })

  api.delete('/friends/invites/:inviteId', async (c) => {
    const done = await store.revokeFriendInvite(c.get('user').id, c.req.param('inviteId'))
    if (!done) return fail(c, 404, { error: 'Pozvánka nenalezena.' })
    return c.json({ ok: true })
  })

  // Žádost o přátelství podle e-mailu. Odpověď neprozradí, zda e-mail patří k účtu.
  api.post('/friends/requests', async (c) => {
    const body = await parseBody(c, SendFriendRequestSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const result = await store.sendFriendRequest(user.id, body.data.email, now())
    if (result === 'self') return fail(c, 400, { error: 'To je tvůj e-mail.' })
    if (result === 'limit') {
      return fail(c, 429, {
        error: 'Dnes už jsi poslal hodně žádostí, zkus to zítra.',
        code: 'limit',
      })
    }
    return c.json({ result, ...(await store.friendsOf(user.id, now())) })
  })

  api.post('/friends/requests/:requestId/accept', async (c) => {
    const user = c.get('user')
    const friendId = await store.acceptFriendRequest(user.id, c.req.param('requestId'), now())
    if (!friendId) return fail(c, 404, { error: 'Žádost už neplatí.' })
    return c.json(await store.friendsOf(user.id, now()))
  })

  // Odmítnutí žádosti, kterou jsem dostal, nebo zrušení té, kterou jsem poslal.
  api.delete('/friends/requests/:requestId', async (c) => {
    const user = c.get('user')
    const done = await store.deleteFriendRequest(user.id, c.req.param('requestId'))
    if (!done) return fail(c, 404, { error: 'Žádost už neplatí.' })
    return c.json(await store.friendsOf(user.id, now()))
  })

  api.delete('/friends/:userId', async (c) => {
    const done = await store.removeFriend(c.get('user').id, c.req.param('userId'))
    if (!done) return fail(c, 404, { error: 'Přítel nenalezen.' })
    return c.json({ ok: true })
  })

  // Skupiny

  api.get('/groups', async (c) => c.json({ groups: await store.groupsOf(c.get('user').id, now()) }))

  api.post('/groups', async (c) => {
    const body = await parseBody(c, GroupNameSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const id = await store.createGroup(user.id, body.data.name)
    return c.json({ group: await store.groupOf(user.id, id, now()) })
  })

  api.delete('/groups/:id', async (c) => {
    const user = c.get('user')
    const groupId = c.req.param('id')
    if (await store.deleteGroup(user.id, groupId)) return c.json({ ok: true })
    return (await store.groupOf(user.id, groupId, now()))
      ? fail(c, 403, { error: OWNER_ONLY })
      : fail(c, 404, { error: 'Skupina nenalezena.' })
  })

  api.post('/groups/:id/leave', async (c) => {
    const done = await store.leaveGroup(c.get('user').id, c.req.param('id'))
    if (!done) return fail(c, 404, { error: 'Skupina nenalezena.' })
    return c.json({ ok: true })
  })

  api.post('/groups/:id/members', async (c) => {
    const body = await parseBody(c, AddMemberSchema)
    if (!body.ok) return body.response
    const user = c.get('user')
    const groupId = c.req.param('id')
    const result = await store.addMember(user.id, groupId, body.data.userId)
    if (result === 'not-owner') {
      return (await store.groupOf(user.id, groupId, now()))
        ? fail(c, 403, { error: OWNER_ONLY })
        : fail(c, 404, { error: 'Skupina nenalezena.' })
    }
    if (result === 'not-friend') return fail(c, 403, { error: 'Přidat jde jen přátele.' })
    if (result === 'full') return fail(c, 403, { error: 'Skupina je plná.', code: 'full' })
    return c.json({ group: await store.groupOf(user.id, groupId, now()) })
  })

  api.delete('/groups/:id/members/:userId', async (c) => {
    const user = c.get('user')
    const groupId = c.req.param('id')
    const group = await store.groupOf(user.id, groupId, now())
    if (!group) return fail(c, 404, { error: 'Skupina nenalezena.' })
    if (!group.isOwner) return fail(c, 403, { error: OWNER_ONLY })
    const done = await store.removeMember(user.id, groupId, c.req.param('userId'))
    if (!done) return fail(c, 404, { error: 'Člen nenalezen.' })
    return c.json({ group: await store.groupOf(user.id, groupId, now()) })
  })

  // Pozvánka je náhodný token v odkazu. Server si nechá jen jeho otisk.
  api.post('/groups/:id/invites', async (c) => {
    const user = c.get('user')
    const groupId = c.req.param('id')
    const token = randomToken()
    const invite = await store.createInvite(
      user.id,
      groupId,
      hash(token),
      new Date(now().getTime() + INVITE_DAYS * DAY_MS),
    )
    if (!invite) {
      return (await store.groupOf(user.id, groupId, now()))
        ? fail(c, 403, { error: OWNER_ONLY })
        : fail(c, 404, { error: 'Skupina nenalezena.' })
    }
    return c.json({
      invite,
      url: `${config.appOrigin}/pozvanka/${token}`,
      group: await store.groupOf(user.id, groupId, now()),
    })
  })

  api.delete('/groups/:id/invites/:inviteId', async (c) => {
    const user = c.get('user')
    const groupId = c.req.param('id')
    const done = await store.revokeInvite(user.id, groupId, c.req.param('inviteId'))
    if (!done) return fail(c, 404, { error: 'Pozvánka nenalezena.' })
    return c.json({ group: await store.groupOf(user.id, groupId, now()) })
  })

  // Odkaz s pozvánkou do skupiny i do přátel má stejnou adresu: /pozvanka/<token>.
  api.get('/invites/:token', async (c) => {
    const invite = await store.invitePreview(c.get('user').id, hash(c.req.param('token')), now())
    if (!invite) return fail(c, 404, { error: INVALID_INVITE, code: 'invite' })
    return c.json({ invite })
  })

  api.post('/invites/:token/accept', async (c) => {
    const user = c.get('user')
    const result = await store.acceptInvite(user.id, hash(c.req.param('token')), now())
    if (result === 'invalid') return fail(c, 404, { error: INVALID_INVITE, code: 'invite' })
    if (result === 'full') return fail(c, 403, { error: 'Skupina je plná.', code: 'full' })
    if (result === 'self') {
      return fail(c, 400, { error: 'Sám sebe si do přátel přidat nejde.', code: 'self' })
    }
    if (result.kind === 'friend') {
      return c.json({ kind: 'friend', friend: await store.friendOf(user.id, result.friendId) })
    }
    if (result.kind === 'action') {
      return c.json({ kind: 'action', action: await store.actionOf(user.id, result.actionId) })
    }
    return c.json({ kind: 'group', group: await store.groupOf(user.id, result.groupId, now()) })
  })

  // Jednorázové převzetí akcí uložených v prohlížeči. Jen parametry, lidi z nich ne.
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
        body.data.actions.map(({ name, from, to, durationMinutes, windowStart, windowEnd }) => ({
          details: { name, from, to, durationMinutes, windowStart, windowEnd },
        })),
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
