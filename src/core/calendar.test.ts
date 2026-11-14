import { describe, expect, it } from 'vitest'
import { addDays, buildCalendar, dayStatus, eachDay, findUncertainDays } from './calendar'
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

describe('eachDay', () => {
  it('lists every day including both ends', () => {
    expect(eachDay('2026-11-29', '2026-12-02')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ])
  })

  it('returns a single day when the range starts and ends on the same day', () => {
    expect(eachDay('2026-11-23', '2026-11-23')).toEqual(['2026-11-23'])
  })

  it('crosses a daylight saving change without skipping a day', () => {
    expect(eachDay('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})

describe('addDays', () => {
  it('moves across a month and a year', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('moves backwards with a negative number', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

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
  it('has one column per day of the action and one row per person', () => {
    const calendar = buildCalendar(sampleAction)
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
})

describe('findUncertainDays', () => {
  it('points at every day that has an uncertain shift', () => {
    expect(findUncertainDays(sampleAction)).toEqual([{ personId: 'petr', date: '2026-11-25' }])
  })
})
