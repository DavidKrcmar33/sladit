import { describe, expect, it, vi } from 'vitest'
import type { OwnedPerson } from '@/contract/api'
import { sampleAction } from '@/core/fixtures'
import type { SourceContent, SourceFile } from '@/core/schema'
import type { ExtractInput } from '@/llm/extract'
import { serverConfigFromEnv } from './config'
import { browser, readContent, testServer } from './testing'

const details = {
  name: 'Pivo',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 120,
  windowStart: '17:00',
  windowEnd: '22:00',
}

function textReading(
  files: SourceFile[] = [{ id: 'f1', name: 'rozpis_Novakova.txt', kind: 'text' }],
) {
  return {
    from: '2026-11-23',
    to: '2026-11-29',
    files,
    parts: files.map(() => ({ part: { text: 'Podklad (text):\nPo R' }, notes: [] })),
  }
}

async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

describe('přihlášení', () => {
  it('logs in through Google, creates the user with a person of their own and keeps a session', async () => {
    const { app } = await testServer()
    const anna = browser(app)

    const callback = await anna.login('anna@example.com', 'Anna')

    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/')
    expect(callback.headers.getSetCookie().join(' ')).toMatch(
      /sladit_session=.*HttpOnly.*SameSite=Lax/i,
    )
    const me = await json(await anna.get('/api/me'))
    expect(me).toMatchObject({
      user: { email: 'anna@example.com', name: 'Anna' },
      fakeGoogle: true,
    })
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    expect(people).toEqual([
      { id: expect.any(String), name: 'Anna', isSelf: true, sources: [], overrides: [] },
    ])
  })

  it('refuses a callback whose state does not match the one stored in this browser', async () => {
    const { app } = await testServer()
    const victim = browser(app)
    const attacker = browser(app)
    await attacker.request('/api/auth/google')
    const start = await victim.request('/api/auth/google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!

    // Útočník podstrčí svůj kód s cizím stavem: oběť nesmí skončit přihlášená jako on.
    const forged = await attacker.request(
      `/api/auth/fake-google/approve?${new URLSearchParams({ state, email: 'utocnik@example.com', name: 'U' })}`,
    )
    const callback = new URL(forged.headers.get('location')!)
    const response = await attacker.request(`${callback.pathname}${callback.search}`)

    expect(response.headers.get('location')).toBe('/?prihlaseni=chyba')
    expect(await json(await attacker.get('/api/me'))).toMatchObject({ user: null })
  })

  it('uses each login state only once', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    const start = await anna.request('/api/auth/google')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const approve = await anna.request(
      `/api/auth/fake-google/approve?${new URLSearchParams({ state, email: 'a@example.com', name: 'A' })}`,
    )
    const callback = new URL(approve.headers.get('location')!)
    await anna.request(`${callback.pathname}${callback.search}`)
    await anna.send('POST', '/api/auth/logout')

    anna.cookies.set('sladit_oauth_state', state)
    const replay = await anna.request(`${callback.pathname}${callback.search}`)
    expect(replay.headers.get('location')).toBe('/?prihlaseni=chyba')
  })

  it('lets in only the allowed e-mails when a list is set', async () => {
    const { app } = await testServer({ ALLOWED_EMAILS: 'anna@example.com, petr@example.com' })
    const eva = browser(app)
    const response = await eva.login('eva@example.com')
    expect(response.headers.get('location')).toBe('/?prihlaseni=nepovoleno')
    expect(await json(await eva.get('/api/me'))).toMatchObject({ user: null })
  })

  it('logs out and forgets the session on the server', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com')
    const session = anna.cookies.get('sladit_session')!

    await anna.send('POST', '/api/auth/logout')
    anna.cookies.set('sladit_session', session)

    expect(await json(await anna.get('/api/me'))).toMatchObject({ user: null })
  })

  it('answers the health check without a login', async () => {
    const { app } = await testServer()
    expect(await json(await browser(app).get('/api/health'))).toEqual({ ok: true })
  })

  it('needs a login for everything except the session check', async () => {
    const { app } = await testServer()
    const stranger = browser(app)
    expect((await stranger.get('/api/people')).status).toBe(401)
    expect((await stranger.get('/api/actions')).status).toBe(401)
    expect((await stranger.send('POST', '/api/actions', { details })).status).toBe(401)
  })
})

