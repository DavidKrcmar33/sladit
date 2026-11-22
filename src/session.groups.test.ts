import { describe, expect, it, vi } from 'vitest'
import { browser, testServer } from '../server/testing'
import { httpBackend } from './client/http'
import type { SourceContent } from './core/schema'
import { buildSource, type ReviewBasis } from './llm/review'
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

describe('navržený termín v prohlížeči', () => {
  it('notifies the friend, takes the answer and lets the organizer adopt another date', async () => {
    const { annaSession, evaSession } = await friends()
    const evaId = annaSession.contacts.value.find((contact) => contact.name === 'Eva')!.userId
    await annaSession.createAction(details, [evaId])
    await evaSession.init()
    evaSession.selectAction(evaSession.state.actions[0].id)
    await evaSession.respondToAction(true)
    await annaSession.confirmSlot({ date: '2026-11-25', start: '18:00', end: '20:00' })

    await evaSession.init()
    const actionId = evaSession.state.actions[0].id
    expect(evaSession.slotNotice.value).toEqual({
      actionId,
      text: 'Anna navrhuje termín akce Pivo. Jdeš?',
    })
    expect(evaSession.actionItems.value[0]).toMatchObject({ slotWaiting: true, agreed: false })

    evaSession.selectAction(actionId)
    const other = { date: '2026-11-26', start: '18:00', end: '20:00' }
    await evaSession.respondToSlot({ response: 'counter', counter: other })
    expect(evaSession.slotNotice.value).toBeNull()

    await annaSession.init()
    expect(annaSession.slotNotice.value?.text).toBe('Eva navrhuje jiný termín akce Pivo.')
    annaSession.selectAction(actionId)
    await annaSession.adoptCounter(evaId)
    expect(annaSession.selectedResource.value).toMatchObject({ confirmed: other, agreed: true })
    expect(annaSession.slotNotice.value).toBeNull()
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

  it('asks to add the date to the calendar once I go, unless writing is automatic', async () => {
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

    // Na navržený termín se ptá až po odpovědi „jdu“.
    expect(evaSession.calendarPrompt.value).toBe(false)
    await evaSession.respondToSlot({ response: 'going' })
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

describe('doptání v prohlížeči', () => {
  const block = { weeks: 'every' as const, exceptDates: [], source: 'řádek 1' }
  /** Rozvrh bez data platnosti s nejistým čtvrtkem „Cv?“. */
  const basis: ReviewBasis = {
    readings: [
      {
        documentKind: 'timetable',
        readability: 'good',
        people: 'one',
        legend: '',
        weekParity: 'unstated',
        coverage: [],
        dated: [],
        weekly: [
          {
            ...block,
            weekday: 'thu',
            start: '12:00',
            end: '14:00',
            label: 'Cv',
            raw: 'Cv?',
            uncertain: true,
          },
        ],
        warnings: [],
      },
    ],
    period: { from: '2026-11-16', to: '2026-12-13' },
    extraWarnings: [],
    notes: [],
  }

  async function reviewing() {
    const built = buildSource(basis, [])
    const clarify = vi.fn(async () => ({
      reply: 'Rozumím, ve čtvrtek je to až od 13.',
      answers: [
        {
          kind: 'shift' as const,
          raw: 'Cv?',
          start: '12:00',
          end: '14:00',
          change: { type: 'time' as const, start: '13:00', end: '14:00' },
        },
      ],
    }))
    const server = await testServer(
      {},
      async () => ({
        source: { ...built, circle: 'Škola', parity: { calendar: false, anchors: [] } },
        basis,
      }),
      () => new Date('2026-11-19T12:00:00Z'),
      clarify,
    )
    const anna = browser(server.app)
    await anna.login('anna@example.com', 'Anna')
    const session = sessionFor(anna)
    await session.init()
    session.addFiles([new File(['Čt Cv'], 'rozvrh.txt', { type: 'text/plain' })])
    await session.readSchedule()
    return { session, clarify }
  }

  it('opens the questions right after reading and applies a button answer', async () => {
    const { session } = await reviewing()
    const source = session.reviewSource.value!
    expect(source.questions?.map((question) => question.kind)).toEqual(['period', 'shift'])

    await session.answerReview(
      source.id,
      [{ kind: 'period', range: { from: '2026-11-16', to: '2026-11-22' } }],
      'Platí 16.–22. 11. 2026.',
    )
    expect(session.reviewSource.value?.questions?.map((question) => question.kind)).toEqual([
      'shift',
    ])
    expect(session.state.review.messages[source.id]).toEqual([
      { from: 'me', text: 'Platí 16.–22. 11. 2026.' },
    ])

    // Zavřené okno se samo neotevře, nad kalendářem zůstane připomínka a Odpovědět ho vrátí.
    session.closeReview()
    expect(session.reviewSource.value).toBeNull()
    expect(session.waitingReviews.value.map((waiting) => waiting.id)).toEqual([source.id])
    session.openReview(source.id)
    expect(session.reviewSource.value?.id).toBe(source.id)
  })

  it('turns a message into a proposal that changes nothing until applied', async () => {
    const { session, clarify } = await reviewing()
    const sourceId = session.reviewSource.value!.id
    await session.sendReviewMessage(sourceId, 've čtvrtek je to až od 13')
    expect(clarify).toHaveBeenCalledOnce()
    expect(session.state.review.proposal).toMatchObject({
      sourceId,
      changes: expect.arrayContaining(['Změní se čas: 4 (19. 11., 26. 11., 3. 12., 10. 12.)']),
    })
    expect(session.me.value!.sources[0].shifts[0].start).toBe('12:00')

    await session.applyReviewProposal()
    expect(session.me.value!.sources[0].shifts[0]).toMatchObject({
      start: '13:00',
      uncertain: false,
    })
    expect(session.state.review.messages[sourceId].map((message) => message.text)).toEqual([
      've čtvrtek je to až od 13',
      'Rozumím, ve čtvrtek je to až od 13.',
      'Použít změny',
      'Hotovo, rozpis je upravený.',
    ])
  })
})

describe('žádost o přátelství v prohlížeči', () => {
  it('sends a request by e-mail that the friend sees and accepts', async () => {
    const { anna, eva } = await setup()
    await eva.login('eva@example.com', 'Eva')
    const annaSession = sessionFor(anna)
    await annaSession.init()
    expect(await annaSession.sendFriendRequest('eva@example.com')).toEqual({
      ok: true,
      message: 'Žádost odeslána. Po přijetí přibude mezi přáteli.',
    })
    expect(annaSession.state.friendRequests.outgoing).toMatchObject([{ email: 'eva@example.com' }])
    expect(await annaSession.sendFriendRequest('anna@example.com')).toEqual({
      ok: false,
      message: 'To je tvůj e-mail.',
    })

    const evaSession = sessionFor(eva)
    await evaSession.init()
    const [request] = evaSession.state.friendRequests.incoming
    expect(request).toMatchObject({ fromName: 'Anna', fromEmail: 'anna@example.com' })
    await evaSession.acceptFriendRequest(request.id)
    expect(evaSession.state.friends.map((friend) => friend.name)).toEqual(['Anna'])
    expect(evaSession.state.friendRequests.incoming).toEqual([])
  })
})

describe('odkaz do akce a e-mail v prohlížeči', () => {
  it('joins the action through its link and opens it', async () => {
    const { anna, eva } = await setup()
    const annaSession = sessionFor(anna)
    await annaSession.init()
    await annaSession.createAction({ ...details }, [])
    await annaSession.createActionLink()
    const url = annaSession.state.lastInvite!.url
    expect(annaSession.state.lastInvite?.target).toBe(
      `action:${annaSession.state.selectedActionId}`,
    )

    await eva.login('eva@example.com', 'Eva')
    const evaSession = sessionFor(eva, { inviteToken: inviteTokenFromPath(new URL(url).pathname) })
    await evaSession.init()
    expect(evaSession.state.invite?.preview).toMatchObject({ kind: 'action', actionName: 'Pivo' })
    await evaSession.acceptInvite()
    expect(evaSession.state.page).toBe('action')
    expect(evaSession.selectedResource.value).toMatchObject({ myStatus: 'accepted' })
    expect(evaSession.state.friends.map((friend) => friend.name)).toEqual(['Anna'])
  })

  it('opens the action from the e-mail link even before uploading a schedule', async () => {
    const { anna } = await setup()
    const annaSession = sessionFor(anna)
    await annaSession.init()
    await annaSession.createAction({ ...details, name: 'Kino' }, [])
    await annaSession.createAction({ ...details }, [])
    const kino = annaSession.state.actions.find((action) => action.details.name === 'Kino')!
    const storage = memoryStorage()
    const again = sessionFor(anna, { openActionId: kino.id, inviteStorage: storage })
    await again.init()
    expect(again.state.page).toBe('action')
    expect(again.state.selectedActionId).toBe(kino.id)
    expect(storage.items.size).toBe(0)
  })

  it('turns a sentence into form values without saving anything', async () => {
    const server = await testServer(
      {},
      undefined,
      () => new Date('2026-11-19T12:00:00Z'),
      undefined,
      async () => ({
        details,
        reply: 'Pivo příští týden večer.',
      }),
    )
    const anna = browser(server.app)
    await anna.login('anna@example.com', 'Anna')
    const session = sessionFor(anna)
    await session.init()
    expect(await session.draftAction('pivo příští týden večer')).toEqual({
      details,
      reply: 'Pivo příští týden večer.',
    })
    expect(await session.draftAction('x')).toMatchObject({ details: null })
    expect(session.state.actions).toEqual([])
    expect(session.state.notifications).toEqual({ email: true })
    await session.setEmailNotifications(false)
    expect(session.state.notifications).toEqual({ email: false })
  })
})
