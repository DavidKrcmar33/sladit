import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from './client/backend'
import { memoryBackend } from './client/memory'
import type { ReadingRequest } from './contract/api'
import { sampleAction } from './core/fixtures'
import type { NewActionInput } from './core/newAction'
import type { SourceContent } from './core/schema'
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './core/storage'
import { createSession, type Session } from './session'

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
  const session = createSession({ backend, generateId: sequentialIds(), storage })
  await session.init()
  return { session, backend }
}

async function addPerson(session: Session, name: string, file = photo(`${name}.jpg`)) {
  session.setDraftName(name)
  session.addFilesToDraft([file])
  return session.saveDraft()
}

describe('přihlášení', () => {
  it('shows the login screen without a user', async () => {
    const session = createSession({ backend: memoryBackend({ user: null }) })
    await session.init()
    expect(session.state.status).toBe('signedOut')
  })

  it('loads the people and actions of the signed-in user', async () => {
    const { session } = await signedInSession()
    expect(session.state).toMatchObject({ status: 'ready', user })
    expect(session.state.people).toEqual([
      { id: expect.any(String), name: 'Anna', isSelf: true, sources: [], overrides: [] },
    ])
    expect(session.selfPersonId.value).toBe(session.state.people[0].id)
  })

  it('logs out and forgets everything in memory', async () => {
    const { session } = await signedInSession()
    await session.createAction(actionInput)
    await session.logout()
    expect(session.state).toMatchObject({
      status: 'signedOut',
      user: null,
      actions: [],
      people: [],
    })
  })

  it('deletes the account', async () => {
    const { session, backend } = await signedInSession()
    await session.createAction(actionInput)
    await session.deleteAccount()
    expect(session.state.status).toBe('signedOut')
    expect(await backend.me()).toMatchObject({ user: null })
  })

  it('goes back to the login screen when the session expires', async () => {
    const { session, backend } = await signedInSession()
    await session.createAction(actionInput)
    await backend.logout()
    await session.updateAction({ ...actionInput, name: 'Jiný' })
    expect(session.state.status).toBe('signedOut')
  })
})

describe('akce', () => {
  it('creates an action with the user taking part and opens the intake step', async () => {
    const { session } = await signedInSession()
    expect(await session.createAction(actionInput)).toBeNull()
    expect(session.selectedAction.value).toMatchObject({
      name: 'Deskovky',
      people: [{ name: 'Anna', files: [], sources: [] }],
    })
    expect(session.currentStep.value).toBe('intake')
  })

  it('returns errors and creates nothing when the input is invalid', async () => {
    const { session } = await signedInSession()
    const errors = await session.createAction({ ...actionInput, name: '' })
    expect(errors).toHaveProperty('name')
    expect(session.state.actions).toHaveLength(0)
  })

  it('opens the sample action in the calendar step, saved in the account', async () => {
    const { session, backend } = await signedInSession()
    await session.openSampleAction()
    expect(session.selectedAction.value?.people.map((person) => person.name)).toEqual([
      'Anna',
      'Anna',
      'Petr',
      'Jana',
      'Tomáš',
      'Eva',
    ])
    expect(session.currentStep.value).toBe('calendar')
    expect(await backend.actions()).toHaveLength(1)
  })

  it('changes the details, keeps the people and can undo it', async () => {
    const { session } = await signedInSession()
    await session.openSampleAction()
    expect(await session.updateAction({ ...actionInput, name: 'Jiný název' })).toBeNull()
    expect(session.selectedAction.value).toMatchObject({ name: 'Jiný název' })
    expect(session.selectedAction.value?.people).toHaveLength(6)

    await session.undoActionUpdate()

    expect(session.selectedAction.value?.name).toBe('Vánoční deskovky')
    expect(session.state.lastActionEdit).toBeNull()
  })

  it('returns errors and changes nothing when the action does not fit its window', async () => {
    const { session } = await signedInSession()
    await session.openSampleAction()
    const errors = await session.updateAction({
      ...actionInput,
      durationMinutes: 300,
      windowStart: '18:00',
      windowEnd: '22:00',
    })
    expect(errors).toEqual({ durationMinutes: 'Akce se do denního okna nevejde' })
    expect(session.selectedAction.value?.durationMinutes).toBe(180)
  })
})