describe('ochrana proti požadavkům z cizí stránky', () => {
  it('refuses changes from another origin or without an origin', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com')
    const body = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ details }),
    }

    expect(
      (await anna.request('/api/actions', { ...body, origin: 'https://zla-stranka.cz' })).status,
    ).toBe(403)
    expect((await anna.request('/api/actions', { ...body, origin: null })).status).toBe(403)
    expect((await anna.request('/api/actions', body)).status).toBe(200)
  })

  it('accepts a same-origin request that only says so in Sec-Fetch-Site', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com')
    const response = await anna.request('/api/actions', {
      method: 'POST',
      origin: null,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ details }),
    })
    expect(response.status).toBe(200)
  })
})

describe('cizí data', () => {
  /** Anna má akci a vlastní rozpis s přečteným podkladem a ruční úpravou dne. */
  async function annaWithData() {
    const server = await testServer()
    const anna = browser(server.app)
    await anna.login('anna@example.com', 'Anna')
    const { action } = await json<{ action: { id: string } }>(
      await anna.send('POST', '/api/actions', { details }),
    )
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    await anna.send('POST', `/api/people/${people[0].id}/readings`, textReading())
    await anna.send('PUT', `/api/people/${people[0].id}/overrides/2026-11-25`, { shifts: [] })
    const { person: own } = await json<{ person: OwnedPerson }>(
      await anna.send('PATCH', `/api/people/${people[0].id}`, { name: 'Anna' }),
    )
    const eva = browser(server.app)
    await eva.login('eva@example.com', 'Eva')
    return { ...server, anna, eva, actionId: action.id, own }
  }

  it('never lists the people or actions of somebody else', async () => {
    const { eva } = await annaWithData()
    const { people } = await json<{ people: OwnedPerson[] }>(await eva.get('/api/people'))
    expect(people.map((person) => person.name)).toEqual(['Eva'])
    expect(await json(await eva.get('/api/actions'))).toEqual({ actions: [] })
  })

  it('refuses to change or read through another user someone’s schedule, its sources and day edits', async () => {
    const { eva, own } = await annaWithData()
    const sourceId = own.sources[0].id
    const attempts = [
      eva.send('PATCH', `/api/people/${own.id}`, { name: 'Hacknuto' }),
      eva.send('POST', `/api/people/${own.id}/readings`, textReading()),
      eva.send('PATCH', `/api/people/${own.id}/sources/${sourceId}`, { circle: 'Škola' }),
      eva.send('DELETE', `/api/people/${own.id}/sources/${sourceId}`),
      eva.send('PUT', `/api/people/${own.id}/overrides/2026-11-26`, { shifts: [] }),
      eva.send('DELETE', `/api/people/${own.id}/overrides/2026-11-25`),
    ]
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(404)
      const body = JSON.stringify(await response.json())
      // Odpověď nesmí prozradit nic z Annina rozpisu.
      expect(body).not.toContain('2026-11-24')
      expect(body).not.toContain('rozpis_Novakova')
    }
  })

  it('refuses to change another user’s action, invite to it or confirm its date', async () => {
    const { eva, actionId } = await annaWithData()
    const attempts = [
      eva.send('PATCH', `/api/actions/${actionId}`, { details }),
      eva.send('DELETE', `/api/actions/${actionId}`),
      eva.send('POST', `/api/actions/${actionId}/invites`, { userIds: ['kdokoli'] }),
      eva.send('DELETE', `/api/actions/${actionId}/invites/kdokoli`),
      eva.send('PUT', `/api/actions/${actionId}/confirmed`, {
        date: '2026-11-24',
        start: '17:00',
        end: '19:00',
      }),
      eva.send('POST', `/api/actions/${actionId}/response`, { accept: true }),
      eva.get(`/api/actions/${actionId}/view`),
    ]
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(404)
  })

  it('keeps Anna’s data unchanged after all of Eva’s attempts', async () => {
    const { anna, eva, own, actionId } = await annaWithData()
    await eva.send('DELETE', `/api/people/${own.id}/sources/${own.sources[0].id}`)
    await eva.send('DELETE', `/api/actions/${actionId}`)
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    expect(people.find((person) => person.id === own.id)).toMatchObject({
      sources: [{ id: own.sources[0].id }],
      overrides: [{ date: '2026-11-25', shifts: [] }],
    })
    expect(await json(await anna.get('/api/actions'))).toMatchObject({
      actions: [{ id: actionId }],
    })
  })
})

