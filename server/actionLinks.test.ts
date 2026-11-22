import { describe, expect, it } from 'vitest'
import type { ActionResource } from '@/contract/api'
import { browser, testServer } from './testing'

/** Odkaz rovnou do akce a akce z jedné věty. */

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

const tokenOf = (url: string) => new URL(url).pathname.split('/').at(-1)!

/** Anna a Eva, přátelé přes osobní odkaz. */
async function friends(draftAction?: Parameters<typeof testServer>[4]) {
  const server = await testServer(
    {},
    undefined,
    () => new Date('2026-11-19T12:00:00Z'),
    undefined,
    draftAction,
  )
  const anna = browser(server.app)
  const eva = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  await eva.login('eva@example.com', 'Eva')
  const { url } = await json<{ url: string }>(await anna.send('POST', '/api/friends/invites'))
  await eva.send('POST', `/api/invites/${tokenOf(url)}/accept`)
  const evaId = (await json<{ user: { id: string } }>(await eva.get('/api/me'))).user.id
  return { ...server, anna, eva, evaId }
}

describe('odkaz do akce', () => {
  it('makes a stranger a friend and a participant in one step', async () => {
    const server = await testServer({}, undefined, () => new Date('2026-11-19T12:00:00Z'))
    const anna = browser(server.app)
    const petr = browser(server.app)
    await anna.login('anna@example.com', 'Anna')
    await petr.login('petr@example.com', 'Petr')
    const { action } = await json<{ action: ActionResource }>(
      await anna.send('POST', '/api/actions', { details, inviteUserIds: [] }),
    )
    const created = await json<{ url: string; action: ActionResource }>(
      await anna.send('POST', `/api/actions/${action.id}/links`),
    )
    expect(created.action.links).toHaveLength(1)
    const token = tokenOf(created.url)

    const preview = await json<{ invite: object }>(await petr.get(`/api/invites/${token}`))
    expect(preview.invite).toMatchObject({
      kind: 'action',
      actionName: 'Pivo',
      organizerName: 'Anna',
      isParticipant: false,
      isSelf: false,
    })
    const accepted = await json<{ kind: string; action: ActionResource }>(
      await petr.send('POST', `/api/invites/${token}/accept`),
    )
    expect(accepted).toMatchObject({ kind: 'action', action: { myStatus: 'accepted' } })
    // Přibyl přítel i účastník a odkaz vidí jen organizátor.
    const petrFriends = await json<{ friends: { name: string }[] }>(await petr.get('/api/friends'))
    expect(petrFriends.friends.map((friend) => friend.name)).toEqual(['Anna'])
    expect(accepted.action.links).toEqual([])
    const organizer = await json<{ actions: ActionResource[] }>(await anna.get('/api/actions'))
    expect(organizer.actions[0].invites.map((invite) => [invite.name, invite.status])).toEqual([
      ['Petr', 'accepted'],
    ])

    // Podruhé už je účastník a vlastní odkaz organizátor přijmout nemůže.
    expect(
      (await json<{ invite: object }>(await petr.get(`/api/invites/${token}`))).invite,
    ).toMatchObject({ isParticipant: true })
    expect((await anna.send('POST', `/api/invites/${token}/accept`)).status).toBe(400)
  })

  it('lets only the organizer create and revoke links', async () => {
    const { anna, eva, evaId } = await friends()
    const { action } = await json<{ action: ActionResource }>(
      await anna.send('POST', '/api/actions', { details, inviteUserIds: [evaId] }),
    )
    await eva.send('POST', `/api/actions/${action.id}/response`, { accept: true })
    expect((await eva.send('POST', `/api/actions/${action.id}/links`)).status).toBe(403)

    const created = await json<{ url: string; action: ActionResource }>(
      await anna.send('POST', `/api/actions/${action.id}/links`),
    )
    const linkId = created.action.links[0].id
    const revoked = await json<{ action: ActionResource }>(
      await anna.send('DELETE', `/api/actions/${action.id}/links/${linkId}`),
    )
    expect(revoked.action.links).toEqual([])
    expect((await eva.get(`/api/invites/${tokenOf(created.url)}`)).status).toBe(404)
  })
})

describe('akce z jedné věty', () => {
  it('returns details for the form and counts towards the daily limit', async () => {
    const seen: string[] = []
    const { anna } = await friends(async (input) => {
      seen.push(`${input.today} ${input.text}`)
      return { details, reply: 'Pivo příští týden večer.' }
    })
    const response = await anna.send('POST', '/api/actions/draft', {
      text: 'pivo příští týden večer',
    })
    expect(await json(response)).toEqual({ details, reply: 'Pivo příští týden večer.' })
    expect(seen).toEqual(['2026-11-19 pivo příští týden večer'])
    expect((await anna.send('POST', '/api/actions/draft', { text: 'x' })).status).toBe(400)
    // Nic se neuložilo.
    expect((await json<{ actions: unknown[] }>(await anna.get('/api/actions'))).actions).toEqual([])
  })
})