describe('rozpracovaný člověk', () => {
  let session: Session

  beforeEach(async () => {
    session = (await signedInSession()).session
    await session.createAction(actionInput)
  })

  it('adds a guest with files waiting to be read', async () => {
    expect(await addPerson(session, 'Petr')).toBeNull()
    const petr = session.selectedAction.value!.people.find((person) => person.name === 'Petr')!
    expect(petr).toMatchObject({ sources: [], overrides: [] })
    expect(petr.files.map((file) => file.name)).toEqual(['Petr.jpg'])
    expect(session.isDraftDirty.value).toBe(false)
  })

  it('requires a name and a file for a new person, and a name not yet used', async () => {
    session.addFilesToDraft([photo()])
    expect(await session.saveDraft()).toBe('Vyplň jméno.')
    session.discardDraft()
    session.setDraftName('Petr')
    expect(await session.saveDraft()).toBe('Vlož aspoň jeden podklad.')
    session.discardDraft()
    expect(await addPerson(session, ' anna ')).toBe('Tohle jméno už v akci je.')
  })

  it('returns the names of files in an unsupported format and keeps pasted text as a file', () => {
    const rejected = session.addFilesToDraft([photo(), new File(['x'], 'smlouva.docx')])
    expect(rejected).toEqual(['smlouva.docx'])
    session.addTextToDraft('po–st ranní')
    const [, pasted] = session.state.draft.files
    expect(pasted.kind).toBe('text')
    expect(session.fileBlob(pasted.id)).toBeInstanceOf(File)
  })

  it('forgets the files of a discarded draft', () => {
    session.addFilesToDraft([photo()])
    const [file] = session.state.draft.files
    session.discardDraft()
    expect(session.fileBlob(file.id)).toBeUndefined()
  })

  it('renames a person on the server and keeps their sources', async () => {
    await addPerson(session, 'Petr')
    await session.readSchedules()
    const petr = session.selectedAction.value!.people.find((person) => person.name === 'Petr')!
    session.goToStep('intake')
    session.editPerson(petr.id)
    session.setDraftName('Petr N.')
    expect(await session.saveDraft()).toBeNull()
    expect(session.state.people.find((person) => person.id === petr.id)).toMatchObject({
      name: 'Petr N.',
      sources: [{ circle: 'Práce' }],
    })
  })

  it('removes a guest from the action and drops them when they are in no other action', async () => {
    await addPerson(session, 'Petr')
    const petr = session.selectedAction.value!.people.find((person) => person.name === 'Petr')!
    session.editPerson(petr.id)
    await session.removeEditedPerson()
    expect(session.selectedAction.value!.people.map((person) => person.name)).toEqual(['Anna'])
    expect(session.state.people.map((person) => person.name)).toEqual(['Anna'])
  })
})

