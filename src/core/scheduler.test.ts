import { describe, expect, it } from 'vitest'
import { sampleAction } from './fixtures'
import {
  attendanceInSlot,
  dayAttendance,
  DEFAULT_SCHEDULING_RULES,
  findProposals,
} from './scheduler'
import type { Action, Person, PersonSchedule, Shift } from './schema'

function shift(date: string, start: string, end: string): Shift {
  return { date, start, end, label: '', raw: '', uncertain: false }
}

function scheduleWith(
  shifts: Shift[],
  coveredFrom = '2026-11-23',
  coveredTo = '2026-11-29',
): PersonSchedule {
  return { coveredFrom, coveredTo, shifts, warnings: [] }
}

function person(id: string, schedule: PersonSchedule | null): Person {
  return { id, name: id, files: [], schedule }
}

function actionWith(people: Person[], overrides: Partial<Action> = {}): Action {
  return {
    id: 'a',
    name: 'Test',
    from: '2026-11-23',
    to: '2026-11-29',
    durationMinutes: 180,
    windowStart: '16:00',
    windowEnd: '23:00',
    people,
    ...overrides,
  }
}

const eveningSlot = { date: '2026-11-24', start: '18:00', end: '21:00' }

describe('attendanceInSlot', () => {
  it('is unknown when the person has no schedule', () => {
    expect(attendanceInSlot(null, eveningSlot)).toBe('unknown')
  })

  it('is unknown on a day the schedule does not cover', () => {
    const schedule = scheduleWith([], '2026-11-25', '2026-11-29')
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('unknown')
  })

  it('is available on a free day', () => {
    expect(attendanceInSlot(scheduleWith([]), eveningSlot)).toBe('available')
  })

  it('is busy when the slot overlaps a shift', () => {
    const schedule = scheduleWith([shift('2026-11-24', '14:00', '22:00')])
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('busy')
  })

  it('is available when the shift ends exactly one buffer before the slot', () => {
    const schedule = scheduleWith([shift('2026-11-24', '09:00', '17:00')])
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('available')
  })

  it('is busy when the shift ends less than one buffer before the slot', () => {
    const schedule = scheduleWith([shift('2026-11-24', '09:30', '17:30')])
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('busy')
  })

  it('is busy when a shift starts less than one buffer after the slot', () => {
    const schedule = scheduleWith([shift('2026-11-24', '21:30', '05:30')])
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('busy')
  })

  it('is available before a night shift that leaves enough time', () => {
    const schedule = scheduleWith([shift('2026-11-24', '22:00', '06:00')])
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('available')
  })

  it('keeps the person asleep after a night shift until the configured time', () => {
    const schedule = scheduleWith([shift('2026-11-23', '22:00', '06:00')])
    const beforeWakeUp = { date: '2026-11-24', start: '13:00', end: '16:00' }
    const afterWakeUp = { date: '2026-11-24', start: '14:00', end: '17:00' }
    expect(attendanceInSlot(schedule, beforeWakeUp)).toBe('busy')
    expect(attendanceInSlot(schedule, afterWakeUp)).toBe('available')
  })

  it('follows custom rules', () => {
    const schedule = scheduleWith([shift('2026-11-24', '09:00', '18:00')])
    const rules = { ...DEFAULT_SCHEDULING_RULES, shiftBufferMinutes: 0 }
    expect(attendanceInSlot(schedule, eveningSlot, rules)).toBe('available')
  })
})

describe('dayAttendance', () => {
  const action = actionWith([])

  it('is available when a morning shift leaves the evening free', () => {
    const schedule = scheduleWith([shift('2026-11-24', '06:00', '14:00')])
    expect(dayAttendance(action, schedule, '2026-11-24')).toBe('available')
  })

  it('is busy when a shift leaves no room for the whole action', () => {
    const schedule = scheduleWith([shift('2026-11-24', '14:00', '22:00')])
    expect(dayAttendance(action, schedule, '2026-11-24')).toBe('busy')
  })

  it('is unknown on a day the schedule does not cover', () => {
    expect(dayAttendance(action, scheduleWith([], '2026-11-25'), '2026-11-24')).toBe('unknown')
  })
})

describe('findProposals', () => {
  it('suggests Friday, Wednesday and Saturday for the sample action', () => {
    const proposals = findProposals(sampleAction)
    expect(proposals.map((proposal) => proposal.date)).toEqual([
      '2026-11-27',
      '2026-11-25',
      '2026-11-28',
    ])
    expect(proposals[0]).toEqual({
      date: '2026-11-27',
      start: '16:00',
      end: '19:00',
      available: ['anna', 'petr', 'jana', 'tomas', 'eva'],
      missing: [],
      unknown: [],
    })
    expect(proposals[1].missing).toEqual(['tomas'])
  })

  it('suggests each day at most once', () => {
    const dates = findProposals(sampleAction).map((proposal) => proposal.date)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('starts the action after everyone has finished work', () => {
    const action = actionWith(
      [
        person(
          'a',
          scheduleWith([shift('2026-11-23', '09:00', '19:00')], '2026-11-23', '2026-11-23'),
        ),
        person('b', scheduleWith([], '2026-11-23', '2026-11-23')),
      ],
      { to: '2026-11-23' },
    )
    expect(findProposals(action)).toEqual([
      {
        date: '2026-11-23',
        start: '20:00',
        end: '23:00',
        available: ['a', 'b'],
        missing: [],
        unknown: [],
      },
    ])
  })

  it('prefers a day where someone is unknown over a day where someone is busy', () => {
    const action = actionWith(
      [
        person('a', scheduleWith([], '2026-11-23', '2026-11-24')),
        person(
          'b',
          scheduleWith([shift('2026-11-23', '12:00', '23:00')], '2026-11-23', '2026-11-23'),
        ),
      ],
      { to: '2026-11-24' },
    )
    const proposals = findProposals(action)
    expect(proposals.map((proposal) => proposal.date)).toEqual(['2026-11-24', '2026-11-23'])
    expect(proposals[0].unknown).toEqual(['b'])
    expect(proposals[1].missing).toEqual(['b'])
  })

  it('suggests nothing when nobody is known to be free', () => {
    expect(findProposals(actionWith([person('a', null), person('b', null)]))).toEqual([])
  })

  it('suggests nothing when the action does not fit into the daily window', () => {
    const action = actionWith([person('a', scheduleWith([]))], { durationMinutes: 480 })
    expect(findProposals(action)).toEqual([])
  })

  it('returns at most the configured number of proposals', () => {
    const action = actionWith([person('a', scheduleWith([]))])
    expect(findProposals(action)).toHaveLength(DEFAULT_SCHEDULING_RULES.proposalCount)
  })
})