describe('čtení podkladů', () => {
  it('reads prepared parts, never sends file names to the model and stores the source', async () => {
    const extract = vi.fn<(input: ExtractInput) => Promise<SourceContent>>(async () => readContent)
    const { app } = await testServer({}, extract)
    const anna = browser(app)
    await anna.login('anna@example.com', 'Anna')
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))

    const response = await anna.send('POST', `/api/people/${people[0].id}/readings`, textReading())

    expect(response.status).toBe(200)
    expect(JSON.stringify(extract.mock.calls[0][0])).not.toContain('rozpis_Novakova')
    expect(extract.mock.calls[0][0]).toMatchObject({ from: '2026-11-23', to: '2026-11-29' })
    const { person } = await json<{ person: OwnedPerson }>(response)
    expect(person.sources).toEqual([
      {
        ...readContent,
        id: expect.any(String),
        files: [{ id: 'f1', name: 'rozpis_Novakova.txt', kind: 'text' }],
      },
    ])
  })

  it('refuses a file that is not what it claims to be, before calling the model', async () => {
    const extract = vi.fn(async () => readContent)
    const { app } = await testServer({}, extract)
    const anna = browser(app)
    await anna.login('anna@example.com')
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    const fakePng = Buffer.from('<script>to není obrázek</script>').toString('base64')
    const exe = Buffer.from('MZ').toString('base64')

    const wrong = await anna.send('POST', `/api/people/${people[0].id}/readings`, {
      ...textReading([{ id: 'f1', name: 'foto.png', kind: 'image' }]),
      parts: [{ part: { inlineData: { mimeType: 'image/png', data: fakePng } }, notes: [] }],
    })
    const unsupported = await anna.send('POST', `/api/people/${people[0].id}/readings`, {
      ...textReading([{ id: 'f1', name: 'program.exe', kind: 'image' }]),
      parts: [
        { part: { inlineData: { mimeType: 'application/x-msdownload', data: exe } }, notes: [] },
      ],
    })

    expect(wrong.status).toBe(400)
    expect(await json(wrong)).toMatchObject({ error: 'Soubor foto.png neodpovídá svému typu.' })
    expect(unsupported.status).toBe(400)
    expect(extract).not.toHaveBeenCalled()
  })

  it('accepts a real PNG', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com')
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]).toString('base64')
    const response = await anna.send('POST', `/api/people/${people[0].id}/readings`, {
      ...textReading([{ id: 'f1', name: 'foto.png', kind: 'image' }]),
      parts: [{ part: { inlineData: { mimeType: 'image/png', data: png } }, notes: [] }],
    })
    expect(response.status).toBe(200)
  })

  it('stops at the daily limit per user and in total', async () => {
    const extract = vi.fn(async () => readContent)
    const { app } = await testServer(
      { READ_LIMIT_PER_USER_PER_DAY: '2', READ_LIMIT_TOTAL_PER_DAY: '3' },
      extract,
    )
    const anna = browser(app)
    const eva = browser(app)
    await anna.login('anna@example.com')
    await eva.login('eva@example.com')
    const self = async (user: ReturnType<typeof browser>) =>
      (await json<{ people: OwnedPerson[] }>(await user.get('/api/people'))).people[0].id
    const annaId = await self(anna)
    const evaId = await self(eva)
    const read = (user: ReturnType<typeof browser>, id: string) =>
      user.send('POST', `/api/people/${id}/readings`, textReading())

    expect((await read(anna, annaId)).status).toBe(200)
    expect((await read(anna, annaId)).status).toBe(200)
    const annaThird = await read(anna, annaId)
    expect(annaThird.status).toBe(429)
    expect(await json(annaThird)).toMatchObject({
      code: 'limit',
      error: expect.stringMatching(/Dnešní limit/),
    })
    expect((await read(eva, evaId)).status).toBe(200)
    const evaSecond = await read(eva, evaId)
    expect(evaSecond.status).toBe(429)
    expect(await json(evaSecond)).toMatchObject({ error: expect.stringMatching(/Aplikace dnes/) })
    expect(extract).toHaveBeenCalledTimes(3)
  })

  it('explains an unreadable source and a busy model', async () => {
    let attempt = 0
    const extract = vi.fn(async (): Promise<SourceContent> => {
      attempt++
      if (attempt === 1) {
        throw Object.assign(new Error('Podklad je nečitelný.'), {
          name: 'UnreadableSourceError',
          notes: ['V souboru rozpis.xlsx jsou skryté listy.'],
        })
      }
      throw new Error('Claude vrátilo 429: rate limit')
    })
    const { app } = await testServer({}, extract)
    const anna = browser(app)
    await anna.login('anna@example.com')
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    const path = `/api/people/${people[0].id}/readings`

    const unreadable = await anna.send('POST', path, textReading())
    const busy = await anna.send('POST', path, textReading())

    expect(unreadable.status).toBe(422)
    expect(await json(unreadable)).toEqual({
      error: 'Podklad je nečitelný.',
      code: 'unreadable',
      notes: ['V souboru rozpis.xlsx jsou skryté listy.'],
    })
    expect(busy.status).toBe(503)
    expect(await json(busy)).toMatchObject({ code: 'busy' })
  })
})

