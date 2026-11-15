import { describe, expect, it } from 'vitest'
import { buildCalendar, dayStatus, findUncertainDays } from './calendar'
import { sampleAction } from './fixtures'
import type { PersonSchedule } from './schema'

const schedule: PersonSchedule = {
  coveredFrom: '2026-11-23',
  coveredTo: '2026-11-25',
  shifts: [
    { date: '2026-11-24', start: '22:00', end: '06:00', label: 'N', raw: 'N', uncertain: false },
  ],
  warnings: [],
}

describe('dayStatus', () => {
  it('is unknown when the person has no schedule yet', () => {
    expect(dayStatus(null, '2026-11-24')).toEqual({ kind: 'unknown' })
  })

  it('is unknown outside the range the schedule covers', () => {
    expect(dayStatus(schedule, '2026-11-26')).toEqual({ kind: 'unknown' })
  })

  it('is free inside the covered range when no shift starts that day', () => {
    expect(dayStatus(schedule, '2026-11-23')).toEqual({ kind: 'free' })
  })

  it('lists the shifts that start that day', () => {
    expect(dayStatus(schedule, '2026-11-24')).toEqual({
      kind: 'working',
      shifts: [schedule.shifts[0]],
    })
  })

  it('does not show a night shift on the day it ends', () => {
    expect(dayStatus(schedule, '2026-11-25')).toEqual({ kind: 'free' })
  })
})

describe('buildCalendar', () => {
  const calendar = buildCalendar(sampleAction)

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
      status: { kind: 'unknown' },
      attendance: 'unknown',
    })
  })
})

describe('findUncertainDays', () => {
  it('points at every day that has an uncertain shift', () => {
    expect(findUncertainDays(sampleAction)).toEqual([{ personId: 'petr', date: '2026-11-25' }])
  })
})
