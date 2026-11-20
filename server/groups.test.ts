import { describe, expect, it } from 'vitest'
import type { ActionResource, Group } from '@/contract/api'
import { browser, testServer } from './testing'

/**
 * Skupina je seznam lidí, které jde pozvat do akce najednou. Vstupuje se do ní odkazem,
 * zve, ruší pozvánky a odebírá jen zakladatel. Kdo ve skupině není, nevidí nic.
 */

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function tokenOf(url: string): string {
  return new URL(url).pathname.split('/').at(-1)!
}

/** Anna založí skupinu a pozve Evu. Jana se přihlásí, ale ve skupině není. */
async function party(now?: () => Date) {
  const server = await testServer({}, undefined, now)
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
  return {
    ...server,
    anna,
    eva,
    jana,
    groupId: group.id,
    token: tokenOf(created.url),
    inviteUrl: created.url,
  }
}

describe('pozvánka do skupiny', () => {
  it('lets the invited user see who invites them and join; members see names, never e-mails', async () => {
    const { anna, eva, token, groupId, inviteUrl } = await party()
    expect(inviteUrl).toMatch(/^http:\/\/localhost:5173\/pozvanka\/[\w-]{20,}$/)

    const preview = await json<{ invite: Record<string, unknown> }>(
      await eva.get(`/api/invites/${token}`),
    )
    expect(preview.invite).toEqual({
      kind: 'group',
      groupId,
      groupName: 'Parta',
      ownerName: 'Anna',
      memberCount: 1,
      isMember: false,
    })

    const accepted = await json<{ kind: string; group: Group }>(
      await eva.send('POST', `/api/invites/${token}/accept`),
    )
    expect(accepted.kind).toBe('group')
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
    expect(JSON.stringify(await json(await eva.get('/api/groups')))).not.toContain(
      'anna@example.com',
    )
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

    const { groups } = await json<{ groups: Group[] }>(await anna.get('/api/groups'))
    await anna.send('DELETE', `/api/groups/${groupId}/invites/${groups[0].invites[0].id}`)
    const revoked = await eva.send('POST', `/api/invites/${token}/accept`)
    expect(revoked.status).toBe(404)
    expect(await json(revoked)).toMatchObject({ code: 'invite' })

    // Pozvánka platí 7 dní.
    const fresh = await json<{ url: string }>(
      await anna.send('POST', `/api/groups/${groupId}/invites`),
    )
    clock = new Date('2026-11-26T12:00:01Z')
    expect((await jana.get(`/api/invites/${tokenOf(fresh.url)}`)).status).toBe(404)
    expect((await jana.send('POST', `/api/invites/${tokenOf(fresh.url)}/accept`)).status).toBe(404)

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

describe('přidání z přátel', () => {
  /** Anna a Eva jsou přátelé přes osobní odkaz. */
  async function befriend(anna: ReturnType<typeof browser>, eva: ReturnType<typeof browser>) {
    const created = await json<{ url: string }>(await anna.send('POST', '/api/friends/invites'))
    await eva.send('POST', `/api/invites/${tokenOf(created.url)}/accept`)
    const { friends } = await json<{ friends: { userId: string }[] }>(
      await anna.get('/api/friends'),
    )
    const { friends: evaFriends } = await json<{ friends: { userId: string }[] }>(
      await eva.get('/api/friends'),
    )
    return { evaId: friends[0].userId, annaId: evaFriends[0].userId }
  }

  it('lets the owner add a friend directly; the friend then sees the group', async () => {
    const { anna, eva, groupId } = await party()
    const { evaId } = await befriend(anna, eva)

    const added = await anna.send('POST', `/api/groups/${groupId}/members`, { userId: evaId })
    expect(added.status).toBe(200)
    expect((await json<{ group: Group }>(added)).group.members.map((m) => m.name)).toEqual([
      'Anna',
      'Eva',
    ])
    // Podruhé se nic nezmění.
    await anna.send('POST', `/api/groups/${groupId}/members`, { userId: evaId })
    const { groups } = await json<{ groups: Group[] }>(await eva.get('/api/groups'))
    expect(groups).toMatchObject([{ name: 'Parta', isOwner: false }])
    expect(groups[0].members).toHaveLength(2)
  })

  it('adds only own friends and only by the owner', async () => {
    const { anna, eva, jana, token, groupId } = await party()
    const { evaId, annaId } = await befriend(anna, eva)

    // Jana není Annina přítelkyně: podle id ji Anna přidat nemůže.
    const janaId = (await json<{ user: { id: string } }>(await jana.get('/api/me'))).user.id
    const stranger = await anna.send('POST', `/api/groups/${groupId}/members`, { userId: janaId })
    expect(stranger.status).toBe(403)
    expect(await json(await jana.get('/api/groups'))).toEqual({ groups: [] })

    // Eva je členkou, ale ne zakladatelkou: přidávat nesmí.
    await eva.send('POST', `/api/invites/${token}/accept`)
    const byMember = await eva.send('POST', `/api/groups/${groupId}/members`, { userId: annaId })
    expect(byMember.status).toBe(403)
    // Kdo ve skupině není, nedozví se ani to, že existuje.
    const outsider = await jana.send('POST', `/api/groups/${groupId}/members`, { userId: evaId })
    expect(outsider.status).toBe(404)
  })
})

describe('skupina a akce', () => {
  it('lets a member invite the others to an action; outsiders cannot be invited', async () => {
    const { anna, eva, jana, token } = await party()
    await eva.send('POST', `/api/invites/${token}/accept`)
    const { groups } = await json<{ groups: Group[] }>(await anna.get('/api/groups'))
    const evaId = groups[0].members.find((member) => member.name === 'Eva')!.userId
    const janaId = (await json<{ user: { id: string } }>(await jana.get('/api/me'))).user.id

    const ok = await anna.send('POST', '/api/actions', { details, inviteUserIds: [evaId] })
    expect(ok.status).toBe(200)
    const outsider = await anna.send('POST', '/api/actions', {
      details,
      inviteUserIds: [janaId],
    })
    expect(outsider.status).toBe(400)
    expect(await json(outsider)).toEqual({
      error: 'Pozvat jde jen přátele a lidi z tvých skupin.',
    })
  })

  it('keeps actions when the group is deleted or somebody leaves; the group was only a list', async () => {
    const { anna, eva, token, groupId } = await party()
    await eva.send('POST', `/api/invites/${token}/accept`)
    const { groups } = await json<{ groups: Group[] }>(await anna.get('/api/groups'))
    const evaId = groups[0].members.find((member) => member.name === 'Eva')!.userId
    const { action } = await json<{ action: ActionResource }>(
      await anna.send('POST', '/api/actions', { details, inviteUserIds: [evaId] }),
    )
    await eva.send('POST', `/api/actions/${action.id}/response`, { accept: true })

    await eva.send('POST', `/api/groups/${groupId}/leave`)
    await anna.send('DELETE', `/api/groups/${groupId}`)

    const { actions } = await json<{ actions: ActionResource[] }>(await eva.get('/api/actions'))
    expect(actions.map((item) => item.id)).toEqual([action.id])
  })
})

describe('konec skupiny a účtu', () => {
  it('hands the group over when the owner deletes the account; the last member deletes it', async () => {
    const { anna, eva, token, groupId } = await party()
    await eva.send('POST', `/api/invites/${token}/accept`)
    await anna.send('DELETE', '/api/me')
    const { groups } = await json<{ groups: Group[] }>(await eva.get('/api/groups'))
    expect(groups).toMatchObject([{ id: groupId, isOwner: true, members: [{ name: 'Eva' }] }])

    await eva.send('POST', `/api/groups/${groupId}/leave`)
    expect(await json(await eva.get('/api/groups'))).toEqual({ groups: [] })
  })
})
