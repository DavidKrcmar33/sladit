import { describe, expect, it } from 'vitest'
import { busyToShifts, zonedTime } from './calendarBusy'
import { composeSchedule, CALENDAR_CIRCLE } from './compose'
import { icsForEvent } from './ics'
import type { Source } from './schema'
import { attendanceInSlot } from './scheduler'

function calendarSource(shifts: Source['shifts']): Source {
  return {
    id: 'kalendar',
    circle: CALENDAR_CIRCLE,
    files: [],
    coverage: [],
    shifts,
    warnings: [],
    parity: { calendar: false, anchors: [] },
  }
}

const work: Source = {
  id: 'prace',
  circle: 'Práce',
  files: [],
  coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
  shifts: [
    { date: '2026-11-24', start: '06:00', end: '14:00', label: 'R', raw: 'R', uncertain: false },
  ],
  warnings: [],
  parity: { calendar: false, anchors: [] },
}

describe('obsazenost z kalendáře', () => {
  it('turns busy times into Prague local shifts, in winter and in summer', () => {
    expect(
      busyToShifts([
        { start: '2026-11-25T17:00:00Z', end: '2026-11-25T19:30:00Z' },
        { start: '2026-07-01T16:00:00+02:00', end: '2026-07-01T18:00:00+02:00' },
      ]),
    ).toEqual([
      {
        date: '2026-07-01',
        start: '16:00',
        end: '18:00',
        label: 'Kalendář',
        raw: '',
        uncertain: false,
      },
      {
        date: '2026-11-25',
        start: '18:00',
        end: '20:30',
        label: 'Kalendář',
        raw: '',
        uncertain: false,
      },
    ])
  })

  it('splits an event over midnight, so it does not block the next morning like a night shift', () => {
    const shifts = busyToShifts([{ start: '2026-11-25T21:00:00Z', end: '2026-11-26T01:00:00Z' }])
    expect(shifts.map((shift) => [shift.date, shift.start, shift.end])).toEqual([
      ['2026-11-25', '22:00', '23:59'],
      ['2026-11-26', '00:00', '02:00'],
    ])
    const schedule = composeSchedule({ sources: [work, calendarSource(shifts)], overrides: [] })
    expect(attendanceInSlot(schedule, { date: '2026-11-26', start: '10:00', end: '12:00' })).toBe(
      'available',
    )
  })

  it('covers whole days of a multi-day event', () => {
    const shifts = busyToShifts([{ start: '2026-11-26T23:00:00Z', end: '2026-11-28T23:00:00Z' }])
    expect(shifts.map((shift) => [shift.date, shift.start, shift.end])).toEqual([
      ['2026-11-27', '00:00', '23:59'],
      ['2026-11-28', '00:00', '23:59'],
    ])
  })

  it('only adds “busy”: it neither makes a day known nor needs to cover it', () => {
    const busy = calendarSource(
      busyToShifts([{ start: '2026-11-25T17:00:00Z', end: '2026-11-25T19:00:00Z' }]),
    )
    const schedule = composeSchedule({ sources: [work, busy], overrides: [] })
    expect(schedule?.coverage).toEqual([{ from: '2026-11-23', to: '2026-11-29' }])
    expect(attendanceInSlot(schedule, { date: '2026-11-25', start: '18:00', end: '20:00' })).toBe(
      'busy',
    )
    expect(attendanceInSlot(schedule, { date: '2026-11-27', start: '18:00', end: '20:00' })).toBe(
      'available',
    )

    // Jen kalendář bez podkladu: den zůstává „nevíme“, ale obsazený čas je „nemůže“.
    const onlyCalendar = composeSchedule({ sources: [busy], overrides: [] })
    expect(onlyCalendar?.coverage).toEqual([])
    expect(
      attendanceInSlot(onlyCalendar, { date: '2026-11-25', start: '18:00', end: '20:00' }),
    ).toBe('busy')
    expect(
      attendanceInSlot(onlyCalendar, { date: '2026-11-27', start: '18:00', end: '20:00' }),
    ).toBe('unknown')
  })

  it('still blocks on a day edited by hand', () => {
    const busy = calendarSource(
      busyToShifts([{ start: '2026-11-25T17:00:00Z', end: '2026-11-25T19:00:00Z' }]),
    )
    const schedule = composeSchedule({
      sources: [work, busy],
      overrides: [{ date: '2026-11-25', shifts: [] }],
    })
    expect(attendanceInSlot(schedule, { date: '2026-11-25', start: '18:00', end: '20:00' })).toBe(
      'busy',
    )
  })

  it('finds the instant of a Prague local time across the daylight saving change', () => {
    expect(new Date(zonedTime('2026-03-29', '01:00')).toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    )
    expect(new Date(zonedTime('2026-03-29', '03:00')).toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    )
    expect(new Date(zonedTime('2026-10-25', '12:00')).toISOString()).toBe(
      '2026-10-25T11:00:00.000Z',
    )
  })
})

describe('soubor .ics', () => {
  it('describes one event in Prague time with escaped text and CRLF lines', () => {
    const ics = icsForEvent({
      uid: 'akce-1@sladit',
      title: 'Pivo, kino; a pak domů',
      date: '2026-11-25',
      start: '18:00',
      end: '20:00',
      createdAt: '2026-11-20T10:00:00Z',
    })
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:20261125T180000\r\n')
    expect(ics).toContain('DTEND;TZID=Europe/Prague:20261125T200000\r\n')
    expect(ics).toContain('SUMMARY:Pivo\\, kino\\; a pak domů\r\n')
    expect(ics).toContain('DTSTAMP:20261120T100000Z\r\n')
    expect(ics).toContain('TZID:Europe/Prague\r\n')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('ends an event over midnight on the next day and folds long lines', () => {
    const ics = icsForEvent({
      uid: 'x',
      title: 'Velmi dlouhý název akce, který se do jednoho řádku souboru určitě nevejde vůbec',
      date: '2026-12-31',
      start: '22:00',
      end: '02:00',
      createdAt: '2026-11-20T10:00:00Z',
    })
    expect(ics).toContain('DTEND;TZID=Europe/Prague:20270101T020000')
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(ics).toMatch(/\r\n [^\r]/)
  })
})
