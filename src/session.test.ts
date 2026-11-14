import { beforeEach, describe, expect, it } from 'vitest'
import { createSession } from './session'
import type { NewActionInput } from './core/newAction'

const actionInput: NewActionInput = {
  name: 'Deskovky',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 180,
  windowStart: '16:00',
  windowEnd: '23:00',
}

function photo(name = 'rozpis.jpg') {
  return new File(['x'], name, { type: 'image/jpeg' })
}

function sequentialIds() {
  let next = 0
  return () => `id-${++next}`
}

let session: ReturnType<typeof createSession>

beforeEach(() => {
  session = createSession(sequentialIds())
})

function addPerson(name: string) {
  session.setDraftName(name)
  session.addFilesToDraft([photo()])
  return session.saveDraft()
}

describe('actions', () => {
  it('selects a newly created action and starts at the intake step', () => {
    expect(session.createAction(actionInput)).toBeNull()
    expect(session.selectedAction.value?.name).toBe('Deskovky')
    expect(session.currentStep.value).toBe('intake')
  })

  it('returns errors and creates nothing when the input is invalid', () => {
    const errors = session.createAction({ ...actionInput, name: '' })
    expect(errors).toHaveProperty('name')
    expect(session.state.actions).toHaveLength(0)
  })

  it('opens the sample action in the calendar step', () => {
    session.openSampleAction()
    expect(session.selectedAction.value?.people).toHaveLength(5)
    expect(session.currentStep.value).toBe('calendar')
  })
})

describe('person draft', () => {
  beforeEach(() => {
    session.createAction(actionInput)
  })

  it('adds a person with their files and no schedule yet', () => {
    expect(addPerson('Anna')).toBeNull()
    const [anna] = session.selectedAction.value!.people
    expect(anna).toMatchObject({ name: 'Anna', schedule: null })
    expect(anna.files).toHaveLength(1)
    expect(session.isDraftDirty.value).toBe(false)
  })

  it('requires a name', () => {
    session.addFilesToDraft([photo()])
    expect(session.saveDraft()).toBe('Vyplň jméno.')
  })

  it('requires at least one file', () => {
    session.setDraftName('Anna')
    expect(session.saveDraft()).toBe('Vlož aspoň jeden podklad.')
  })

  it('rejects a name that is already used in the action', () => {
    addPerson('Anna')
    expect(addPerson(' anna ')).toBe('Tohle jméno už v akci je.')
  })

  it('returns the names of files in an unsupported format', () => {
    const rejected = session.addFilesToDraft([photo(), new File(['x'], 'smlouva.docx')])
    expect(rejected).toEqual(['smlouva.docx'])
    expect(session.state.draft.files).toHaveLength(1)
  })

  it('stores pasted text as a text file', () => {
    session.addTextToDraft('po–st ranní')
    const [file] = session.state.draft.files
    expect(file.kind).toBe('text')
    expect(session.fileBlob(file.id)).toBeInstanceOf(File)
  })

  it('forgets the files of a discarded draft', () => {
    session.addFilesToDraft([photo()])
    const [file] = session.state.draft.files
    session.discardDraft()
    expect(session.fileBlob(file.id)).toBeUndefined()
  })

  it('keeps the id and schedule when an existing person is edited', () => {
    session.openSampleAction()
    session.editPerson('anna')
    session.setDraftName('Anička')
    expect(session.saveDraft()).toBeNull()
    const anna = session.selectedAction.value!.people.find((person) => person.id === 'anna')
    expect(anna?.name).toBe('Anička')
    expect(anna?.schedule).not.toBeNull()
  })

  it('removes the person being edited', () => {
    session.openSampleAction()
    session.editPerson('petr')
    session.removeEditedPerson()
    expect(session.selectedAction.value!.people.map((person) => person.id)).not.toContain('petr')
    expect(session.isDraftDirty.value).toBe(false)
  })
})

describe('calendar step', () => {
  beforeEach(() => {
    session.createAction(actionInput)
  })

  it('is blocked until there are at least two people', () => {
    addPerson('Anna')
    expect(session.calendarBlocker.value).toBe('Přidej aspoň dva lidi.')
    addPerson('Petr')
    expect(session.calendarBlocker.value).toBeNull()
  })

  it('is blocked while a person is being added', () => {
    addPerson('Anna')
    addPerson('Petr')
    session.setDraftName('Jana')
    expect(session.calendarBlocker.value).toBe('Nejdřív dokonči rozpracovaného člověka.')
    expect(session.goToStep('calendar')).toBe(false)
    expect(session.currentStep.value).toBe('intake')
  })

  it('moves to the calendar when nothing blocks it', () => {
    addPerson('Anna')
    addPerson('Petr')
    expect(session.goToStep('calendar')).toBe(true)
    expect(session.currentStep.value).toBe('calendar')
  })

  it('saves edited shifts of a day', () => {
    session.openSampleAction()
    session.saveDayShifts('petr', '2026-11-25', [])
    const petr = session.selectedAction.value!.people.find((person) => person.id === 'petr')
    expect(petr?.schedule?.shifts.map((shift) => shift.date)).toEqual(['2026-11-24'])
  })
})