describe('čtení rozpisů', () => {
  it('prepares the files in the browser, reads them one after another and opens the calendar', async () => {
    let running = 0
    let maxRunning = 0
    const read = vi.fn<Reader>(async () => {
      maxRunning = Math.max(maxRunning, ++running)
      await Promise.resolve()
      running--
      return content
    })
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    await addPerson(session, 'Petr', text('rozpis_Petr.txt'))
    await addPerson(session, 'Jana', text('jana.txt', 'Út O'))

    await session.readSchedules()

    expect(read).toHaveBeenCalledTimes(2)
    expect(maxRunning).toBe(1)
    expect(read.mock.calls[0][0]).toEqual({
      from: '2026-11-23',
      to: '2026-11-29',
      files: [{ id: expect.any(String), name: 'rozpis_Petr.txt', kind: 'text' }],
      parts: [{ part: { text: 'Podklad (text):\nPo R' }, notes: [] }],
    })
    const petr = session.selectedAction.value!.people.find((person) => person.name === 'Petr')!
    expect(petr.files).toEqual([])
    expect(petr.sources[0].files.map((file) => file.name)).toEqual(['rozpis_Petr.txt'])
    expect(session.currentStep.value).toBe('calendar')
    expect(session.state.readProgress).toBeNull()
  })

  it('keeps going when one person fails and still opens the calendar', async () => {
    const read = vi.fn<Reader>(async (request) => {
      if (request.files[0].name === 'Petr.jpg') throw new Error('boom')
      return content
    })
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    await addPerson(session, 'Petr')
    await addPerson(session, 'Jana')

    await session.readSchedules()

    const [, petr, jana] = session.selectedAction.value!.people
    expect(session.state.readingByPersonId[petr.id]).toBe('error')
    expect(session.state.readErrorByPersonId[petr.id]).toBe('boom')
    expect(session.state.readingByPersonId[jana.id]).toBe('done')
    expect(session.currentStep.value).toBe('calendar')
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
    await session.createAction(actionInput)
    for (const name of ['Petr', 'Jana', 'Tomáš', 'Eva']) await addPerson(session, name)

    await session.readSchedules()

    const messages = session.selectedAction
      .value!.people.slice(1)
      .map((person) => session.state.readErrorByPersonId[person.id])
    expect(messages).toEqual([
      'Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.',
      'V podkladu není co číst. V souboru x.xlsx jsou skryté listy.',
      'Došel limit, zkus to za chvíli.',
      'Dnešní limit čtení je vyčerpaný, zkus to zítra.',
    ])
  })

  it('reports progress while reading and does not start a second reading meanwhile', async () => {
    const releases: (() => void)[] = []
    const read = vi.fn<Reader>(
      () => new Promise((resolve) => releases.push(() => resolve(content))),
    )
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    await addPerson(session, 'Petr')
    await addPerson(session, 'Jana')

    const reading = session.readSchedules()
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    expect(session.state.readProgress).toEqual({ done: 0, total: 2 })
    await session.readSchedules()
    expect(read).toHaveBeenCalledTimes(1)

    releases[0]()
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    expect(session.state.readProgress).toEqual({ done: 1, total: 2 })
    releases[1]()
    await reading
  })

  it('retries just one person without leaving the step', async () => {
    let fail = true
    const read = vi.fn<Reader>(async () => {
      if (fail) throw new Error('boom')
      return content
    })
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    await addPerson(session, 'Petr')
    await session.readSchedules()
    session.goToStep('intake')
    fail = false
    read.mockClear()

    const petr = session.selectedAction.value!.people[1]
    await session.retryPerson(petr.id)

    expect(read).toHaveBeenCalledTimes(1)
    expect(session.state.readingByPersonId[petr.id]).toBe('done')
    expect(session.currentStep.value).toBe('intake')
  })

  it('reads only the new file and keeps older sources and day edits', async () => {
    const read = vi.fn<Reader>(async () => content)
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    await addPerson(session, 'Petr')
    await session.readSchedules()
    const petr = session.selectedAction.value!.people[1]
    await session.saveDayShifts(petr.id, '2026-11-25', [])
    session.goToStep('intake')

    session.editPerson(petr.id)
    expect(session.state.draft.files).toEqual([])
    session.addFilesToDraft([photo('prosinec.jpg')])
    await session.saveDraft()
    read.mockClear()
    await session.readSchedules()

    expect(read.mock.calls[0][0].files.map((file) => file.name)).toEqual(['prosinec.jpg'])
    const updated = session.selectedAction.value!.people[1]
    expect(updated.sources).toHaveLength(2)
    expect(updated.overrides).toEqual([{ date: '2026-11-25', shifts: [] }])
  })

  it('asks for the files again when their content is no longer in memory', async () => {
    const read = vi.fn<Reader>(async () => content)
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    await addPerson(session, 'Petr')
    const petr = session.selectedAction.value!.people[1]
    // Soubor čeká na přečtení, ale jeho obsah v paměti není (třeba po obnovení stránky).
    session.state.pendingFiles[petr.id] = [{ id: 'ztraceny', name: 'rozpis.pdf', kind: 'pdf' }]

    await session.readSchedules()

    expect(read).not.toHaveBeenCalled()
    expect(session.state.readErrorByPersonId[petr.id]).toBe('Podklady je potřeba vložit znovu.')
  })

  it('does nothing while the calendar is blocked', async () => {
    const read = vi.fn<Reader>(async () => content)
    const { session } = await signedInSession(read)
    await session.createAction(actionInput)
    session.setDraftName('Petr')
    await session.readSchedules()
    expect(read).not.toHaveBeenCalled()
    expect(session.currentStep.value).toBe('intake')
  })
})

