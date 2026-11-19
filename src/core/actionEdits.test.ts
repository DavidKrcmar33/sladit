import { describe, expect, it } from 'vitest'
import {
  addPerson,
  addSource,
  removeDayOverride,
  removePerson,
  removeSource,
  replacePerson,
  setDayOverride,
  setSourceCircle,
  setWeekParity,
} from './actionEdits'
import { composeSchedule } from './compose'
import { sampleAction } from './fixtures'
import { SCHOOL_CIRCLE, type Action, type Person, type Shift, type Source } from './schema'

const emptyAction: Action = { ...sampleAction, people: [] }

const lucie: Person = {
  id: 'lucie',
  name: 'Lucie',
  files: [{ id: 'f9', name: 'rozpis.pdf', kind: 'pdf' }],
  sources: [],
  overrides: [],
}

function shift(date: string, start: string, end: string, label = 'R'): Shift {
  return { date, start, end, label, raw: '', uncertain: false }
}

function personById(action: Action, personId: string): Person {
  const person = action.people.find((candidate) => candidate.id === personId)
  if (!person) throw new Error(`Person ${personId} not found`)
  return person
}

const lucieSource: Source = {
  id: 's1',
  circle: 'Práce',
  files: [{ id: 'f9', name: 'rozpis.pdf', kind: 'pdf' }],
  coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
  shifts: [shift('2026-11-24', '06:00', '14:00')],
  warnings: [],
  parity: { calendar: false, anchors: [] },
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

describe('sources', () => {
  const withLucie = addPerson(emptyAction, lucie)

  it('adds a read source and stops waiting for the files it was read from', () => {
    const updated = addSource(withLucie, 'lucie', lucieSource)
    expect(personById(updated, 'lucie')).toMatchObject({ files: [], sources: [lucieSource] })
  })

  it('keeps older sources when another one is added', () => {
    const december = { ...lucieSource, id: 's2', files: [] }
    const updated = addSource(addSource(withLucie, 'lucie', lucieSource), 'lucie', december)
    expect(personById(updated, 'lucie').sources.map((source) => source.id)).toEqual(['s1', 's2'])
  })

  it('removes a source and keeps the manual edits', () => {
    const edited = setDayOverride(
      addSource(withLucie, 'lucie', lucieSource),
      'lucie',
      '2026-11-25',
      [],
    )
    const updated = removeSource(edited, 'lucie', 's1')
    expect(personById(updated, 'lucie')).toMatchObject({
      sources: [],
      overrides: [{ date: '2026-11-25', shifts: [] }],
    })
  })

  it('changes the circle of a source', () => {
    const updated = setSourceCircle(
      addSource(withLucie, 'lucie', lucieSource),
      'lucie',
      's1',
      ` ${SCHOOL_CIRCLE} `,
    )
    expect(personById(updated, 'lucie').sources[0].circle).toBe(SCHOOL_CIRCLE)
  })

  it('stores the parity answer on the source and replaces an earlier one for the same term', () => {
    let updated = addSource(withLucie, 'lucie', lucieSource)
    updated = setWeekParity(updated, 'lucie', 's1', '2026-11-23', true)
    updated = setWeekParity(updated, 'lucie', 's1', '2026-11-30', true)
    expect(personById(updated, 'lucie').sources[0].parity.anchors).toEqual([
      { date: '2026-11-30', odd: true },
    ])
  })

  it('refuses a source of somebody else', () => {
    expect(() => setSourceCircle(sampleAction, 'anna', 'zdroj-2', 'Škola')).toThrow()
  })
})

describe('setDayOverride', () => {
  it('replaces the shifts of that day and leaves other days alone', () => {
    const updated = setDayOverride(sampleAction, 'petr', '2026-11-25', [
      shift('2026-11-25', '22:00', '06:00', 'N'),
    ])
    const schedule = composeSchedule(personById(updated, 'petr'))!
    expect(schedule.shifts).toEqual([
      expect.objectContaining({ date: '2026-11-24', label: 'N' }),
      expect.objectContaining({ date: '2026-11-25', label: 'N', uncertain: false }),
    ])
  })

  it('makes the day free when given no shifts', () => {
    const updated = setDayOverride(sampleAction, 'anna', '2026-11-23', [])
    const schedule = composeSchedule(personById(updated, 'anna'))!
    expect(schedule.shifts.some((item) => item.date === '2026-11-23')).toBe(false)
  })

  it('covers only that one day, days in between stay unknown', () => {
    // Anna má rozpis do 28. 11. Úprava 1. 12. nesmí udělat z 29. a 30. 11. volno.
    const updated = setDayOverride(sampleAction, 'anna', '2026-12-01', [])
    const schedule = composeSchedule(personById(updated, 'anna'))!
    expect(schedule.coverage).toEqual([
      { from: '2026-11-23', to: '2026-11-28' },
      { from: '2026-12-01', to: '2026-12-01' },
    ])
  })

  it('replaces an earlier edit of the same day', () => {
    let updated = setDayOverride(sampleAction, 'anna', '2026-11-23', [])
    updated = setDayOverride(updated, 'anna', '2026-11-23', [shift('2026-11-23', '08:00', '12:00')])
    expect(personById(updated, 'anna').overrides).toEqual([
      { date: '2026-11-23', shifts: [shift('2026-11-23', '08:00', '12:00')] },
    ])
  })

  it('can be undone, the day follows the documents again', () => {
    const edited = setDayOverride(sampleAction, 'anna', '2026-11-23', [])
    const updated = removeDayOverride(edited, 'anna', '2026-11-23')
    expect(personById(updated, 'anna').overrides).toEqual([])
  })

  it('rejects a shift that starts on a different day', () => {
    expect(() =>
      setDayOverride(sampleAction, 'anna', '2026-11-23', [shift('2026-11-24', '06:00', '14:00')]),
    ).toThrow()
  })

  it('throws when the person is not part of the action', () => {
    expect(() => setDayOverride(sampleAction, 'nobody', '2026-11-23', [])).toThrow()
  })
})
