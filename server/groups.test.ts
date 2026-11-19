import { describe, expect, it } from 'vitest'
import type { ActionResource, ActionView, Group, OwnedPerson } from '@/contract/api'
import type { SourceContent } from '@/core/schema'
import { browser, testServer } from './testing'

/**
 * Skupiny, pozvánky a soukromí: ostatní členové vidí jen „může / nemůže / nevíme“,
 * akci upravuje jen organizátor a kdo ve skupině není, nevidí nic.
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

const SECRETS = ['17:13', '21:47', 'TAJNE', 'tajny-zaznam', 'tajna-poznamka', 'rozpis_Petr']

const reading = {
  from: '2026-11-23',
  to: '2026-11-29',
  files: [{ id: 'f1', name: 'rozpis_Petr.txt', kind: 'text' }],
  parts: [{ part: { text: 'Podklad (text):\nÚt 17:13–21:47' }, notes: [] }],
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Anna založí skupinu a pozve Evu. Jana se přihlásí, ale ve skupině není. */
async function party(now?: () => Date) {
  const server = await testServer({}, async () => secretContent, now)
  const anna = browser(server.app)
  const eva = browser(server.app)
  const jana = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  await eva.login('eva@example.com', 'Eva')
  await jana.login('jana@example.com', 'Jana')
  const { group } = await json<{ group: Group }>(
    await anna.send('POST', '/api/groups', { name: 'Parta' }),
  )
  const created = await json<{ url: string }>(
    await anna.send('POST', `/api/groups/${group.id}/invites`),
  )
  const token = new URL(created.url).pathname.split('/').at(-1)!
  const selfOf = async (user: ReturnType<typeof browser>) =>
    (await json<{ people: OwnedPerson[] }>(await user.get('/api/people'))).people[0]
  return {
    ...server,
    anna,
    eva,
    jana,
    groupId: group.id,
    token,
    inviteUrl: created.url,
    selfOf,
  }
}

/** Eva přijala pozvánku, Anna založila akci ve skupině a přidala hosta Petra s rozpisem. */
async function partyWithAction() {
  const setup = await party()
  const { anna, eva, groupId, token } = setup
  await eva.send('POST', `/api/invites/${token}/accept`)
  const { action } = await json<{ action: ActionResource }>(
    await anna.send('POST', '/api/actions', { details, groupId }),
  )
  const { person: petr } = await json<{ person: OwnedPerson }>(
    await anna.send('POST', `/api/actions/${action.id}/guests`, { name: 'Petr' }),
  )
  await anna.send('POST', `/api/people/${petr.id}/readings`, reading)
  return { ...setup, actionId: action.id, petr }
}

