import { describe, expect, it, vi } from 'vitest'
import { browser, testServer } from '../server/testing'
import { httpBackend } from './client/http'
import type { SourceContent } from './core/schema'
import {
  createSession,
  INVITE_STORAGE_KEY,
  inviteTokenFromPath,
  type SessionOptions,
} from './session'

/**
 * Sezení v prohlížeči proti skutečnému serveru (PGlite v paměti, falešný Google).
 * Každý uživatel má svůj „prohlížeč“ s cookies.
 */

type Browser = ReturnType<typeof browser>

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

/** Annin rozpis: v úterý odpolední do 23:00, jinak volno. */
const annaContent: SourceContent = {
  circle: 'Práce',
  coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
  shifts: [
    { date: '2026-11-24', start: '16:00', end: '23:00', label: 'O', raw: 'O', uncertain: false },
  ],
  warnings: [],
  parity: { calendar: false, anchors: [] },
}

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

function sessionFor(user: Browser, options: Partial<SessionOptions> = {}) {
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) =>
    user.request(String(input), init ?? {})) as typeof fetch
  return createSession({ backend: httpBackend(fetcher), today: () => '2026-11-19', ...options })
}

async function setup() {
  const server = await testServer(
    {},
    async () => annaContent,
    () => new Date('2026-11-19T12:00:00Z'),
  )
  const anna = browser(server.app)
  const eva = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  return { ...server, anna, eva }
}

/** Anna a Eva jsou přátelé (přes odkaz) a Anna má přečtený rozpis. */
async function friends() {
  const context = await setup()
  const annaSession = sessionFor(context.anna)
  await annaSession.init()
  await annaSession.createFriendInvite()
  const token = inviteTokenFromPath(new URL(annaSession.state.lastInvite!.url).pathname)!
  await context.eva.login('eva@example.com', 'Eva')
  const evaSession = sessionFor(context.eva, { inviteToken: token })
  await evaSession.init()
  await evaSession.acceptInvite()
  annaSession.addFiles([new File(['Út O'], 'anna.txt', { type: 'text/plain' })])
  await annaSession.readSchedule()
  await annaSession.init()
  return { ...context, annaSession, evaSession }
}

