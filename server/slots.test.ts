import { describe, expect, it } from 'vitest'
import type { ActionResource } from '@/contract/api'
import { browser, testServer } from './testing'

/**
 * Navržený termín: organizátor ho navrhne, účastníci odpoví „jdu“, „nejdu“ nebo navrhnou jiný.
 * Domluveno je, když jdou všichni, kdo pozvánku přijali.
 */

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}
const slot = { date: '2026-11-26', start: '18:00', end: '20:00' }
const other = { date: '2026-11-27', start: '19:00', end: '21:00' }

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Anna pořádá, Eva a Jana pozvánku přijaly. */
async function setup() {
  const server = await testServer({}, undefined, () => new Date('2026-11-19T12:00:00Z'))
  const anna = browser(server.app)
  const eva = browser(server.app)
  const jana = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  const ids: string[] = []
  for (const [user, email, name] of [
    [eva, 'eva@example.com', 'Eva'],
    [jana, 'jana@example.com', 'Jana'],
  ] as const) {
    await user.login(email, name)
    const { url } = await json<{ url: string }>(await anna.send('POST', '/api/friends/invites'))
    await user.send('POST', `/api/invites/${new URL(url).pathname.split('/').at(-1)}/accept`)
    ids.push((await json<{ user: { id: string } }>(await user.get('/api/me'))).user.id)
  }
  const { action } = await json<{ action: ActionResource }>(
    await anna.send('POST', '/api/actions', { details, inviteUserIds: ids }),
  )
  for (const user of [eva, jana]) {
    await user.send('POST', `/api/actions/${action.id}/response`, { accept: true })
  }
  const actionOf = async (user: typeof anna) =>
    (await json<{ actions: ActionResource[] }>(await user.get('/api/actions'))).actions[0]
  const respond = (user: typeof anna, body: object) =>
    user.send('POST', `/api/actions/${action.id}/slot-response`, body)
  return { ...server, anna, eva, jana, evaId: ids[0], actionId: action.id, actionOf, respond }
}

describe('navržený termín', () => {
  it('asks everyone who accepted and is agreed once all of them go', async () => {
    const { anna, eva, jana, actionId, actionOf, respond } = await setup()
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    expect(await actionOf(eva)).toMatchObject({ confirmed: slot, mySlot: 'pending', agreed: false })
    expect((await actionOf(anna)).mySlot).toBeNull()

    await respond(eva, { response: 'going' })
    expect((await actionOf(anna)).agreed).toBe(false)
    await respond(jana, { response: 'going' })
    const organizer = await actionOf(anna)
    expect(organizer.agreed).toBe(true)
    expect(organizer.invites.map((invite) => [invite.name, invite.slot])).toEqual([
      ['Eva', 'going'],
      ['Jana', 'going'],
    ])

    // „Nejdu“ termín nezruší, jen přestane být domluvený.
    await respond(jana, { response: 'not-going' })
    expect(await actionOf(anna)).toMatchObject({ confirmed: slot, agreed: false })
  })

  it('lets the organizer adopt another date a participant proposed', async () => {
    const { anna, eva, jana, evaId, actionId, actionOf, respond } = await setup()
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    await respond(jana, { response: 'going' })
    await respond(eva, { response: 'counter', counter: other })
    expect((await actionOf(anna)).invites[0]).toMatchObject({ slot: 'counter', counter: other })

    const adopted = await json<{ action: ActionResource }>(
      await anna.send('POST', `/api/actions/${actionId}/counters/${evaId}/adopt`),
    )
    expect(adopted.action.confirmed).toEqual(other)
    // Eva svůj termín navrhla, takže jde. Jana se k novému termínu vyjádří znovu.
    expect(adopted.action.invites.map((invite) => [invite.name, invite.slot])).toEqual([
      ['Eva', 'going'],
      ['Jana', 'pending'],
    ])
    expect((await actionOf(jana)).mySlot).toBe('pending')
    // Podruhé už návrh neplatí.
    expect(
      (await anna.send('POST', `/api/actions/${actionId}/counters/${evaId}/adopt`)).status,
    ).toBe(404)
  })

  it('refuses a date outside the action and answers from the wrong people', async () => {
    const { app, anna, eva, evaId, actionId, respond } = await setup()
    expect((await respond(eva, { response: 'going' })).status).toBe(400)
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    const outside = { date: '2026-11-27', start: '21:00', end: '23:00' }
    expect((await respond(eva, { response: 'counter', counter: outside })).status).toBe(400)
    expect((await respond(anna, { response: 'going' })).status).toBe(400)

    await respond(eva, { response: 'counter', counter: other })
    const petr = browser(app)
    await petr.login('petr@example.com', 'Petr')
    expect((await respond(petr, { response: 'going' })).status).toBe(404)
    expect(
      (await eva.send('POST', `/api/actions/${actionId}/counters/${evaId}/adopt`)).status,
    ).toBe(403)
  })

  it('forgets the date and the answers when the period changes', async () => {
    const { anna, eva, actionId, actionOf, respond } = await setup()
    await anna.send('PUT', `/api/actions/${actionId}/confirmed`, slot)
    await respond(eva, { response: 'going' })
    await anna.send('PATCH', `/api/actions/${actionId}`, {
      details: { ...details, to: '2026-12-06' },
    })
    const action = await actionOf(eva)
    expect(action).toMatchObject({ confirmed: null, mySlot: null, agreed: false })
    expect(action.invites.every((invite) => invite.slot === 'pending')).toBe(true)
  })
})
