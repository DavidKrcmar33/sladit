import { describe, expect, it } from 'vitest'
import { addPerson, removePerson, replacePerson, setShiftsForDay } from './actionEdits'
import { sampleAction } from './fixtures'
import type { Action, Person, Shift } from './schema'

const emptyAction: Action = { ...sampleAction, people: [] }

const lucie: Person = {
  id: 'lucie',
  name: 'Lucie',
  files: [{ id: 'f9', name: 'rozpis.pdf', kind: 'pdf' }],
  schedule: null,
}

function shift(date: string, start: string, end: string, label = 'R'): Shift {
  return { date, start, end, label, raw: '', uncertain: false }
}

function personById(action: Action, personId: string): Person {
  const person = action.people.find((candidate) => candidate.id === personId)
  if (!person) throw new Error(`Person ${personId} not found`)
  return person
}

describe('addPerson / replacePerson / removePerson', () => {
  it('adds a person to the end without changing the original action', () => {
    const updated = addPerson(emptyAction, lucie)
    expect(updated.people).toEqual([lucie])
    expect(emptyAction.people).toEqual([])
  })

  it('replaces the person with the same id and keeps the order', () => {
    const renamed = { ...personById(sampleAction, 'jana'), name: 'Jana K.' }
    const updated = replacePerson(sampleAction, renamed)
    expect(updated.people.map((person) => person.name)).toEqual([
      'Anna',
      'Petr',
      'Jana K.',
      'Tomáš',
      'Eva',
    ])
  })

  it('removes the person with the given id', () => {
    const updated = removePerson(sampleAction, 'petr')
    expect(updated.people.map((person) => person.id)).not.toContain('petr')
    expect(updated.people).toHaveLength(4)
  })
})

describe('setShiftsForDay', () => {
  it('replaces the shifts of that day and leaves other days alone', () => {
    const updated = setShiftsForDay(sampleAction, 'petr', '2026-11-25', [
      shift('2026-11-25', '22:00', '06:00', 'N'),
    ])
    const shifts = personById(updated, 'petr').schedule?.shifts
    expect(shifts).toEqual([
      sampleAction.people[1].schedule?.shifts[0],
      shift('2026-11-25', '22:00', '06:00', 'N'),
    ])
  })

  it('makes the day free when given no shifts', () => {
    const updated = setShiftsForDay(sampleAction, 'anna', '2026-11-23', [])
    const shiftDates = personById(updated, 'anna').schedule?.shifts.map((s) => s.date)
    expect(shiftDates).not.toContain('2026-11-23')
  })

  it('keeps shifts ordered by date and start time', () => {
    const updated = setShiftsForDay(sampleAction, 'jana', '2026-11-24', [
      shift('2026-11-24', '14:00', '18:00'),
      shift('2026-11-24', '06:00', '10:00'),
    ])
    const starts = personById(updated, 'jana').schedule?.shifts.map((s) => `${s.date} ${s.start}`)
    expect(starts).toEqual([
      '2026-11-23 13:00',
      '2026-11-24 06:00',
      '2026-11-24 14:00',
      '2026-11-25 06:00',
      '2026-11-26 13:00',
    ])
  })

  it('extends the covered range when the day was unknown', () => {
    const updated = setShiftsForDay(sampleAction, 'anna', '2026-11-29', [])
    const schedule = personById(updated, 'anna').schedule
    expect(schedule?.coveredFrom).toBe('2026-11-23')
    expect(schedule?.coveredTo).toBe('2026-11-29')
  })

  it('creates a schedule covering just that day for a person without one', () => {
    const withLucie = addPerson(emptyAction, lucie)
    const updated = setShiftsForDay(withLucie, 'lucie', '2026-11-26', [
      shift('2026-11-26', '06:00', '14:00'),
    ])
    expect(personById(updated, 'lucie').schedule).toEqual({
      coveredFrom: '2026-11-26',
      coveredTo: '2026-11-26',
      shifts: [shift('2026-11-26', '06:00', '14:00')],
      warnings: [],
    })
  })

  it('rejects a shift that starts on a different day', () => {
    expect(() =>
      setShiftsForDay(sampleAction, 'anna', '2026-11-23', [shift('2026-11-24', '06:00', '14:00')]),
    ).toThrow()
  })
})
