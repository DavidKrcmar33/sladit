import { describe, expect, it, vi } from 'vitest'
import { browser, testServer } from '../server/testing'
import { httpBackend } from './client/http'
import type { ActionResource, Group, OwnedPerson } from './contract/api'
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

const petrContent: SourceContent = {
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
  return createSession({ backend: httpBackend(fetcher), ...options })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function setup() {
  const server = await testServer({}, async () => petrContent)
  const anna = browser(server.app)
  const eva = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  return { ...server, anna, eva }
}

describe('pozvánka v prohlížeči', () => {
  it('reads the token from the invite address only', () => {
    expect(inviteTokenFromPath('/pozvanka/abcdefghijklmnop_-12')).toBe('abcdefghijklmnop_-12')
    expect(inviteTokenFromPath('/pozvanka/kratky')).toBeNull()
    expect(inviteTokenFromPath('/jinde/abcdefghijklmnop_-12')).toBeNull()
  })

  it('keeps the invite through the Google login and joins the group after it', async () => {
    const { anna, eva } = await setup()
    const annaSession = sessionFor(anna)
    await annaSession.init()
    expect(await annaSession.createGroup('Parta')).toBeNull()
    const groupId = annaSession.state.selectedGroupId!
    await annaSession.createInvite(groupId)
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
    expect(after.state.invite?.preview).toMatchObject({ groupName: 'Parta', ownerName: 'Anna' })

    await after.acceptInvite()
    expect(after.state.invite).toBeNull()
    expect(storage.items.has(INVITE_STORAGE_KEY)).toBe(false)
    expect(after.selectedGroup.value).toMatchObject({ name: 'Parta', isOwner: false })
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

describe('akce ve skupině v prohlížeči', () => {
  /** Anna pořádá akci ve skupině s hostem Petrem, Eva je členka bez rozpisu. */
  async function memberView() {
    const context = await setup()
    const { anna, eva } = context
    const { group } = await json<{ group: Group }>(
      await anna.send('POST', '/api/groups', { name: 'Parta' }),
    )
    const { url } = await json<{ url: string }>(
      await anna.send('POST', `/api/groups/${group.id}/invites`),
    )
    await eva.login('eva@example.com', 'Eva')
    await eva.send('POST', `/api/invites/${inviteTokenFromPath(new URL(url).pathname)}/accept`)
    const { action } = await json<{ action: ActionResource }>(
      await anna.send('POST', '/api/actions', { details, groupId: group.id }),
    )
    const { person: petr } = await json<{ person: OwnedPerson }>(
      await anna.send('POST', `/api/actions/${action.id}/guests`, { name: 'Petr' }),
    )
    await anna.send('POST', `/api/people/${petr.id}/readings`, {
      from: details.from,
      to: details.to,
      files: [{ id: 'f1', name: 'petr.txt', kind: 'text' }],
      parts: [{ part: { text: 'Út O' }, notes: [] }],
    })
    const session = sessionFor(eva)
    await session.init()
    session.selectAction(action.id)
    await session.refreshView()
    return { ...context, session, groupId: group.id, actionId: action.id, petr }
  }

  it('shows the others only as may / may not / unknown and takes proposals from the server', async () => {
    const { session, petr } = await memberView()
    expect(session.canEditAction.value).toBe(false)
    expect(session.usesServerView.value).toBe(true)
    expect(session.participants.value.map((person) => [person.name, person.isPrivate])).toEqual([
      ['Anna', true],
      ['Petr', true],
      ['Eva', false],
    ])

    const rows = session.calendar.value!.rows
    expect(rows.map((row) => [row.personName, row.isPrivate ?? false])).toEqual([
      ['Anna', true],
      ['Petr', true],
      ['Eva', false],
    ])
    const petrRow = rows.find((row) => row.personId === petr.id)!
    expect(petrRow.days.map((day) => day.attendance)).toEqual([
      'available',
      'busy',
      'available',
      'available',
      'available',
      'available',
      'available',
    ])
    // U cizího řádku nejsou směny ani časy, jen výsledek.
    expect(
      petrRow.days.every((day) => day.status.kind === 'private' && day.windows.length === 0),
    ).toBe(true)
    expect(session.proposals.value[0]).toMatchObject({ date: '2026-11-23', available: [petr.id] })
    expect(session.calendarBlocker.value).toBeNull()
  })

  it('lets a member fill in only their own schedule and recomputes the proposals', async () => {
    const { session } = await memberView()
    session.setDraftName('Kamarád')
    expect(await session.saveDraft()).toBe('Lidi do akce přidává jen organizátor.')
    session.discardDraft()

    // Eva doplní, že ve středu může: návrhy se přepočítají na serveru samy.
    const eva = session.selfPersonId.value!
    await session.saveDayShifts(eva, '2026-11-25', [])
    await vi.waitFor(() => {
      expect(session.proposals.value[0]).toMatchObject({ date: '2026-11-25' })
    })
    expect(session.proposals.value[0].available).toContain(eva)
  })

  it('drops the group actions after leaving the group', async () => {
    const { session, groupId } = await memberView()
    await session.leaveGroup(groupId)
    expect(session.state.groups).toEqual([])
    expect(session.state.actions).toEqual([])
    expect(session.selectedAction.value).toBeNull()
  })
})