describe('pozvánka odkazem', () => {
  it('reads the token from the invite address only', () => {
    expect(inviteTokenFromPath('/pozvanka/abcdefghijklmnop_-12')).toBe('abcdefghijklmnop_-12')
    expect(inviteTokenFromPath('/pozvanka/kratky')).toBeNull()
    expect(inviteTokenFromPath('/jinde/abcdefghijklmnop_-12')).toBeNull()
  })

  it('keeps a friend link through the Google login and adds the friend after it', async () => {
    const { anna, eva } = await setup()
    const annaSession = sessionFor(anna)
    await annaSession.init()
    await annaSession.createFriendInvite()
    const token = inviteTokenFromPath(new URL(annaSession.state.lastInvite!.url).pathname)!

    // Eva otevře odkaz nepřihlášená: pozvánka čeká v sessionStorage.
    const storage = memoryStorage()
    const before = sessionFor(eva, { inviteToken: token, inviteStorage: storage })
    await before.init()
    expect(before.state.status).toBe('signedOut')
    expect(before.state.invite).toEqual({ token, preview: null, error: null })
    expect(storage.items.get(INVITE_STORAGE_KEY)).toBe(token)

    // Po návratu z Googlu se stránka načte znovu, už bez tokenu v adrese.
    await eva.login('eva@example.com', 'Eva')
    const after = sessionFor(eva, { inviteStorage: storage })
    await after.init()
    expect(after.state.invite?.preview).toEqual({
      kind: 'friend',
      fromName: 'Anna',
      isFriend: false,
      isSelf: false,
    })

    await after.acceptInvite()
    expect(after.state.invite).toBeNull()
    expect(storage.items.has(INVITE_STORAGE_KEY)).toBe(false)
    expect(after.state.page).toBe('friends')
    expect(after.state.friends.map((friend) => friend.name)).toEqual(['Anna'])
  })

  it('joins a group through its link and offers its members as contacts', async () => {
    const { anna, eva } = await setup()
    const annaSession = sessionFor(anna)
    await annaSession.init()
    await annaSession.createGroup('Parta')
    await annaSession.createInvite(annaSession.state.selectedGroupId!)
    const token = inviteTokenFromPath(new URL(annaSession.state.lastInvite!.url).pathname)!

    await eva.login('eva@example.com', 'Eva')
    const session = sessionFor(eva, { inviteToken: token })
    await session.init()
    expect(session.state.invite?.preview).toMatchObject({ kind: 'group', groupName: 'Parta' })
    await session.acceptInvite()
    expect(session.selectedGroup.value).toMatchObject({ name: 'Parta', isOwner: false })
    expect(session.contacts.value).toEqual([
      { userId: expect.any(String), name: 'Anna', isFriend: false, groupNames: ['Parta'] },
    ])
  })

  it('adds a friend to my group without a link', async () => {
    const { annaSession } = await friends()
    await annaSession.createGroup('Parta')
    const groupId = annaSession.state.selectedGroupId!
    const eva = annaSession.state.friends.find((friend) => friend.name === 'Eva')!
    await annaSession.addMember(groupId, eva.userId)
    expect(annaSession.selectedGroup.value?.members.map((member) => member.name)).toEqual([
      'Anna',
      'Eva',
    ])
    expect(annaSession.contacts.value).toEqual([
      { userId: eva.userId, name: 'Eva', isFriend: true, groupNames: ['Parta'] },
    ])
  })

  it('explains an invite that no longer works and lets it go', async () => {
    const { eva } = await setup()
    await eva.login('eva@example.com', 'Eva')
    const storage = memoryStorage()
    const session = sessionFor(eva, {
      inviteToken: 'neplatny-token-0123456789',
      inviteStorage: storage,
    })
    await session.init()
    expect(session.state.invite?.error).toMatch(/Pozvánka neplatí/)
    session.declineInvite()
    expect(session.state.invite).toBeNull()
    expect(storage.items.size).toBe(0)
  })
})

describe('akce s pozvanými', () => {
  /** Anna pozve Evu do akce. */
  async function invited() {
    const context = await friends()
    const { annaSession, evaSession } = context
    const evaId = annaSession.contacts.value.find((contact) => contact.name === 'Eva')!.userId
    await annaSession.createAction(details, [evaId])
    await evaSession.init()
    evaSession.selectAction(evaSession.state.actions[0].id)
    return context
  }

  it('shows the invitation and counts the friend only after accepting', async () => {
    const { evaSession } = await invited()
    expect(evaSession.actionItems.value).toMatchObject([{ name: 'Pivo', waitingForMe: true }])
    expect(evaSession.participants.value.map((person) => [person.name, person.isPrivate])).toEqual([
      ['Anna', true],
    ])

    await evaSession.respondToAction(true)
    expect(evaSession.selectedResource.value?.myStatus).toBe('accepted')
    expect(evaSession.participants.value.map((person) => [person.name, person.isPrivate])).toEqual([
      ['Anna', true],
      ['Eva', false],
    ])
  })

  it('shows the others only as may / may not / unknown and recomputes after my own edit', async () => {
    const { evaSession } = await invited()
    await evaSession.respondToAction(true)
    await evaSession.refreshView()
    const annaRow = evaSession.calendar.value!.rows[0]
    expect(annaRow.isPrivate).toBe(true)
    expect(annaRow.days.map((day) => day.attendance)).toEqual([
      'available',
      'busy',
      'available',
      'available',
      'available',
      'available',
      'available',
    ])
    expect(annaRow.days.every((day) => day.windows.length === 0)).toBe(true)

    // Eva doplní, že ve středu může: návrhy se přepočítají na serveru samy.
    await evaSession.saveDayShifts('2026-11-25', [])
    await vi.waitFor(() => {
      expect(evaSession.proposals.value[0]).toMatchObject({ date: '2026-11-25' })
    })
    expect(evaSession.proposals.value[0].available).toContain(evaSession.me.value!.id)
  })

  it('drops a declined action from the list', async () => {
    const { evaSession } = await invited()
    await evaSession.respondToAction(false)
    expect(evaSession.state.actions).toEqual([])
    expect(evaSession.state.page).toBe('schedule')
  })

  it('ignores a second confirmation while the first one is saving', async () => {
    const { annaSession, evaSession } = await invited()
    await evaSession.respondToAction(true)
    const slot = { date: '2026-11-25', start: '18:00', end: '20:00' }
    const first = annaSession.confirmSlot(slot)
    expect(annaSession.state.pending).toBe('confirm')
    await annaSession.confirmSlot({ date: '2026-11-26', start: '18:00', end: '20:00' })
    await first
    expect(annaSession.state.pending).toBeNull()
    expect(annaSession.selectedResource.value?.confirmed).toEqual(slot)
  })

  it('lets the organizer confirm a slot that the friend then sees', async () => {
    const { annaSession, evaSession } = await invited()
    await evaSession.respondToAction(true)
    const slot = { date: '2026-11-25', start: '18:00', end: '20:00' }
    await annaSession.confirmSlot(slot)
    await evaSession.init()
    expect(evaSession.state.actions[0].confirmed).toEqual(slot)
  })
})