describe('pozvánka odkazem', () => {
  it('lets the invited user see who invites them and join; members see names, never e-mails', async () => {
    const { anna, eva, token, groupId, inviteUrl } = await party()
    expect(inviteUrl).toMatch(/^http:\/\/localhost:5173\/pozvanka\/[\w-]{20,}$/)

    const preview = await json<{ invite: Record<string, unknown> }>(
      await eva.get(`/api/invites/${token}`),
    )
    expect(preview.invite).toEqual({
      groupId,
      groupName: 'Parta',
      ownerName: 'Anna',
      memberCount: 1,
      isMember: false,
    })

    const accepted = await json<{ group: Group }>(
      await eva.send('POST', `/api/invites/${token}/accept`),
    )
    expect(accepted.group).toMatchObject({
      name: 'Parta',
      isOwner: false,
      members: [
        { name: 'Anna', isOwner: true, isYou: false },
        { name: 'Eva', isOwner: false, isYou: true },
      ],
      // Pozvánky vidí jen zakladatel.
      invites: [],
    })

    const annaGroups = await json<{ groups: Group[] }>(await anna.get('/api/groups'))
    expect(annaGroups.groups[0].invites).toHaveLength(1)
    const body = JSON.stringify(await json(await eva.get('/api/groups')))
    expect(body).not.toContain('anna@example.com')
    // Odkaz s pozvánkou server neuloží, zná jen jeho otisk.
    expect(JSON.stringify(annaGroups)).not.toContain(token)
  })

  it('accepting twice changes nothing and a member is told so in the preview', async () => {
    const { eva, token } = await party()
    await eva.send('POST', `/api/invites/${token}/accept`)
    await eva.send('POST', `/api/invites/${token}/accept`)
    const { invite } = await json<{ invite: { isMember: boolean; memberCount: number } }>(
      await eva.get(`/api/invites/${token}`),
    )
    expect(invite).toMatchObject({ isMember: true, memberCount: 2 })
  })

  it('refuses a revoked, expired or made-up invite', async () => {
    let clock = new Date('2026-11-19T12:00:00Z')
    const { anna, eva, jana, token, groupId } = await party(() => clock)

    // Zrušená pozvánka.
    const { groups } = await json<{ groups: Group[] }>(await anna.get('/api/groups'))
    await anna.send('DELETE', `/api/groups/${groupId}/invites/${groups[0].invites[0].id}`)
    const revoked = await eva.send('POST', `/api/invites/${token}/accept`)
    expect(revoked.status).toBe(404)
    expect(await json(revoked)).toMatchObject({ code: 'invite' })

    // Vypršelá pozvánka: platí 7 dní.
    const fresh = await json<{ url: string }>(
      await anna.send('POST', `/api/groups/${groupId}/invites`),
    )
    const freshToken = new URL(fresh.url).pathname.split('/').at(-1)!
    clock = new Date('2026-11-26T12:00:01Z')
    expect((await jana.get(`/api/invites/${freshToken}`)).status).toBe(404)
    expect((await jana.send('POST', `/api/invites/${freshToken}/accept`)).status).toBe(404)

    expect((await jana.get('/api/invites/vymysleny-token')).status).toBe(404)
    expect(await json(await jana.get('/api/groups'))).toEqual({ groups: [] })
  })

  it('lets only the owner invite, revoke invites and remove members', async () => {
    const { anna, eva, jana, token, groupId } = await party()
    await eva.send('POST', `/api/invites/${token}/accept`)
    const { groups } = await json<{ groups: Group[] }>(await anna.get('/api/groups'))
    const evaMember = groups[0].members.find((member) => member.name === 'Eva')!
    const inviteId = groups[0].invites[0].id

    expect((await eva.send('POST', `/api/groups/${groupId}/invites`)).status).toBe(403)
    expect((await eva.send('DELETE', `/api/groups/${groupId}/invites/${inviteId}`)).status).toBe(
      404,
    )
    expect((await eva.send('DELETE', `/api/groups/${groupId}`)).status).toBe(403)
    // Kdo ve skupině není, nedozví se ani to, že existuje.
    expect((await jana.send('POST', `/api/groups/${groupId}/invites`)).status).toBe(404)
    expect((await jana.send('DELETE', `/api/groups/${groupId}`)).status).toBe(404)
    expect((await jana.send('POST', `/api/groups/${groupId}/leave`)).status).toBe(404)

    const removed = await anna.send('DELETE', `/api/groups/${groupId}/members/${evaMember.userId}`)
    expect(removed.status).toBe(200)
    expect(await json(await eva.get('/api/groups'))).toEqual({ groups: [] })
  })
})

