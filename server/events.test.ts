import { describe, expect, it } from 'vitest'
import type { ActionResource, ActionView, Friend, OwnedPerson } from '@/contract/api'
import type { SourceContent } from '@/core/schema'
import { browser, testServer } from './testing'

/**
 * Přátelé a akce s pozvanými. Pozvaný se do termínu počítá až po přijetí, ostatní účastníci
 * o něm vidí jen „může / nemůže / nevíme“ a akci upravuje a potvrzuje jen organizátor.
 */

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

/** Rozpis s hodnotami, které se nesmí objevit v odpovědi pro nikoho jiného než vlastníka. */
const secretContent: SourceContent = {
  circle: 'Práce',
  coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
  shifts: [
    {
      date: '2026-11-24',
      start: '17:13',
      end: '21:47',
      label: 'TAJNE',
      raw: 'tajny-zaznam',
      uncertain: true,
    },
  ],
  warnings: ['tajna-poznamka'],
  parity: { calendar: false, anchors: [] },
}

const SECRETS = ['17:13', '21:47', 'TAJNE', 'tajny-zaznam', 'tajna-poznamka', 'rozpis_anna']

const reading = {
  from: '2026-11-23',
  to: '2026-11-29',
  files: [{ id: 'f1', name: 'rozpis_anna.txt', kind: 'text' }],
  parts: [{ part: { text: 'Podklad (text):\nÚt 17:13–21:47' }, notes: [] }],
}

type Browser = ReturnType<typeof browser>

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function tokenOf(url: string): string {
  return new URL(url).pathname.split('/').at(-1)!
}

async function userId(user: Browser): Promise<string> {
  return (await json<{ user: { id: string } }>(await user.get('/api/me'))).user.id
}

async function selfOf(user: Browser): Promise<OwnedPerson> {
  return (await json<{ people: OwnedPerson[] }>(await user.get('/api/people'))).people[0]
}

/** Z `from` a `to` udělá přátele přes osobní odkaz. */
async function befriend(from: Browser, to: Browser) {
  const { url } = await json<{ url: string }>(await from.send('POST', '/api/friends/invites'))
  await to.send('POST', `/api/invites/${tokenOf(url)}/accept`)
}

/** Anna, Eva a Jana. Anna s Evou jsou přátelé, Jana nikoho nezná. Anna má tajný rozpis. */
async function people(now?: () => Date) {
  const server = await testServer({}, async () => secretContent, now)
  const anna = browser(server.app)
  const eva = browser(server.app)
  const jana = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  await eva.login('eva@example.com', 'Eva')
  await jana.login('jana@example.com', 'Jana')
  await befriend(anna, eva)
  await anna.send('POST', `/api/people/${(await selfOf(anna)).id}/readings`, reading)
  return {
    ...server,
    anna,
    eva,
    jana,
    ids: { anna: await userId(anna), eva: await userId(eva), jana: await userId(jana) },
  }
}

/** Anna pozve Evu do akce. */
async function invited() {
  const setup = await people()
  const { action } = await json<{ action: ActionResource }>(
    await setup.anna.send('POST', '/api/actions', { details, inviteUserIds: [setup.ids.eva] }),
  )
  return { ...setup, actionId: action.id }
}

