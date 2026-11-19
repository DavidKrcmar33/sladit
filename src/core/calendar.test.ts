import { describe, expect, it } from 'vitest'
import { buildCalendar, dayStatus, findReadingWarnings, findUncertainDays } from './calendar'
import { composePeople } from './compose'
import { sampleAction } from './fixtures'
import type { PersonSchedule } from './schema'

const night = {
  date: '2026-11-24',
  start: '22:00',
  end: '06:00',
  label: 'N',
  raw: 'N',
  uncertain: false,
}

const schedule: PersonSchedule = {
  coverage: [{ from: '2026-11-23', to: '2026-11-25' }],
  shifts: [night],
  warnings: [],
}

const people = composePeople(sampleAction)

describe('dayStatus', () => {
  it('is unknown when the person has no schedule yet', () => {
    expect(dayStatus(null, '2026-11-24')).toEqual({ kind: 'unknown', shifts: [] })
  })

  it('is unknown outside the range the schedule covers', () => {
    expect(dayStatus(schedule, '2026-11-26')).toEqual({ kind: 'unknown', shifts: [] })
  })

  it('is free inside the covered range when no shift starts that day', () => {
    expect(dayStatus(schedule, '2026-11-23')).toEqual({ kind: 'free' })
  })

  it('lists the shifts that start that day', () => {
    expect(dayStatus(schedule, '2026-11-24')).toEqual({ kind: 'working', shifts: [night] })
  })

  it('does not show a night shift on the day it ends', () => {
    expect(dayStatus(schedule, '2026-11-25')).toEqual({ kind: 'free' })
  })

  it('keeps a known shift on a day that is otherwise unknown', () => {
    const partial = { ...schedule, coverage: [{ from: '2026-11-25', to: '2026-11-25' }] }
    expect(dayStatus(partial, '2026-11-24')).toEqual({ kind: 'unknown', shifts: [night] })
  })
})

describe('buildCalendar', () => {
  const calendar = buildCalendar(sampleAction, people)

  function day(personName: string, date: string) {
    const row = calendar.rows.find((candidate) => candidate.personName === personName)
    return row?.days[calendar.dates.indexOf(date)]
  }

  it('has one column per day of the action and one row per person', () => {
    expect(calendar.dates).toHaveLength(7)
    expect(calendar.rows.map((row) => row.personName)).toEqual([
      'Anna',
      'Petr',
      'Jana',
      'Tomáš',
      'Eva',
    ])
    expect(calendar.rows.every((row) => row.days.length === 7)).toBe(true)
  })

  it('marks a morning shift as a day the person can attend', () => {
    expect(day('Eva', '2026-11-27')).toMatchObject({
      status: { kind: 'working' },
      attendance: 'available',
    })
  })

  it('marks an afternoon shift that covers the evening as busy', () => {
    expect(day('Anna', '2026-11-23')?.attendance).toBe('busy')
  })

  it('marks days outside the schedule as unknown', () => {
    expect(day('Anna', '2026-11-29')).toEqual({
      status: { kind: 'unknown', shifts: [] },
      attendance: 'unknown',
      windows: [],
      isPartial: false,
    })
  })

  it('shows the times when a day is only partly free', () => {
    expect(day('Eva', '2026-11-27')).toMatchObject({ isPartial: false })
    expect(day('Petr', '2026-11-24')).toMatchObject({
      attendance: 'available',
      isPartial: true,
      windows: [{ start: '16:00', end: '21:00' }],
    })
  })
})

describe('findUncertainDays', () => {
  it('points at every day that has an uncertain shift', () => {
    expect(findUncertainDays(sampleAction, people)).toEqual([
      { personId: 'petr', date: '2026-11-25' },
    ])
  })

  it('skips uncertain shifts outside the action, such as the evening before', () => {
    const before = { ...night, date: '2026-11-22', uncertain: true }
    const person = { id: 'x', name: 'X', schedule: { ...schedule, shifts: [before] } }
    expect(findUncertainDays(sampleAction, [person])).toEqual([])
  })
})

describe('findReadingWarnings', () => {
  it('lists the warnings of every person who has some', () => {
    expect(findReadingWarnings(people)).toEqual([
      {
        personId: 'petr',
        personName: 'Petr',
        warnings: ['Směna 25. 11. je v podkladu špatně čitelná.'],
      },
    ])
  })

  it('skips people without a schedule or without warnings', () => {
    expect(
      findReadingWarnings([
        { id: 'a', name: 'A', schedule: null },
        { id: 'b', name: 'B', schedule },
      ]),
    ).toEqual([])
  })
})
