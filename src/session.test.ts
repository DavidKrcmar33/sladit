import { describe, expect, it, vi } from 'vitest'
import { BackendError } from './client/backend'
import { memoryBackend } from './client/memory'
import type { ReadingRequest } from './contract/api'
import { sampleAction } from './core/fixtures'
import type { NewActionInput } from './core/newAction'
import type { SourceContent } from './core/schema'
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './core/storage'
import { createSession } from './session'

const actionInput: NewActionInput = {
  name: 'Deskovky',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 180,
  windowStart: '16:00',
  windowEnd: '23:00',
}

const user = { id: 'u1', email: 'anna@example.com', name: 'Anna' }

const content: SourceContent = {
  circle: 'Práce',
  coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
  shifts: [
    { date: '2026-11-24', start: '06:00', end: '14:00', label: 'R', raw: 'R', uncertain: false },
  ],
  warnings: [],
  parity: { calendar: false, anchors: [] },
}

function photo(name = 'rozpis.jpg') {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function text(name: string, body = 'Po R') {
  return new File([body], name, { type: 'text/plain' })
}

function sequentialIds(prefix = 'id') {
  let next = 0
  return () => `${prefix}-${++next}`
}

type Reader = (request: ReadingRequest) => Promise<SourceContent>

async function signedInSession(read: Reader = async () => content, storage: Storage | null = null) {
  const backend = memoryBackend({ user, read, generateId: sequentialIds('srv') })
  const session = createSession({
    backend,
    generateId: sequentialIds(),
    storage,
    today: () => '2026-11-19',
  })
  await session.init()
  return { session, backend }
}

describe('přihlášení', () => {
  it('shows the login screen without a user', async () => {
    const session = createSession({ backend: memoryBackend({ user: null }) })
    await session.init()
    expect(session.state.status).toBe('signedOut')
  })

  it('loads my schedule and starts on it while it is empty', async () => {
    const { session } = await signedInSession()
    expect(session.state.status).toBe('ready')
    expect(session.me.value).toMatchObject({ name: 'Anna', isSelf: true, sources: [] })
    expect(session.state.page).toBe('schedule')
  })

  it('logs out and forgets everything in memory', async () => {
    const { session } = await signedInSession()
    session.addFiles([photo()])
    await session.logout()
    expect(session.state).toMatchObject({ status: 'signedOut', people: [], pendingFiles: [] })
  })

  it('deletes the account', async () => {
    const { session, backend } = await signedInSession()
    await session.deleteAccount()
    expect(session.state.status).toBe('signedOut')
    expect((await backend.me()).user).toBeNull()
  })

  it('goes back to the login screen when the session expires', async () => {
    const { session, backend } = await signedInSession()
    await backend.logout()
    await session.createAction(actionInput)
    expect(session.state.status).toBe('signedOut')
  })
})

describe('můj rozvrh', () => {
  it('prepares the files in the browser and reads them into my schedule', async () => {
    const read = vi.fn<Reader>(async () => content)
    const { session } = await signedInSession(read)
    session.addFiles([text('rozpis_Anna.txt')])

    await session.readSchedule()

    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0][0]).toEqual({
      // Podklady se čtou za 12 týdnů od pondělí tohoto týdne, nezávisle na akcích.
      from: '2026-11-16',
      to: '2027-02-07',
      files: [{ id: expect.any(String), name: 'rozpis_Anna.txt', kind: 'text' }],
      parts: [{ part: { text: 'Podklad (text):\nPo R' }, notes: [] }],
    })
    expect(session.me.value?.sources[0].files.map((file) => file.name)).toEqual(['rozpis_Anna.txt'])
    expect(session.state.pendingFiles).toEqual([])
    expect(session.state.reading).toBe(false)
  })

  it('explains an unreadable source, a busy model and a daily limit', async () => {
    const errors = [
      new BackendError('Podklad je nečitelný.', 422, 'unreadable', []),
      new BackendError('Podklad je nečitelný.', 422, 'unreadable', [
        'V souboru x.xlsx jsou skryté listy.',
      ]),
      new BackendError('Došel limit modelu.', 503, 'busy'),
      new BackendError('Dnešní limit čtení je vyčerpaný, zkus to zítra.', 429, 'limit'),
    ]
    const read = vi.fn<Reader>(async () => {
      throw errors.shift()
    })
    const { session } = await signedInSession(read)
    const messages: (string | null)[] = []
    for (let i = 0; i < 4; i++) {
      session.addFiles([photo()])
      await session.readSchedule()
      messages.push(session.state.readError)
      session.state.pendingFiles = []
    }
    expect(messages).toEqual([
      'Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.',
      'V podkladu není co číst. V souboru x.xlsx jsou skryté listy.',
      'Došel limit, zkus to za chvíli.',
      'Dnešní limit čtení je vyčerpaný, zkus to zítra.',
    ])
  })

  it('does not start a second reading while one is running', async () => {
    const releases: (() => void)[] = []
    const read = vi.fn<Reader>(
      () => new Promise((resolve) => releases.push(() => resolve(content))),
    )
    const { session } = await signedInSession(read)
    session.addFiles([photo()])
    const reading = session.readSchedule()
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    expect(session.state.reading).toBe(true)
    await session.readSchedule()
    expect(read).toHaveBeenCalledTimes(1)
    releases[0]()
    await reading
  })

  it('reads only the new file and keeps older sources and day edits', async () => {
    const read = vi.fn<Reader>(async () => content)
    const { session } = await signedInSession(read)
    session.addFiles([photo('listopad.jpg')])
    await session.readSchedule()
    await session.saveDayShifts('2026-11-25', [])

    session.addFiles([photo('prosinec.jpg')])
    await session.readSchedule()

    expect(read.mock.calls[1][0].files.map((file) => file.name)).toEqual(['prosinec.jpg'])
    expect(session.me.value?.sources).toHaveLength(2)
    expect(session.me.value?.overrides).toEqual([{ date: '2026-11-25', shifts: [] }])
  })

  it('asks for the files again when their content is no longer in memory', async () => {
    const read = vi.fn<Reader>(async () => content)
    const { session } = await signedInSession(read)
    // Soubor čeká na přečtení, ale jeho obsah v paměti není (třeba po obnovení stránky).
    session.state.pendingFiles = [{ id: 'ztraceny', name: 'rozpis.pdf', kind: 'pdf' }]
    await session.readSchedule()
    expect(read).not.toHaveBeenCalled()
    expect(session.state.readError).toBe('Podklady je potřeba vložit znovu.')
  })

  it('returns the names of files in an unsupported format and keeps pasted text as a file', () => {
    return signedInSession().then(({ session }) => {
      expect(session.addFiles([new File(['x'], 'tabulka.numbers')])).toEqual(['tabulka.numbers'])
      session.addText('Po R')
      expect(session.state.pendingFiles).toEqual([
        { id: expect.any(String), name: 'Vložený text.txt', kind: 'text' },
      ])
      session.removePendingFile(session.state.pendingFiles[0].id)
      expect(session.state.pendingFiles).toEqual([])
    })
  })

  it('edits a day, changes the circle, answers a parity question and removes a source', async () => {
    const { session } = await signedInSession()
    session.addFiles([photo()])
    await session.readSchedule()
    const sourceId = session.me.value!.sources[0].id

    await session.saveDayShifts('2026-11-25', [])
    expect(session.me.value?.overrides).toEqual([{ date: '2026-11-25', shifts: [] }])
    await session.clearDayOverride('2026-11-25')
    expect(session.me.value?.overrides).toEqual([])

    await session.changeSourceCircle(sourceId, 'Škola')
    await session.answerWeekParity(sourceId, '2026-11-24', true)
    expect(session.me.value?.sources[0]).toMatchObject({
      circle: 'Škola',
      parity: { anchors: [{ date: '2026-11-24', odd: true }] },
    })
    await session.removeSource(sourceId)
    expect(session.me.value?.sources).toEqual([])
  })

  it('shows four weeks from this Monday and moves by weeks', async () => {
    const { session } = await signedInSession()
    expect(session.scheduleCalendar.value?.dates[0]).toBe('2026-11-16')
    expect(session.scheduleCalendar.value?.dates).toHaveLength(28)
    session.shiftSchedule(1)
    expect(session.scheduleCalendar.value?.dates[0]).toBe('2026-11-23')
  })

  it('renames me and refuses an empty name', async () => {
    const { session } = await signedInSession()
    expect(await session.renameMe('Anička')).toBeNull()
    expect(session.me.value?.name).toBe('Anička')
    expect(await session.renameMe('  ')).toBe('Jméno nesmí být prázdné.')
  })

  it('shows a server error and keeps the data as it was', async () => {
    const { session } = await signedInSession()
    await session.saveDayShifts('2026-11-25', [
      { date: '2026-11-26', start: '06:00', end: '14:00', label: 'R', raw: '', uncertain: false },
    ])
    expect(session.state.error).toBe('Všechny směny musí začínat v upravovaný den.')
    expect(session.me.value?.overrides).toEqual([])
  })
})

