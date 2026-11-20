import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '@/core/calendar'
import {
  describeAvailability,
  describeCalendarDay,
  describeStability,
  formatDateRange,
  formatDayHeader,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatFreeWindows,
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
    [
      { status: { kind: 'free' }, attendance: 'available', windows: [], isPartial: false },
      'volno, může',
    ],
    [
      {
        status: { kind: 'unknown', shifts: [] },
        attendance: 'unknown',
        windows: [],
        isPartial: false,
      },
      'rozpis chybí',
    ],
    [
      {
        status: { kind: 'unknown', shifts: [{ ...nightShift, uncertain: false }] },
        attendance: 'busy',
        windows: [],
        isPartial: false,
      },
      'rozpis chybí, směna N 22–6',
    ],
    [
      {
        status: {
          kind: 'unknown',
          shifts: [
            {
              date: '2026-11-26',
              start: '18:00',
              end: '21:00',
              label: 'Kalendář',
              raw: '',
              uncertain: false,
            },
          ],
        },
        attendance: 'busy',
        windows: [],
        isPartial: false,
      },
      'rozpis chybí, v kalendáři 18–21',
    ],
    [
      {
        status: { kind: 'working', shifts: [{ ...nightShift, uncertain: false }] },
        attendance: 'busy',
        windows: [],
        isPartial: false,
      },
      'směna N 22–6, nemůže',
    ],
    [
      {
        status: { kind: 'working', shifts: [{ ...nightShift, uncertain: true }] },
        attendance: 'available',
        windows: [],
        isPartial: false,
      },
      'směna N 22–6, nejisté čtení, může',
    ],
    [
      {
        status: { kind: 'free' },
        attendance: 'available',
        windows: [{ start: '20:00', end: '23:00' }],
        isPartial: true,
      },
      'volno, může jen 20:00–23:00',
    ],
  ])('describes %o as %s', (day, expected) => {
    expect(describeCalendarDay(day)).toBe(expected)
  })
})

describe('describeAvailability', () => {
  const free = { status: { kind: 'free' } } as const

  it('names the times of a partly free day', () => {
    expect(
      describeAvailability({
        ...free,
        attendance: 'available',
        windows: [
          { start: '08:00', end: '11:00' },
          { start: '14:00', end: '23:00' },
        ],
        isPartial: true,
      }),
    ).toBe('Vejde se jen v čase 08:00–11:00, 14:00–23:00.')
  })

  it('says when the person does not fit into the daily window', () => {
    expect(
      describeAvailability({ ...free, attendance: 'busy', windows: [], isPartial: false }),
    ).toBe('V denním okně akce se nevejde.')
  })

  it('has nothing to add for a fully free or unknown day', () => {
    expect(
      describeAvailability({
        ...free,
        attendance: 'available',
        windows: [{ start: '16:00', end: '23:00' }],
        isPartial: false,
      }),
    ).toBeNull()
    expect(
      describeAvailability({ ...free, attendance: 'unknown', windows: [], isPartial: false }),
    ).toBeNull()
  })
})

describe('formatFreeWindows', () => {
  it('shows the first window and counts the others', () => {
    expect(formatFreeWindows([{ start: '20:00', end: '23:00' }])).toBe('20–23')
    expect(
      formatFreeWindows([
        { start: '08:00', end: '11:00' },
        { start: '14:00', end: '23:00' },
      ]),
    ).toBe('8–11 +1')
    expect(formatFreeWindows([])).toBe('')
  })
})

describe('describeStability', () => {
  const names: Record<string, string> = { petr: 'Petr', hana: 'Hana' }
  const nameOf = (id: string) => names[id]
  const winner = {
    date: '2026-11-27',
    start: '16:00',
    end: '19:00',
    available: [],
    missing: [],
    unknown: [],
  }

  it('says a certain date is certain', () => {
    expect(describeStability({ winner, certain: true, pivots: [] }, nameOf)).toBe(
      'Jistý podle přečtených dat.',
    )
  })

  it('names the people, days and reasons a fragile date depends on', () => {
    const text = describeStability(
      {
        winner,
        certain: false,
        pivots: [
          { personId: 'petr', dates: [{ date: '2026-11-26', reason: 'missing' }] },
          {
            personId: 'hana',
            dates: [
              { date: '2026-11-27', reason: 'uncertain' },
              { date: '2026-11-28', reason: 'missing' },
            ],
          },
        ],
      },
      nameOf,
    )
    expect(text).toBe(
      'Může se změnit. Záleží na: Petr (čt 26. 11., chybí rozpis), Hana (pá 27. 11., nejisté čtení; so 28. 11., chybí rozpis).',
    )
  })

  it('formats a short date for a sentence', () => {
    expect(formatDayShort('2026-11-30')).toBe('po 30. 11.')
  })
})
