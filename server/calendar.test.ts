import { describe, expect, it } from 'vitest'
import type { ActionResource, ActionView, CalendarStatus, OwnedPerson } from '@/contract/api'
import { CALENDAR_CIRCLE } from '@/core/compose'
import { serverConfigFromEnv } from './config'
import { browser, testServer } from './testing'

/**
 * Google Kalendář přes falešný Google: obsazenost jen v časech, šifrovaný token,
 * zápis potvrzené akce automaticky, nebo na vyžádání, a úklid zapsaných událostí.
 */

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

type Browser = ReturnType<typeof browser>

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function tokenOf(url: string): string {
  return new URL(url).pathname.split('/').at(-1)!
}

/** Projde souhlasem s kalendářem u falešného Googlu. Vrátí, kam aplikace přesměrovala. */
async function connectCalendar(user: Browser): Promise<string> {
  const start = await user.get('/api/calendar/connect')
  const consent = new URL(start.headers.get('location')!)
  const approve = await user.request(
    `/api/auth/fake-google/calendar/approve?${new URLSearchParams({
      state: consent.searchParams.get('state')!,
      login_hint: consent.searchParams.get('login_hint')!,
    })}`,
  )
  const callback = new URL(approve.headers.get('location')!)
  const done = await user.request(`${callback.pathname}${callback.search}`)
  return done.headers.get('location')!
}

async function statusOf(user: Browser): Promise<CalendarStatus> {
  return (await json<{ calendar: CalendarStatus }>(await user.get('/api/calendar'))).calendar
}

async function selfOf(user: Browser): Promise<OwnedPerson> {
  return (await json<{ people: OwnedPerson[] }>(await user.get('/api/people'))).people[0]
}

/** Anna a Eva jsou přátelé, Eva přijala pozvánku do Annina piva. Hodiny stojí na 19. 11. */
async function setup() {
  const server = await testServer({}, undefined, () => new Date('2026-11-19T12:00:00Z'))
  const anna = browser(server.app)
  const eva = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  await eva.login('eva@example.com', 'Eva')
  const { url } = await json<{ url: string }>(await anna.send('POST', '/api/friends/invites'))
  await eva.send('POST', `/api/invites/${tokenOf(url)}/accept`)
  const evaId = (await json<{ user: { id: string } }>(await eva.get('/api/me'))).user.id
  const { action } = await json<{ action: ActionResource }>(
    await anna.send('POST', '/api/actions', { details, inviteUserIds: [evaId] }),
  )
  await eva.send('POST', `/api/actions/${action.id}/response`, { accept: true })
  // Eva má ve středu od 18 do 20 schůzku.
  server.calendar.busy.set('eva@example.com', [
    { start: '2026-11-25T17:00:00Z', end: '2026-11-25T19:00:00Z' },
  ])
  return { ...server, anna, eva, actionId: action.id }
}

const slot = { date: '2026-11-26', start: '18:00', end: '20:00' }

describe('připojení kalendáře', () => {
  it('connects, reads busy times only and keeps the token encrypted', async () => {
    const { eva, db } = await setup()
    expect(await statusOf(eva)).toMatchObject({ state: 'off' })

    expect(await connectCalendar(eva)).toBe('/?kalendar=pripojen')
    expect(await statusOf(eva)).toMatchObject({
      state: 'connected',
      canWrite: true,
      autoWrite: false,
      syncedAt: expect.any(String),
    })

    const calendar = (await selfOf(eva)).sources.find((source) => source.circle === CALENDAR_CIRCLE)
    expect(calendar).toMatchObject({
      coverage: [],
      shifts: [{ date: '2026-11-25', start: '18:00', end: '20:00', label: 'Kalendář', raw: '' }],
    })

    const [row] = await db.query<{ refresh_token: string }>(
      'select refresh_token from calendar_connections',
    )
    expect(row.refresh_token.startsWith('v1:')).toBe(true)
    expect(row.refresh_token).not.toContain('fake-refresh')
  })

  it('shows the others a busy calendar day only as “may not”', async () => {
    const { anna, eva, actionId } = await setup()
    await connectCalendar(eva)
    const evaSelf = await selfOf(eva)
    const raw = await (await anna.get(`/api/actions/${actionId}/view`)).text()
    expect(raw).not.toContain('Kalendář')
    expect(raw).not.toContain('google-kalendar')
    const { view } = JSON.parse(raw) as { view: ActionView }
    const evaDays = view.others.find((other) => other.personId === evaSelf.id)!.days
    // Bez podkladu jsou dny „nevíme“, jen středa se schůzkou je „nemůže“.
    expect(evaDays).toEqual([
      'unknown',
      'unknown',
      'busy',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
    ])
  })

  it('marks an expired connection and stops using its busy times', async () => {
    const { eva, calendar } = await setup()
    await connectCalendar(eva)
    calendar.expire('eva@example.com')
    await eva.send('POST', '/api/calendar/sync')
    expect(await statusOf(eva)).toMatchObject({ state: 'expired' })
    expect((await selfOf(eva)).sources).toEqual([])

    // Nové připojení zase funguje.
    expect(await connectCalendar(eva)).toBe('/?kalendar=pripojen')
    expect(await statusOf(eva)).toMatchObject({ state: 'connected' })
  })

  it('disconnects, revokes the access at Google and forgets the busy times', async () => {
    const { eva, calendar } = await setup()
    await connectCalendar(eva)
    const removed = await json<{ calendar: CalendarStatus }>(
      await eva.send('DELETE', '/api/calendar'),
    )
    expect(removed.calendar.state).toBe('off')
    expect(calendar.revoked).toHaveLength(1)
    expect((await selfOf(eva)).sources).toEqual([])
  })

  it('refuses a consent that comes back into somebody else’s session', async () => {
    const { anna, eva } = await setup()
    const start = await anna.get('/api/calendar/connect')
    const consent = new URL(start.headers.get('location')!)
    const approve = await anna.request(
      `/api/auth/fake-google/calendar/approve?${new URLSearchParams({
        state: consent.searchParams.get('state')!,
        login_hint: consent.searchParams.get('login_hint')!,
      })}`,
    )
    // Mezitím se v tomtéž prohlížeči přihlásila Eva.
    anna.cookies.set('sladit_session', eva.cookies.get('sladit_session')!)
    const callback = new URL(approve.headers.get('location')!)
    const done = await anna.request(`${callback.pathname}${callback.search}`)
    expect(done.headers.get('location')).toBe('/?kalendar=chyba')
    expect(await statusOf(eva)).toMatchObject({ state: 'off' })
  })

  it('explains a refused consent', async () => {
    const { eva } = await setup()
    const start = await eva.get('/api/calendar/connect')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const done = await eva.request(
      `/api/auth/google/callback?${new URLSearchParams({ state, error: 'access_denied' })}`,
    )
    expect(done.headers.get('location')).toBe('/?kalendar=zamitnuto')
  })
})