describe('kalendář', () => {
  let session: Session

  beforeEach(async () => {
    session = (await signedInSession()).session
    await session.openSampleAction()
  })

  function idOf(name: string, index = 0) {
    return session.selectedAction.value!.people.filter((person) => person.name === name)[index].id
  }

  it('suggests proposals for the selected action', () => {
    expect(session.proposals.value.map((proposal) => proposal.date)).toEqual([
      '2026-11-27',
      '2026-11-25',
      '2026-11-28',
    ])
  })

  it('saves a day edit, recalculates and lets the day follow the documents again', async () => {
    const tomas = idOf('Tomáš')
    await session.saveDayShifts(tomas, '2026-11-25', [])
    expect(session.proposals.value[0]).toMatchObject({ date: '2026-11-25', missing: [] })
    await session.clearDayOverride(tomas, '2026-11-25')
    expect(session.proposals.value[0].date).toBe('2026-11-27')
  })

  it('changes the circle of a source, answers a parity question and removes a source', async () => {
    const petr = idOf('Petr')
    const sourceId = session.selectedAction.value!.people.find((person) => person.id === petr)!
      .sources[0].id
    await session.changeSourceCircle(petr, sourceId, 'Škola')
    await session.answerWeekParity(petr, sourceId, '2026-11-24', true)
    expect(session.state.people.find((person) => person.id === petr)?.sources[0]).toMatchObject({
      circle: 'Škola',
      parity: { anchors: [{ date: '2026-11-24', odd: true }] },
    })
    await session.removeSource(petr, sourceId)
    expect(session.state.people.find((person) => person.id === petr)?.sources).toEqual([])
  })

  it('shows a server error and keeps the data as it was', async () => {
    await session.saveDayShifts(idOf('Petr'), '2026-11-25', [
      { date: '2026-11-26', start: '06:00', end: '14:00', label: 'R', raw: '', uncertain: false },
    ])
    expect(session.state.error).toBe('Všechny směny musí začínat v upravovaný den.')
  })

  it('names the user without a schedule as the one the best date depends on', () => {
    expect(session.stability.value?.certain).toBe(false)
    expect(session.stability.value?.pivots[0].personId).toBe(session.selfPersonId.value)
  })

  it('goes back to the intake step with the person ready to edit', () => {
    const petr = idOf('Petr')
    expect(session.editPersonInIntake(petr)).toBe(true)
    expect(session.currentStep.value).toBe('intake')
    expect(session.state.draft).toMatchObject({ editingPersonId: petr, name: 'Petr', files: [] })
    expect(session.editPersonInIntake('nobody')).toBe(false)
  })
})

describe('jistý, nebo křehký termín', () => {
  it('puts the uncertain reading the best date depends on first', async () => {
    const { session } = await signedInSession()
    await session.openSampleAction()
    // Bez uživatele samotného: ukázka, jak ji znají testy jádra.
    const self = session.selfPersonId.value!
    await session.editPersonInIntake(self)
    await session.removeEditedPerson()
    const anna = session.selectedAction.value!.people.find((person) => person.name === 'Anna')!
    expect(session.stability.value).toMatchObject({ certain: true })
    expect(session.pivotalUncertainCount.value).toBe(0)

    await session.saveDayShifts(anna.id, '2026-11-27', [
      { date: '2026-11-27', start: '14:00', end: '22:00', label: 'O', raw: '', uncertain: false },
    ])

    const petr = session.selectedAction.value!.people.find((person) => person.name === 'Petr')!
    expect(session.stability.value).toMatchObject({
      certain: false,
      winner: { date: '2026-11-25' },
    })
    expect(session.pivotalUncertainCount.value).toBe(1)
    expect(session.uncertainDays.value[0]).toEqual({ personId: petr.id, date: '2026-11-25' })
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

  it('offers the actions saved in this browser and imports them into the account', async () => {
    const { storage, data } = storageWith({ [STORAGE_KEY]: stored, [LEGACY_STORAGE_KEY]: '{}' })
    const { session, backend } = await signedInSession(async () => content, storage)
    expect(session.state.localActions).toHaveLength(1)

    await session.acceptLocalActions()

    expect(await backend.actions()).toHaveLength(1)
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

describe('ukázka bez přihlášení', () => {
  it('opens the sample action and refuses to read documents', async () => {
    const backend = memoryBackend({ user: { id: 'ukazka', email: '', name: 'Ty' } })
    const session = createSession({ backend, demo: true })
    await session.init()
    expect(session.state.status).toBe('ready')
    expect(session.selectedAction.value?.name).toBe('Vánoční deskovky')
    // Ukázkový uživatel bez rozpisu v akci není, ať návrhy vypadají jako u skutečné party.
    expect(session.selectedAction.value?.people.map((person) => person.name)).toEqual([
      'Anna',
      'Petr',
      'Jana',
      'Tomáš',
      'Eva',
    ])

    session.goToStep('intake')
    session.setDraftName('Host')
    session.addFilesToDraft([photo()])
    await session.saveDraft()
    await session.readSchedules()
    const host = session.selectedAction.value!.people.find((person) => person.name === 'Host')!
    expect(session.state.readErrorByPersonId[host.id]).toMatch(/V ukázce se podklady nečtou/)
  })
})