describe('rozpis člověka', () => {
  async function annaWithSource() {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com', 'Anna')
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    const { person } = await json<{ person: OwnedPerson }>(
      await anna.send('POST', `/api/people/${people[0].id}/readings`, textReading()),
    )
    return { anna, person }
  }

  it('changes the circle and stores a parity answer on a source', async () => {
    const { anna, person } = await annaWithSource()
    const response = await anna.send(
      'PATCH',
      `/api/people/${person.id}/sources/${person.sources[0].id}`,
      {
        circle: 'Škola',
        weekParity: { date: '2026-11-24', odd: true },
      },
    )
    const { person: updated } = await json<{ person: OwnedPerson }>(response)
    expect(updated.sources[0]).toMatchObject({
      circle: 'Škola',
      parity: { calendar: false, anchors: [{ date: '2026-11-24', odd: true }] },
    })
  })

  it('keeps a manual day edit when another source is added, and can remove it', async () => {
    const { anna, person } = await annaWithSource()
    await anna.send('PUT', `/api/people/${person.id}/overrides/2026-11-24`, { shifts: [] })
    const { person: afterRead } = await json<{ person: OwnedPerson }>(
      await anna.send('POST', `/api/people/${person.id}/readings`, textReading()),
    )
    expect(afterRead.sources).toHaveLength(2)
    expect(afterRead.overrides).toEqual([{ date: '2026-11-24', shifts: [] }])

    const { person: cleared } = await json<{ person: OwnedPerson }>(
      await anna.send('DELETE', `/api/people/${person.id}/overrides/2026-11-24`),
    )
    expect(cleared.overrides).toEqual([])
  })

  it('refuses a day edit with a shift that starts on another day', async () => {
    const { anna, person } = await annaWithSource()
    const response = await anna.send('PUT', `/api/people/${person.id}/overrides/2026-11-24`, {
      shifts: [{ date: '2026-11-25', start: '06:00', end: '14:00', label: 'R' }],
    })
    expect(response.status).toBe(400)
  })

  it('removes a source', async () => {
    const { anna, person } = await annaWithSource()
    const { person: updated } = await json<{ person: OwnedPerson }>(
      await anna.send('DELETE', `/api/people/${person.id}/sources/${person.sources[0].id}`),
    )
    expect(updated.sources).toEqual([])
  })
})

