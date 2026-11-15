import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '@/core/calendar'
import {
  describeCalendarDay,
  formatDateRange,
  formatDayHeader,
  formatDayLong,
  formatDuration,
  formatShiftTime,
  formatTimeWindow,
} from './format'

describe('formatDayHeader', () => {
  it('shows the short weekday and the day of month', () => {
    expect(formatDayHeader('2026-11-23')).toBe('Po 23.')
    expect(formatDayHeader('2026-11-29')).toBe('Ne 29.')
  })
})

describe('formatDayLong', () => {
  it('shows the full weekday and the date', () => {
    expect(formatDayLong('2026-11-27')).toBe('pátek 27. 11.')
  })
})

describe('formatDateRange', () => {
  it('shortens a range within one month', () => {
    expect(formatDateRange('2026-11-23', '2026-11-29')).toBe('23.–29. 11. 2026')
  })

  it('keeps both months when the range crosses a month', () => {
    expect(formatDateRange('2026-11-30', '2026-12-06')).toBe('30. 11. – 6. 12. 2026')
  })

  it('keeps both years when the range crosses a year', () => {
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('28. 12. 2026 – 3. 1. 2027')
  })

  it('shows a single date when the range is one day', () => {
    expect(formatDateRange('2026-11-27', '2026-11-27')).toBe('27. 11. 2026')
  })
})

describe('formatDuration', () => {
  it.each([
    [60, '1 h'],
    [180, '3 h'],
    [90, '1 h 30 min'],
    [30, '30 min'],
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected)
  })
})

describe('formatShiftTime', () => {
  it('drops zero minutes', () => {
    expect(formatShiftTime({ start: '22:00', end: '06:00' })).toBe('22–6')
  })

  it('keeps minutes when they are not zero', () => {
    expect(formatShiftTime({ start: '06:30', end: '14:00' })).toBe('6:30–14')
  })
})

describe('formatTimeWindow', () => {
  it('joins start and end with a dash', () => {
    expect(formatTimeWindow('16:00', '23:00')).toBe('16:00–23:00')
  })
})

describe('describeCalendarDay', () => {
  const nightShift = { date: '2026-11-24', start: '22:00', end: '06:00', label: 'N', raw: 'N' }

  it.each<[CalendarDay, string]>([
    [{ status: { kind: 'free' }, attendance: 'available' }, 'volno, může'],
    [{ status: { kind: 'unknown' }, attendance: 'unknown' }, 'rozpis chybí'],
    [
      {
        status: { kind: 'working', shifts: [{ ...nightShift, uncertain: false }] },
        attendance: 'busy',
      },
      'směna N 22–6, nemůže',
    ],
    [
      {
        status: { kind: 'working', shifts: [{ ...nightShift, uncertain: true }] },
        attendance: 'available',
      },
      'směna N 22–6, nejisté čtení, může',
    ],
  ])('describes %o as %s', (day, expected) => {
    expect(describeCalendarDay(day)).toBe(expected)
  })
})