describe('akce', () => {
  it('creates an action with me taking part and opens it', async () => {
    const { session } = await signedInSession()
    expect(await session.createAction(actionInput)).toBeNull()
    expect(session.state.page).toBe('action')
    expect(session.selectedResource.value).toMatchObject({
      isOrganizer: true,
      myStatus: 'organizer',
      participantIds: [session.me.value!.id],
    })
    expect(session.participants.value.map((person) => person.name)).toEqual(['Anna'])
  })

  it('returns errors and creates nothing when the input is invalid', async () => {
    const { session } = await signedInSession()
    const errors = await session.createAction({ ...actionInput, name: '' })
    expect(errors).toMatchObject({ name: expect.any(String) })
    expect(session.state.actions).toEqual([])
  })

  it('changes the details and can undo it', async () => {
    const { session } = await signedInSession()
    await session.createAction(actionInput)
    await session.updateAction({ ...actionInput, name: 'Kino' })
    expect(session.selectedAction.value?.name).toBe('Kino')
    await session.undoActionUpdate()
    expect(session.selectedAction.value?.name).toBe('Deskovky')
  })

  it('confirms a slot, drops it when the period changes, and deletes the action', async () => {
    const { session } = await signedInSession()
    await session.createAction(actionInput)
    const slot = { date: '2026-11-25', start: '18:00', end: '21:00' }
    await session.confirmSlot(slot)
    expect(session.selectedResource.value?.confirmed).toEqual(slot)
    await session.updateAction({ ...actionInput, to: '2026-11-30' })
    expect(session.selectedResource.value?.confirmed).toBeNull()

    await session.deleteAction()
    expect(session.state.actions).toEqual([])
    expect(session.state.page).toBe('schedule')
  })

  it('computes proposals in the browser while I am alone in the action', async () => {
    const { session } = await signedInSession()
    session.addFiles([photo()])
    await session.readSchedule()
    await session.createAction(actionInput)
    expect(session.usesServerView.value).toBe(false)
    expect(session.proposals.value.map((proposal) => proposal.date)).toContain('2026-11-23')
  })
})