describe('přátelé', () => {
  it('connects two people through a personal link; both see each other by name and e-mail', async () => {
    const { anna, eva, jana } = await people()
    const annaFriends = await json<{ friends: Friend[] }>(await anna.get('/api/friends'))
    const evaFriends = await json<{ friends: Friend[] }>(await eva.get('/api/friends'))
    expect(annaFriends.friends.map((friend) => friend.name)).toEqual(['Eva'])
    expect(evaFriends.friends.map((friend) => friend.name)).toEqual(['Anna'])
    expect(evaFriends.friends[0].email).toBe('anna@example.com')
    expect(await json(await jana.get('/api/friends'))).toMatchObject({ friends: [] })
  })

  it('shows who sends the link, refuses one’s own link and a revoked or expired one', async () => {
    let clock = new Date('2026-11-19T12:00:00Z')
    const { anna, jana } = await people(() => clock)
    const { url, invite } = await json<{ url: string; invite: { id: string } }>(
      await anna.send('POST', '/api/friends/invites'),
    )
    expect(await json(await jana.get(`/api/invites/${tokenOf(url)}`))).toEqual({
      invite: { kind: 'friend', fromName: 'Anna', isFriend: false, isSelf: false },
    })
    const own = await anna.send('POST', `/api/invites/${tokenOf(url)}/accept`)
    expect(own.status).toBe(400)
    expect(await json(own)).toMatchObject({ code: 'self' })

    await anna.send('DELETE', `/api/friends/invites/${invite.id}`)
    expect((await jana.send('POST', `/api/invites/${tokenOf(url)}/accept`)).status).toBe(404)

    const fresh = await json<{ url: string }>(await anna.send('POST', '/api/friends/invites'))
    clock = new Date('2026-11-26T12:00:01Z')
    expect((await jana.send('POST', `/api/invites/${tokenOf(fresh.url)}/accept`)).status).toBe(404)
  })

  it('removes a friendship on both sides', async () => {
    const { anna, eva, ids } = await people()
    expect((await eva.send('DELETE', `/api/friends/${ids.anna}`)).status).toBe(200)
    expect(await json(await anna.get('/api/friends'))).toMatchObject({ friends: [] })
    expect(
      (await anna.send('POST', '/api/actions', { details, inviteUserIds: [ids.eva] })).status,
    ).toBe(400)
  })
})

describe('pozvánky do akce', () => {
  it('counts an invited friend only after they accept', async () => {
    const { anna, eva, actionId } = await invited()
    const annaSelf = await selfOf(anna)
    const evaSelf = await selfOf(eva)

    const before = await json<{ actions: ActionResource[] }>(await eva.get('/api/actions'))
    expect(before.actions[0]).toMatchObject({
      id: actionId,
      myStatus: 'invited',
      isOrganizer: false,
      organizerName: 'Anna',
      participantIds: [annaSelf.id],
      invites: [{ name: 'Eva', status: 'invited' }],
    })

    const accepted = await json<{ action: ActionResource }>(
      await eva.send('POST', `/api/actions/${actionId}/response`, { accept: true }),
    )
    expect(accepted.action).toMatchObject({
      myStatus: 'accepted',
      participantIds: [annaSelf.id, evaSelf.id],
      others: [{ id: annaSelf.id, name: 'Anna' }],
    })
  })

  it('hides a declined action from the invitee; the organizer sees it and may invite again', async () => {
    const { anna, eva, ids, actionId } = await invited()
    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: false })
    expect(await json(await eva.get('/api/actions'))).toEqual({ actions: [] })
    expect((await eva.get(`/api/actions/${actionId}/view`)).status).toBe(404)

    const { actions } = await json<{ actions: ActionResource[] }>(await anna.get('/api/actions'))
    expect(actions[0].invites).toMatchObject([{ name: 'Eva', status: 'declined' }])

    await anna.send('POST', `/api/actions/${actionId}/invites`, { userIds: [ids.eva] })
    const again = await json<{ actions: ActionResource[] }>(await eva.get('/api/actions'))
    expect(again.actions[0].myStatus).toBe('invited')
  })

  it('lets only the organizer change, invite, cancel invites and confirm; others are told why', async () => {
    const { eva, ids, actionId } = await invited()
    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: true })
    const attempts = [
      eva.send('PATCH', `/api/actions/${actionId}`, { details }),
      eva.send('DELETE', `/api/actions/${actionId}`),
      eva.send('POST', `/api/actions/${actionId}/invites`, { userIds: [ids.anna] }),
      eva.send('DELETE', `/api/actions/${actionId}/invites/${ids.eva}`),
      eva.send('PUT', `/api/actions/${actionId}/confirmed`, {
        date: '2026-11-25',
        start: '17:00',
        end: '19:00',
      }),
    ]
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403)
      expect(await json(response)).toMatchObject({ error: 'Akci upravuje jen organizátor.' })
    }
  })

  it('hides the action from anyone not invited and refuses to invite strangers', async () => {
    const { anna, jana, ids, actionId } = await invited()
    expect(await json(await jana.get('/api/actions'))).toEqual({ actions: [] })
    expect((await jana.get(`/api/actions/${actionId}/view`)).status).toBe(404)
    expect(
      (await jana.send('POST', `/api/actions/${actionId}/response`, { accept: true })).status,
    ).toBe(404)
    const stranger = await anna.send('POST', `/api/actions/${actionId}/invites`, {
      userIds: [ids.jana],
    })
    expect(stranger.status).toBe(400)
  })

  it('removes a participant whose account is deleted', async () => {
    const { anna, eva, actionId } = await invited()
    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: true })
    await eva.send('DELETE', '/api/me')
    const { actions } = await json<{ actions: ActionResource[] }>(await anna.get('/api/actions'))
    expect(actions[0]).toMatchObject({ participantIds: [(await selfOf(anna)).id], invites: [] })
  })
})

