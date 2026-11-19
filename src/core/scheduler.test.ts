import { describe, expect, it } from 'vitest'
import { composePeople } from './compose'
import { sampleAction } from './fixtures'
import {
  attendanceInSlot,
  dayAttendance,
  dayAvailability,
  DEFAULT_SCHEDULING_RULES,
  findProposals,
  type Participant,
} from './scheduler'
import type { ActionParams, PersonSchedule, Shift } from './schema'

function shift(date: string, start: string, end: string): Shift {
  return { date, start, end, label: '', raw: '', uncertain: false }
}

function scheduleWith(shifts: Shift[], from = '2026-11-23', to = '2026-11-29'): PersonSchedule {
  return { coverage: [{ from, to }], shifts, warnings: [] }
}

function person(id: string, schedule: PersonSchedule | null): Participant {
  return { id, schedule }
}

function actionWith(overrides: Partial<ActionParams> = {}): ActionParams {
  return {
    from: '2026-11-23',
    to: '2026-11-29',
    durationMinutes: 180,
    windowStart: '16:00',
    windowEnd: '23:00',
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

  it('knows a person is busy even on a day the schedule does not fully cover', () => {
    // Školní blok je známý, i když rozpis z práce ten den chybí.
    const schedule = scheduleWith([shift('2026-11-24', '17:00', '19:00')], '2026-11-25')
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('busy')
  })

  it('keeps the morning unknown when the evening before is unknown, a night shift may end then', () => {
    const schedule = scheduleWith([], '2026-11-24', '2026-11-24')
    const morning = { date: '2026-11-24', start: '10:00', end: '12:00' }
    const afternoon = { date: '2026-11-24', start: '14:00', end: '16:00' }
    expect(attendanceInSlot(schedule, morning)).toBe('unknown')
    expect(attendanceInSlot(schedule, afternoon)).toBe('available')
  })

  it('blocks the first morning of the period after a night shift from the evening before', () => {
    const schedule = scheduleWith([shift('2026-11-22', '22:00', '06:00')], '2026-11-22')
    const morning = { date: '2026-11-23', start: '08:00', end: '10:00' }
    expect(attendanceInSlot(schedule, morning)).toBe('busy')
  })

  it('keeps a late slot unknown when the next day is unknown, a shift may start after midnight', () => {
    const schedule = scheduleWith([], '2026-11-24', '2026-11-24')
    const late = { date: '2026-11-24', start: '21:00', end: '23:30' }
    const evening = { date: '2026-11-24', start: '20:00', end: '23:00' }
    expect(attendanceInSlot(schedule, late)).toBe('unknown')
    expect(attendanceInSlot(schedule, evening)).toBe('available')
  })

  it('treats the gap between two covered ranges as unknown', () => {
    const schedule: PersonSchedule = {
      coverage: [
        { from: '2026-11-23', to: '2026-11-23' },
        { from: '2026-11-25', to: '2026-11-25' },
      ],
      shifts: [],
      warnings: [],
    }
    expect(attendanceInSlot(schedule, eveningSlot)).toBe('unknown')
  })
})

describe('dayAttendance', () => {
  const action = actionWith()

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
    const proposals = findProposals(sampleAction, composePeople(sampleAction))
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
    const dates = findProposals(sampleAction, composePeople(sampleAction)).map(
      (proposal) => proposal.date,
    )
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('starts the action after everyone has finished work', () => {
    const people = [
      person(
        'a',
        scheduleWith([shift('2026-11-23', '09:00', '19:00')], '2026-11-23', '2026-11-23'),
      ),
      person('b', scheduleWith([], '2026-11-23', '2026-11-23')),
    ]
    expect(findProposals(actionWith({ to: '2026-11-23' }), people)).toEqual([
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
    const people = [
      person('a', scheduleWith([], '2026-11-23', '2026-11-24')),
      person(
        'b',
        scheduleWith([shift('2026-11-23', '12:00', '23:00')], '2026-11-23', '2026-11-23'),
      ),
    ]
    const proposals = findProposals(actionWith({ to: '2026-11-24' }), people)
    expect(proposals.map((proposal) => proposal.date)).toEqual(['2026-11-24', '2026-11-23'])
    expect(proposals[0].unknown).toEqual(['b'])
    expect(proposals[1].missing).toEqual(['b'])
  })

  it('suggests nothing when nobody is known to be free', () => {
    expect(findProposals(actionWith(), [person('a', null), person('b', null)])).toEqual([])
  })

  it('suggests nothing when the action does not fit into the daily window', () => {
    const action = actionWith({ durationMinutes: 480 })
    expect(findProposals(action, [person('a', scheduleWith([]))])).toEqual([])
  })

  it('returns at most the configured number of proposals', () => {
    const proposals = findProposals(actionWith(), [person('a', scheduleWith([]))])
    expect(proposals).toHaveLength(DEFAULT_SCHEDULING_RULES.proposalCount)
  })
})

describe('dayAvailability', () => {
  const action = actionWith()

  it('offers the whole window on a day without shifts', () => {
    expect(dayAvailability(action, scheduleWith([]), '2026-11-24')).toEqual({
      attendance: 'available',
      windows: [{ start: '16:00', end: '23:00' }],
      isPartial: false,
    })
  })

  it('offers only the late evening after lessons that end at 18:50', () => {
    const lessons = scheduleWith([
      shift('2026-11-25', '13:00', '14:50'),
      shift('2026-11-25', '15:00', '16:50'),
      shift('2026-11-25', '17:00', '18:50'),
    ])
    expect(dayAvailability(action, lessons, '2026-11-25')).toEqual({
      attendance: 'available',
      windows: [{ start: '20:00', end: '23:00' }],
      isPartial: true,
    })
  })

  it('lists separate windows when a shift cuts the day in two', () => {
    const wide = actionWith({ durationMinutes: 120, windowStart: '08:00', windowEnd: '23:00' })
    const schedule = scheduleWith([shift('2026-11-24', '12:00', '13:00')])
    expect(dayAvailability(wide, schedule, '2026-11-24')).toEqual({
      attendance: 'available',
      windows: [
        { start: '08:00', end: '11:00' },
        { start: '14:00', end: '23:00' },
      ],
      isPartial: true,
    })
  })

  it('has no windows when the person is busy or the day is unknown', () => {
    const busy = scheduleWith([shift('2026-11-24', '14:00', '22:00')])
    expect(dayAvailability(action, busy, '2026-11-24')).toEqual({
      attendance: 'busy',
      windows: [],
      isPartial: false,
    })
    expect(dayAvailability(action, null, '2026-11-24')).toEqual({
      attendance: 'unknown',
      windows: [],
      isPartial: false,
    })
  })
})