describe('ukázka bez přihlášení', () => {
  async function demo() {
    const backend = memoryBackend({
      user: { id: 'ukazka', email: '', name: 'Ty' },
      sample: sampleAction,
    })
    const session = createSession({ backend, demo: true, today: () => '2026-11-19' })
    await session.init()
    return session
  }

  it('opens the sample action with the others shown only as three states', async () => {
    const session = await demo()
    expect(session.state.page).toBe('action')
    expect(session.selectedAction.value?.name).toBe('Vánoční deskovky')
    await session.refreshView()
    const rows = session.calendar.value!.rows
    expect(rows.map((row) => [row.personName, row.isPrivate ?? false])).toEqual([
      ['Ty', false],
      ['Petr', true],
      ['Jana', true],
      ['Tomáš', true],
      ['Eva', true],
    ])
    expect(rows[1].days.every((day) => day.status.kind === 'private')).toBe(true)
    expect(session.proposals.value.length).toBeGreaterThan(0)
  })

  it('lists the sample friends and refuses to read documents', async () => {
    const session = await demo()
    expect(session.contacts.value.map((contact) => contact.name)).toEqual([
      'Eva',
      'Jana',
      'Petr',
      'Tomáš',
    ])
    session.addFiles([photo()])
    await session.readSchedule()
    expect(session.state.readError).toMatch(/V ukázce se podklady nečtou/)
  })
})

describe('převzetí dat z prohlížeče', () => {
  function storageWith(entries: Record<string, string>) {
    const data = new Map(Object.entries(entries))
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      removeItem: (key: string) => void data.delete(key),
    } as unknown as Storage
    return { storage, data }
  }

  const stored = JSON.stringify({
    actions: [sampleAction],
    selectedActionId: sampleAction.id,
    stepByActionId: {},
  })

  it('offers the actions saved in this browser and imports their parameters', async () => {
    const { storage, data } = storageWith({ [STORAGE_KEY]: stored, [LEGACY_STORAGE_KEY]: '{}' })
    const { session, backend } = await signedInSession(async () => content, storage)
    expect(session.state.localActions).toHaveLength(1)

    await session.acceptLocalActions()

    const actions = await backend.actions()
    expect(actions.map((action) => action.details.name)).toEqual(['Vánoční deskovky'])
    expect(actions[0].participantIds).toHaveLength(1)
    expect(session.state.localActions).toEqual([])
    expect(data.size).toBe(0)
  })

  it('hides the offer for now and leaves the data in the browser', async () => {
    const { storage, data } = storageWith({ [STORAGE_KEY]: stored })
    const { session } = await signedInSession(async () => content, storage)
    session.dismissLocalActions()
    expect(session.state.localActions).toEqual([])
    expect(data.has(STORAGE_KEY)).toBe(true)
  })
})