describe('zápis potvrzeného termínu', () => {
  it('writes it for those with automatic writing and lets the others add it themselves', async () => {
    const { anna, eva, calendar, actionId } = await setup()
    await connectCalendar(anna)
    await connectCalendar(eva)
    await anna.send('PATCH', '/api/calendar', { autoWrite: true })

    const confirmed = await json<{ action: ActionResource }>(
      await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot),
    )
    expect(confirmed.action.inMyCalendar).toBe(true)
    expect([...calendar.events.get('anna@example.com')!.values()]).toMatchObject([
      { title: 'Pivo', ...slot },
    ])
    // Eva automatický zápis nemá: aplikace se jí zeptá.
    expect(calendar.events.get('eva@example.com')).toBeUndefined()
    const { actions } = await json<{ actions: ActionResource[] }>(await eva.get('/api/actions'))
    expect(actions[0].inMyCalendar).toBe(false)

    const added = await json<{ action: ActionResource }>(
      await eva.send('POST', `/api/actions/${actionId}/calendar`),
    )
    expect(added.action.inMyCalendar).toBe(true)
    expect([...calendar.events.get('eva@example.com')!.values()]).toMatchObject([
      { title: 'Pivo', ...slot },
    ])
  })

  it('updates the events after a rename and removes them when the date is no longer confirmed', async () => {
    const { anna, eva, calendar, actionId } = await setup()
    await connectCalendar(anna)
    await connectCalendar(eva)
    await anna.send('PATCH', '/api/calendar', { autoWrite: true })
    await eva.send('PATCH', '/api/calendar', { autoWrite: true })
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)

    await anna.send('PATCH', `/api/actions/${actionId}`, { details: { ...details, name: 'Kino' } })
    for (const email of ['anna@example.com', 'eva@example.com']) {
      expect([...calendar.events.get(email)!.values()].map((event) => event.title)).toEqual([
        'Kino',
      ])
    }

    await anna.send('DELETE', `/api/actions/${actionId}/confirmed`)
    expect(calendar.events.get('anna@example.com')!.size).toBe(0)
    expect(calendar.events.get('eva@example.com')!.size).toBe(0)
  })

  it('removes the event of someone who leaves, and all events of a deleted action', async () => {
    const { anna, eva, calendar, actionId } = await setup()
    await connectCalendar(anna)
    await connectCalendar(eva)
    await anna.send('PATCH', '/api/calendar', { autoWrite: true })
    await eva.send('PATCH', '/api/calendar', { autoWrite: true })
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)

    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: false })
    expect(calendar.events.get('eva@example.com')!.size).toBe(0)

    await anna.send('DELETE', `/api/actions/${actionId}`)
    expect(calendar.events.get('anna@example.com')!.size).toBe(0)
  })

  it('refuses to write without a connection or without the permission to write', async () => {
    const { anna, eva, calendar, actionId } = await setup()
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    const notConnected = await eva.send('POST', `/api/actions/${actionId}/calendar`)
    expect(notConnected.status).toBe(400)
    expect(await json(notConnected)).toMatchObject({ code: 'calendar' })

    calendar.denyWrite.add('eva@example.com')
    await connectCalendar(eva)
    expect(await statusOf(eva)).toMatchObject({ state: 'connected', canWrite: false })
    expect((await eva.send('POST', `/api/actions/${actionId}/calendar`)).status).toBe(400)
  })
})

describe('nastavení klíče k tokenům', () => {
  const real = {
    NODE_ENV: 'development',
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    LLM_PROVIDER: 'claude',
    ANTHROPIC_API_KEY: 'test',
  }

  it('turns the calendar off without a key and refuses a key of the wrong length', () => {
    expect(serverConfigFromEnv(real).tokenKey).toBeNull()
    expect(
      serverConfigFromEnv({ ...real, TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') })
        .tokenKey?.length,
    ).toBe(32)
    expect(() =>
      serverConfigFromEnv({ ...real, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })
})
