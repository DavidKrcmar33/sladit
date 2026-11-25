import { describe, expect, it } from 'vitest'
import type { ActionResource, ActionView } from '@/contract/api'
import type { Proposal, SourceContent } from '@/core/schema'
import { browser, testServer } from './testing'

/**
 * Domluva termínu v reálném světě: ideální začátek a víkendové okno, nezbytní lidé a nejmenší
 * počet, prosba o rozpis, výběr vlastního času a hlasování o několika termínech.
 */

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

/** Volný celý týden. */
const free: SourceContent = {
  circle: 'Práce',
  coverage: [{ from: '2026-11-16', to: '2026-12-06' }],
  shifts: [],
  warnings: [],
  parity: { calendar: false, anchors: [] },
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Anna pořádá, Eva a Jana přijaly. Rozpisy mají Anna a Eva (volno), Jana žádný. */
async function setup(actionDetails: object = details) {
  const server = await testServer(
    {},
    async () => free,
    () => new Date('2026-11-19T12:00:00Z'),
  )
  const anna = browser(server.app)
  const eva = browser(server.app)
  const jana = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  const ids: Record<string, string> = {}
  for (const [user, email, name] of [
    [eva, 'eva@example.com', 'Eva'],
    [jana, 'jana@example.com', 'Jana'],
  ] as const) {
    await user.login(email, name)
    const { url } = await json<{ url: string }>(await anna.send('POST', '/api/friends/invites'))
    await user.send('POST', `/api/invites/${new URL(url).pathname.split('/').at(-1)}/accept`)
    ids[name] = (await json<{ user: { id: string } }>(await user.get('/api/me'))).user.id
  }
  for (const user of [anna, eva]) {
    const { people } = await json<{ people: { id: string; isSelf: boolean }[] }>(
      await user.get('/api/people'),
    )
    const me = people.find((person) => person.isSelf)!
    await user.send('POST', `/api/people/${me.id}/readings`, {
      from: '2026-11-23',
      to: '2026-11-29',
      files: [{ id: 'f', name: 'rozpis.txt', kind: 'text' }],
      parts: [{ part: { text: 'volno' }, notes: [] }],
    })
  }
  const { action } = await json<{ action: ActionResource }>(
    await anna.send('POST', '/api/actions', {
      details: actionDetails,
      inviteUserIds: [ids.Eva, ids.Jana],
    }),
  )
  for (const user of [eva, jana]) {
    await user.send('POST', `/api/actions/${action.id}/response`, { accept: true })
  }
  const view = async (user = anna) =>
    (await json<{ view: ActionView }>(await user.get(`/api/actions/${action.id}/view`))).view
  const actionOf = async (user = anna) =>
    (await json<{ actions: ActionResource[] }>(await user.get('/api/actions'))).actions[0]
  return { ...server, anna, eva, jana, ids, actionId: action.id, view, actionOf }
}

describe('podmínky akce', () => {
  it('keeps the preferred start and the weekend window and proposes by them', async () => {
    const { view, actionOf } = await setup({
      ...details,
      preferredStart: '19:00',
      weekendWindowStart: '10:00',
      weekendWindowEnd: '14:00',
    })
    expect((await actionOf()).details).toMatchObject({
      preferredStart: '19:00',
      weekendWindowStart: '10:00',
      weekendWindowEnd: '14:00',
    })
    const { proposals, dayBest } = await view()
    // Jana nemá rozpis, takže může nejvýš 2 z 3 a nejlepší je pondělí v 19:00.
    expect(proposals[0]).toMatchObject({ date: '2026-11-23', start: '19:00' })
    expect(dayBest).toEqual([2, 2, 2, 2, 2, 2, 2])
  })

  it('leaves out dates without a required person and with too few people', async () => {
    const { anna, ids, actionId, view } = await setup()
    expect((await view()).proposals.length).toBeGreaterThan(0)
    await anna.send('PATCH', `/api/actions/${actionId}/invites/${ids.Jana}`, { required: true })
    // Jana nemá rozpis: „nevíme“ termín nezakáže, ale jistý být nemůže.
    const unknownRequired = await view()
    expect(unknownRequired.proposals.length).toBeGreaterThan(0)
    expect(unknownRequired.stability.certain).toBe(false)

    await anna.send('PATCH', `/api/actions/${actionId}`, { details: { ...details, minPeople: 3 } })
    expect((await view()).proposals).toEqual([])
  })

  it('lets only the organizer mark people as required', async () => {
    const { eva, ids, actionId } = await setup()
    const refused = await eva.send('PATCH', `/api/actions/${actionId}/invites/${ids.Jana}`, {
      required: true,
    })
    expect(refused.status).toBe(403)
  })
})

describe('prosba o rozpis', () => {
  it('shows the reminder to the participant and allows it once in 12 hours', async () => {
    const { anna, jana, ids, actionId, actionOf } = await setup()
    expect((await actionOf(jana)).remindedAt).toBeNull()
    const first = await anna.send('POST', `/api/actions/${actionId}/invites/${ids.Jana}/remind`)
    expect(first.status).toBe(200)
    expect((await actionOf(jana)).remindedAt).toBe('2026-11-19T12:00:00.000Z')
    const again = await anna.send('POST', `/api/actions/${actionId}/invites/${ids.Jana}/remind`)
    expect(again.status).toBe(429)
  })
})

describe('výběr vlastního času', () => {
  it('lists every start of a day with who can, only inside the action', async () => {
    const { eva, actionId } = await setup()
    const { slots } = await json<{ slots: Proposal[] }>(
      await eva.get(`/api/actions/${actionId}/days/2026-11-24`),
    )
    expect(slots.map((slot) => slot.start)).toEqual([
      '17:00',
      '17:30',
      '18:00',
      '18:30',
      '19:00',
      '19:30',
      '20:00',
    ])
    expect(slots[0].available).toHaveLength(2)
    expect(slots[0].unknown).toHaveLength(1)
    expect((await eva.get(`/api/actions/${actionId}/days/2026-12-01`)).status).toBe(400)
  })
})

describe('hlasování o termínu', () => {
  const tuesday = { date: '2026-11-24', start: '18:00', end: '20:00' }
  const friday = { date: '2026-11-27', start: '19:00', end: '21:00' }

  it('collects votes and turns the chosen date into the proposed one', async () => {
    const { anna, eva, jana, actionId, actionOf } = await setup()
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, tuesday)
    const created = await json<{ action: ActionResource }>(
      await anna.send('PUT', `/api/actions/${actionId}/poll`, {
        slots: [tuesday, friday],
        deadline: '2026-11-21T18:00:00.000Z',
      }),
    )
    // Hlasování nahradí navržený termín.
    expect(created.action.confirmed).toBeNull()
    expect(created.action.poll?.deadline).toBe('2026-11-21T18:00:00.000Z')
    const [tue, fri] = created.action.poll!.candidates

    await eva.send('PUT', `/api/actions/${actionId}/poll/votes`, {
      votes: [
        { candidateId: tue.id, vote: 'no' },
        { candidateId: fri.id, vote: 'yes' },
      ],
    })
    await jana.send('PUT', `/api/actions/${actionId}/poll/votes`, {
      votes: [{ candidateId: fri.id, vote: 'maybe' }],
    })
    const evaView = await actionOf(eva)
    expect(evaView.poll!.candidates.map((candidate) => candidate.myVote)).toEqual(['no', 'yes'])
    expect(evaView.poll!.candidates[1].votes.map((vote) => [vote.name, vote.vote])).toEqual([
      ['Eva', 'yes'],
      ['Jana', 'maybe'],
    ])

    const chosen = await json<{ action: ActionResource }>(
      await anna.send('POST', `/api/actions/${actionId}/poll/candidates/${fri.id}/choose`),
    )
    expect(chosen.action).toMatchObject({ confirmed: friday, poll: null })
    // Kdo hlasoval „můžu“, ten jde. Ostatní odpoví jako u navrženého termínu.
    expect(chosen.action.invites.map((invite) => [invite.name, invite.slot])).toEqual([
      ['Eva', 'going'],
      ['Jana', 'pending'],
    ])
  })

  it('refuses dates outside the action, votes from strangers and choices by others', async () => {
    const { app, anna, eva, actionId } = await setup()
    const outside = { date: '2026-11-24', start: '21:00', end: '23:00' }
    expect(
      (
        await anna.send('PUT', `/api/actions/${actionId}/poll`, {
          slots: [outside],
          deadline: null,
        })
      ).status,
    ).toBe(400)
    expect(
      (await eva.send('PUT', `/api/actions/${actionId}/poll`, { slots: [tuesday], deadline: null }))
        .status,
    ).toBe(403)
    const { action } = await json<{ action: ActionResource }>(
      await anna.send('PUT', `/api/actions/${actionId}/poll`, { slots: [tuesday], deadline: null }),
    )
    const candidateId = action.poll!.candidates[0].id
    const petr = browser(app)
    await petr.login('petr@example.com', 'Petr')
    const stranger = await petr.send('PUT', `/api/actions/${actionId}/poll/votes`, {
      votes: [{ candidateId, vote: 'yes' }],
    })
    expect(stranger.status).toBe(404)
    expect(
      (await eva.send('POST', `/api/actions/${actionId}/poll/candidates/${candidateId}/choose`))
        .status,
    ).toBe(403)

    // Přímý návrh termínu hlasování ukončí.
    const proposed = await json<{ action: ActionResource }>(
      await anna.send('PUT', `/api/actions/${actionId}/confirmed`, friday),
    )
    expect(proposed.action.poll).toBeNull()
  })

  it('drops candidates that no longer fit after the action changes', async () => {
    const { anna, actionId } = await setup()
    await anna.send('PUT', `/api/actions/${actionId}/poll`, {
      slots: [tuesday, friday],
      deadline: null,
    })
    const edited = await json<{ action: ActionResource }>(
      await anna.send('PATCH', `/api/actions/${actionId}`, {
        details: { ...details, to: '2026-11-25' },
      }),
    )
    expect(edited.action.poll?.candidates.map((candidate) => candidate.date)).toEqual([
      '2026-11-24',
    ])
  })
})