describe('akce ve skupině', () => {
  it('includes every member; the others see only names and who organizes it', async () => {
    const { eva, actionId, petr, selfOf, anna } = await partyWithAction()
    const evaSelf = await selfOf(eva)
    const annaSelf = await selfOf(anna)
    const { actions } = await json<{ actions: ActionResource[] }>(await eva.get('/api/actions'))
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      id: actionId,
      isOrganizer: false,
      organizerName: 'Anna',
      participantIds: [annaSelf.id, petr.id, evaSelf.id],
      others: [
        { id: annaSelf.id, name: 'Anna', kind: 'member' },
        { id: petr.id, name: 'Petr', kind: 'guest' },
      ],
    })
    // Rozpis hosta vidí jen ten, kdo ho přidal.
    expect((await eva.get('/api/people')).status).toBe(200)
    const body = JSON.stringify(await json(await eva.get('/api/actions')))
    for (const secret of SECRETS) expect(body).not.toContain(secret)
  })

  it('lets only the organizer change the action; a member is told why', async () => {
    const { eva, actionId, petr } = await partyWithAction()
    const attempts = [
      eva.send('PATCH', `/api/actions/${actionId}`, { details }),
      eva.send('DELETE', `/api/actions/${actionId}`),
      eva.send('POST', `/api/actions/${actionId}/guests`, { name: 'Vetřelec' }),
      eva.send('DELETE', `/api/actions/${actionId}/participants/${petr.id}`),
    ]
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403)
      expect(await json(response)).toMatchObject({ error: 'Akci upravuje jen organizátor.' })
    }
    // Ani přes rozpis hosta se k němu člen nedostane.
    const sneaky = [
      eva.send('PATCH', `/api/people/${petr.id}`, { name: 'Hacknuto' }),
      eva.send('PUT', `/api/people/${petr.id}/overrides/2026-11-25`, { shifts: [] }),
      eva.send('DELETE', `/api/people/${petr.id}/sources/${petr.id}`),
    ]
    for (const response of await Promise.all(sneaky)) expect(response.status).toBe(404)
  })

  it('hides the action from anyone outside the group', async () => {
    const { jana, actionId, groupId } = await partyWithAction()
    expect(await json(await jana.get('/api/actions'))).toEqual({ actions: [] })
    expect((await jana.get(`/api/actions/${actionId}/view`)).status).toBe(404)
    expect((await jana.send('PATCH', `/api/actions/${actionId}`, { details })).status).toBe(404)
    expect((await jana.send('POST', '/api/actions', { details, groupId })).status).toBe(404)
  })

  it('gives a member only three states per day and hides why a day matters', async () => {
    const { eva, actionId, petr, selfOf, anna } = await partyWithAction()
    const evaSelf = await selfOf(eva)
    const annaSelf = await selfOf(anna)
    const response = await eva.get(`/api/actions/${actionId}/view`)
    const raw = await response.text()
    for (const secret of SECRETS) expect(raw).not.toContain(secret)

    const { view } = JSON.parse(raw) as { view: ActionView }
    expect(view.dates).toHaveLength(7)
    expect(view.others).toEqual([
      { personId: annaSelf.id, days: Array(7).fill('unknown') },
      {
        personId: petr.id,
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
    expect(view.proposals[0]).toMatchObject({ date: '2026-11-23', available: [petr.id] })

    const foreignPivots = view.stability.pivots.filter((pivot) => pivot.personId !== evaSelf.id)
    expect(foreignPivots.length).toBeGreaterThan(0)
    for (const pivot of foreignPivots) {
      expect(pivot.dates.every((item) => item.reason === 'private')).toBe(true)
    }
  })

  it('shows the organizer the reasons for their own guest, but not for another member', async () => {
    const { anna, eva, actionId, petr, selfOf } = await partyWithAction()
    const evaSelf = await selfOf(eva)
    const { view } = await json<{ view: ActionView }>(
      await anna.get(`/api/actions/${actionId}/view`),
    )
    const petrPivot = view.stability.pivots.find((pivot) => pivot.personId === petr.id)
    expect(petrPivot?.dates).toContainEqual({ date: '2026-11-24', reason: 'uncertain' })
    const evaPivot = view.stability.pivots.find((pivot) => pivot.personId === evaSelf.id)
    expect(evaPivot?.dates.every((item) => item.reason === 'private')).toBe(true)
    expect(view.others.map((other) => other.personId)).toEqual([evaSelf.id])
  })

  it('adds a member who joins later and drops one who leaves, with the actions they organized', async () => {
    const { anna, eva, jana, actionId, groupId, selfOf } = await partyWithAction()
    const fresh = await json<{ url: string }>(
      await anna.send('POST', `/api/groups/${groupId}/invites`),
    )
    await jana.send('POST', `/api/invites/${new URL(fresh.url).pathname.split('/').at(-1)}/accept`)
    const janaSelf = await selfOf(jana)
    const evaSelf = await selfOf(eva)
    const before = await json<{ action: ActionResource }>(
      await anna.send('PATCH', `/api/actions/${actionId}`, { details }),
    )
    expect(before.action.participantIds).toContain(janaSelf.id)

    // Eva pořádá vlastní akci ve skupině s hostem, pak ze skupiny odejde.
    const { action: evaAction } = await json<{ action: ActionResource }>(
      await eva.send('POST', '/api/actions', { details: { ...details, name: 'Kino' }, groupId }),
    )
    await eva.send('POST', `/api/actions/${evaAction.id}/guests`, { name: 'Host Evy' })
    expect((await eva.send('POST', `/api/groups/${groupId}/leave`)).status).toBe(200)

    const { actions } = await json<{ actions: ActionResource[] }>(await anna.get('/api/actions'))
    expect(actions.map((action) => action.details.name)).toEqual(['Pivo'])
    expect(actions[0].participantIds).not.toContain(evaSelf.id)
    const evaPeople = await json<{ people: OwnedPerson[] }>(await eva.get('/api/people'))
    expect(evaPeople.people.map((person) => person.name)).toEqual(['Eva'])
    expect((await eva.get(`/api/actions/${actionId}/view`)).status).toBe(404)
  })
})

describe('konec skupiny a účtu', () => {
  it('hands the group over when the owner deletes the account; the last member deletes it', async () => {
    const { anna, eva, groupId } = await partyWithAction()
    await anna.send('DELETE', '/api/me')
    const { groups } = await json<{ groups: Group[] }>(await eva.get('/api/groups'))
    expect(groups).toMatchObject([{ id: groupId, isOwner: true, members: [{ name: 'Eva' }] }])
    // Akce, kterou pořádala Anna, zmizela s jejím účtem.
    expect(await json(await eva.get('/api/actions'))).toEqual({ actions: [] })

    await eva.send('POST', `/api/groups/${groupId}/leave`)
    expect(await json(await eva.get('/api/groups'))).toEqual({ groups: [] })
  })

  it('deletes the group with its actions and the guests that were only there', async () => {
    const { anna, eva, groupId } = await partyWithAction()
    expect((await anna.send('DELETE', `/api/groups/${groupId}`)).status).toBe(200)
    expect(await json(await anna.get('/api/actions'))).toEqual({ actions: [] })
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    expect(people.map((person) => person.name)).toEqual(['Anna'])
    expect(await json(await eva.get('/api/groups'))).toEqual({ groups: [] })
  })
})