describe('akce', () => {
  it('creates an action with the organizer taking part, edits it and rejects an action longer than its window', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com', 'Anna')
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    const { action } = await json<{ action: { id: string; participantIds: string[] } }>(
      await anna.send('POST', '/api/actions', { details }),
    )
    expect(action.participantIds).toEqual([people[0].id])

    const edited = await anna.send('PATCH', `/api/actions/${action.id}`, {
      details: { ...details, name: 'Deskovky' },
    })
    expect(await json(edited)).toMatchObject({ action: { details: { name: 'Deskovky' } } })

    const tooLong = await anna.send('PATCH', `/api/actions/${action.id}`, {
      details: { ...details, durationMinutes: 360 },
    })
    expect(tooLong.status).toBe(400)
    expect(await json(tooLong)).toEqual({ error: 'Akce se do denního okna nevejde' })
  })

  it('deletes an action and keeps the organizer’s own schedule', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com', 'Anna')
    const { action } = await json<{ action: { id: string } }>(
      await anna.send('POST', '/api/actions', { details }),
    )
    expect((await anna.send('DELETE', `/api/actions/${action.id}`)).status).toBe(200)
    expect(await json(await anna.get('/api/actions'))).toEqual({ actions: [] })
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    expect(people.map((item) => item.name)).toEqual(['Anna'])
  })
})

describe('převzetí dat z prohlížeče a smazání účtu', () => {
  it('imports only the parameters of local actions, not the people in them', async () => {
    const { app } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com', 'Anna')

    const response = await anna.send('POST', '/api/import', { actions: [sampleAction] })

    expect(await json(response)).toEqual({ imported: 1 })
    const { actions } = await json<{
      actions: { participantIds: string[]; details: { name: string } }[]
    }>(await anna.get('/api/actions'))
    expect(actions[0].details.name).toBe('Vánoční deskovky')
    // Každý si teď nahrává rozpis sám, lidi z uložené akce se nepřevezmou.
    expect(actions[0].participantIds).toHaveLength(1)
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    expect(people.map((person) => person.name)).toEqual(['Anna'])
  })

  it('deletes the account with all its data and ends the session', async () => {
    const { app, db } = await testServer()
    const anna = browser(app)
    await anna.login('anna@example.com', 'Anna')
    await anna.send('POST', '/api/import', { actions: [sampleAction] })

    expect((await anna.send('DELETE', '/api/me')).status).toBe(200)

    expect(await json(await anna.get('/api/me'))).toMatchObject({ user: null })
    for (const table of [
      'users',
      'sessions',
      'people',
      'sources',
      'actions',
      'action_participants',
    ]) {
      expect(await db.query(`select * from ${table}`), table).toEqual([])
    }
  })
})

describe('nastavení serveru', () => {
  it('refuses to start with the fake Google in production', () => {
    expect(() =>
      serverConfigFromEnv({
        NODE_ENV: 'production',
        GOOGLE_FAKE: '1',
        APP_ORIGIN: 'https://sladit.example.com',
        DATABASE_URL: 'postgres://x',
      }),
    ).toThrow(/Falešný Google/)
  })

  it('refuses to start in production without HTTPS or a database', () => {
    expect(() =>
      serverConfigFromEnv({
        NODE_ENV: 'production',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        APP_ORIGIN: 'http://sladit.example.com',
      }),
    ).toThrow(/https.*DATABASE_URL/)
  })

  it('needs Google credentials unless the fake one is switched on', () => {
    expect(() => serverConfigFromEnv({})).toThrow(/GOOGLE_CLIENT_ID/)
    expect(serverConfigFromEnv({ GOOGLE_FAKE: '1' }).google).toEqual({ mode: 'fake' })
  })
})