describe('Google Kalendář v prohlížeči', () => {
  /** Projde souhlasem s kalendářem u falešného Googlu. */
  async function connectCalendar(user: Browser) {
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
    return new URL(done.headers.get('location')!, 'http://localhost').searchParams.get('kalendar')
  }

  it('reports the connection after coming back from Google and shows busy times in my schedule', async () => {
    const { eva, calendar } = await setup()
    await eva.login('eva@example.com', 'Eva')
    calendar.busy.set('eva@example.com', [
      { start: '2026-11-25T17:00:00Z', end: '2026-11-25T19:00:00Z' },
    ])
    const result = await connectCalendar(eva)
    const session = sessionFor(eva, { calendarResult: result })
    await session.init()
    expect(session.state.calendarNotice).toMatch(/Google Kalendář je připojený/)
    expect(session.state.page).toBe('settings')
    expect(session.state.calendar).toMatchObject({ state: 'connected', autoWrite: false })
    const wednesday = session.scheduleCalendar.value!.rows[0].days[9]
    expect(wednesday.status).toMatchObject({
      kind: 'unknown',
      shifts: [{ label: 'Kalendář', start: '18:00', end: '20:00' }],
    })
  })

  it('asks to add a confirmed date to the calendar unless writing is automatic', async () => {
    const context = await friends()
    const { annaSession, evaSession, eva } = context
    await connectCalendar(eva)
    const evaId = annaSession.contacts.value.find((contact) => contact.name === 'Eva')!.userId
    await annaSession.createAction(details, [evaId])
    await evaSession.init()
    evaSession.selectAction(evaSession.state.actions[0].id)
    await evaSession.respondToAction(true)
    await annaSession.confirmSlot({ date: '2026-11-25', start: '18:00', end: '20:00' })
    await evaSession.init()
    evaSession.selectAction(evaSession.state.actions[0].id)

    expect(evaSession.calendarPrompt.value).toBe(true)
    await evaSession.addToCalendar()
    expect(evaSession.selectedResource.value?.inMyCalendar).toBe(true)
    expect(evaSession.calendarPrompt.value).toBe(false)
    expect(context.calendar.events.get('eva@example.com')?.size).toBe(1)

    await evaSession.removeFromCalendar()
    expect(evaSession.selectedResource.value?.inMyCalendar).toBe(false)
    evaSession.dismissCalendarPrompt()
    expect(evaSession.calendarPrompt.value).toBe(false)

    await evaSession.setCalendarAutoWrite(true)
    expect(evaSession.state.calendar?.autoWrite).toBe(true)
  })
})
