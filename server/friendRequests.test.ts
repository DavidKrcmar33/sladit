import { describe, expect, it } from 'vitest'
import type { FriendsResponse, SendFriendRequestResponse } from '@/contract/api'
import { MAX_FRIEND_REQUESTS_PER_DAY } from './db/store'
import { browser, testServer } from './testing'

/**
 * Žádost o přátelství podle e-mailu. Adresát ji uvidí v aplikaci a přijme nebo odmítne.
 * Odesílatel se nedozví, zda e-mail patří k účtu.
 */

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function setup() {
  let clock = new Date('2026-11-20T12:00:00Z')
  const server = await testServer({}, undefined, () => clock)
  const anna = browser(server.app)
  const eva = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  await eva.login('eva@example.com', 'Eva')
  const friendsOf = async (user: typeof anna) =>
    json<FriendsResponse>(await user.get('/api/friends'))
  const send = (user: typeof anna, email: string) =>
    user.send('POST', '/api/friends/requests', { email })
  return {
    ...server,
    anna,
    eva,
    friendsOf,
    send,
    setClock: (date: string) => (clock = new Date(date)),
  }
}

describe('žádost o přátelství podle e-mailu', () => {
  it('shows the request to the addressee, who accepts it', async () => {
    const { anna, eva, friendsOf, send } = await setup()
    const sent = await json<SendFriendRequestResponse>(await send(anna, ' Eva@Example.com '))
    expect(sent.result).toBe('sent')
    expect(sent.outgoing).toMatchObject([{ email: 'eva@example.com' }])

    const { incoming } = await friendsOf(eva)
    expect(incoming).toMatchObject([{ fromName: 'Anna', fromEmail: 'anna@example.com' }])

    const accepted = await json<FriendsResponse>(
      await eva.send('POST', `/api/friends/requests/${incoming[0].id}/accept`),
    )
    expect(accepted.friends.map((friend) => friend.name)).toEqual(['Anna'])
    expect(accepted.incoming).toEqual([])
    expect((await friendsOf(anna)).friends.map((friend) => friend.name)).toEqual(['Eva'])
    expect((await friendsOf(anna)).outgoing).toEqual([])
  })

  it('lets the addressee decline and the sender cancel', async () => {
    const { anna, eva, friendsOf, send } = await setup()
    await send(anna, 'eva@example.com')
    const [request] = (await friendsOf(eva)).incoming
    expect((await eva.send('DELETE', `/api/friends/requests/${request.id}`)).status).toBe(200)
    expect((await friendsOf(anna)).outgoing).toEqual([])
    expect((await friendsOf(anna)).friends).toEqual([])

    await send(anna, 'eva@example.com')
    const [mine] = (await friendsOf(anna)).outgoing
    expect((await anna.send('DELETE', `/api/friends/requests/${mine.id}`)).status).toBe(200)
    expect((await friendsOf(eva)).incoming).toEqual([])
  })

  it('answers the same for an e-mail without an account and shows it after the first login', async () => {
    const { app, anna, friendsOf, send } = await setup()
    const sent = await json<SendFriendRequestResponse>(await send(anna, 'jana@example.com'))
    expect(sent.result).toBe('sent')

    const jana = browser(app)
    await jana.login('jana@example.com', 'Jana')
    expect((await friendsOf(jana)).incoming).toMatchObject([{ fromName: 'Anna' }])
  })

  it('makes friends at once when both asked, and says so when they already are', async () => {
    const { anna, eva, friendsOf, send } = await setup()
    await send(eva, 'anna@example.com')
    const both = await json<SendFriendRequestResponse>(await send(anna, 'eva@example.com'))
    expect(both.result).toBe('accepted')
    expect(both.friends.map((friend) => friend.name)).toEqual(['Eva'])
    expect((await friendsOf(eva)).outgoing).toEqual([])

    const again = await json<SendFriendRequestResponse>(await send(anna, 'eva@example.com'))
    expect(again.result).toBe('friends')
  })

  it('refuses my own e-mail, an invalid one and too many requests a day', async () => {
    const { anna, send } = await setup()
    expect((await send(anna, 'anna@example.com')).status).toBe(400)
    expect((await send(anna, 'neni-email')).status).toBe(400)
    for (let index = 0; index < MAX_FRIEND_REQUESTS_PER_DAY; index++) {
      expect((await send(anna, `kamarad${index}@example.com`)).status).toBe(200)
    }
    expect((await send(anna, 'dalsi@example.com')).status).toBe(429)
  })

  it('does not let anyone else accept or cancel a request', async () => {
    const { app, anna, eva, friendsOf, send } = await setup()
    await send(anna, 'eva@example.com')
    const [request] = (await friendsOf(eva)).incoming
    const jana = browser(app)
    await jana.login('jana@example.com', 'Jana')
    expect((await jana.send('POST', `/api/friends/requests/${request.id}/accept`)).status).toBe(404)
    expect((await jana.send('DELETE', `/api/friends/requests/${request.id}`)).status).toBe(404)
    // Odesílatel svou žádost přijmout nemůže.
    expect((await anna.send('POST', `/api/friends/requests/${request.id}/accept`)).status).toBe(404)
  })

  it('stops showing a request after 30 days', async () => {
    const { anna, eva, friendsOf, send, setClock } = await setup()
    await send(anna, 'eva@example.com')
    setClock('2026-12-20T12:00:01Z')
    // Přihlášení platí taky 30 dní, proto se oba přihlásí znovu.
    await anna.login('anna@example.com', 'Anna')
    await eva.login('eva@example.com', 'Eva')
    expect((await friendsOf(eva)).incoming).toEqual([])
    expect((await friendsOf(anna)).outgoing).toEqual([])
  })
})