describe('soukromí v akci', () => {
  it('gives the others only three states per day and hides why a day matters', async () => {
    const { anna, eva, actionId } = await invited()
    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: true })
    const annaSelf = await selfOf(anna)
    const evaSelf = await selfOf(eva)

    const raw = await (await eva.get(`/api/actions/${actionId}/view`)).text()
    for (const secret of SECRETS) expect(raw).not.toContain(secret)
    const { view } = JSON.parse(raw) as { view: ActionView }
    expect(view.others).toEqual([
      {
        personId: annaSelf.id,
        days: [
          'available',
          'busy',
          'available',
          'available',
          'available',
          'available',
          'available',
        ],
      },
    ])
    const annaPivots = view.stability.pivots.filter((pivot) => pivot.personId === annaSelf.id)
    expect(annaPivots.length).toBeGreaterThan(0)
    for (const pivot of annaPivots) {
      expect(pivot.dates.every((item) => item.reason === 'private')).toBe(true)
    }
    // Eva svůj rozpis nemá, důvod u sebe vidí.
    const evaPivot = view.stability.pivots.find((pivot) => pivot.personId === evaSelf.id)
    expect(evaPivot?.dates.every((item) => item.reason === 'missing')).toBe(true)

    const listed = JSON.stringify(await json(await eva.get('/api/actions')))
    for (const secret of SECRETS) expect(listed).not.toContain(secret)
  })

  it('shows the organizer their own reasons, the others only as three states', async () => {
    const { anna, eva, actionId } = await invited()
    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: true })
    const annaSelf = await selfOf(anna)
    const evaSelf = await selfOf(eva)
    const { view } = await json<{ view: ActionView }>(
      await anna.get(`/api/actions/${actionId}/view`),
    )
    expect(view.others.map((other) => other.personId)).toEqual([evaSelf.id])
    const own = view.stability.pivots.find((pivot) => pivot.personId === annaSelf.id)
    expect(own?.dates).toContainEqual({ date: '2026-11-24', reason: 'uncertain' })
  })
})

describe('potvrzený termín', () => {
  it('lets the organizer confirm a slot that fits the action; everyone sees it', async () => {
    const { anna, eva, actionId } = await invited()
    await eva.send('POST', `/api/actions/${actionId}/response`, { accept: true })
    const slot = { date: '2026-11-25', start: '18:00', end: '20:00' }
    const confirmed = await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    expect(await json(confirmed)).toMatchObject({ action: { confirmed: slot } })
    const { actions } = await json<{ actions: ActionResource[] }>(await eva.get('/api/actions'))
    expect(actions[0].confirmed).toEqual(slot)

    const wrong = [
      { date: '2026-11-22', start: '18:00', end: '20:00' },
      { date: '2026-11-25', start: '16:00', end: '18:00' },
      { date: '2026-11-25', start: '21:00', end: '23:00' },
      { date: '2026-11-25', start: '18:00', end: '19:00' },
    ]
    for (const item of wrong) {
      expect((await anna.send('PUT', `/api/actions/${actionId}/confirmed`, item)).status).toBe(400)
    }

    const removed = await anna.send('DELETE', `/api/actions/${actionId}/confirmed`)
    expect(await json(removed)).toMatchObject({ action: { confirmed: null } })
  })

  it('keeps the confirmed slot after a rename, drops it when the period changes', async () => {
    const { anna, actionId } = await invited()
    const slot = { date: '2026-11-25', start: '18:00', end: '20:00' }
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    const renamed = await anna.send('PATCH', `/api/actions/${actionId}`, {
      details: { ...details, name: 'Kino' },
    })
    expect(await json(renamed)).toMatchObject({ action: { confirmed: slot } })
    const moved = await anna.send('PATCH', `/api/actions/${actionId}`, {
      details: { ...details, name: 'Kino', to: '2026-11-30' },
    })
    expect(await json(moved)).toMatchObject({ action: { confirmed: null } })
  })
})
