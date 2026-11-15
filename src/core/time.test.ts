import { describe, expect, it } from 'vitest'
import { absoluteMinutes, addDays, eachDay, formatMinutes, toMinutes } from './time'

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

describe('toMinutes / formatMinutes', () => {
  it('converts a time of day to minutes after midnight', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('18:30')).toBe(1110)
  })

  it('formats minutes after midnight as a time of day', () => {
    expect(formatMinutes(1110)).toBe('18:30')
    expect(formatMinutes(360)).toBe('06:00')
  })
})

describe('absoluteMinutes', () => {
  it('counts the next day as 24 hours later', () => {
    const today = absoluteMinutes('2026-11-24', '22:00')
    const tomorrow = absoluteMinutes('2026-11-25', '06:00')
    expect(tomorrow - today).toBe(8 * 60)
  })

  it('crosses a month boundary', () => {
    const lastDay = absoluteMinutes('2026-11-30', '23:00')
    const firstDay = absoluteMinutes('2026-12-01', '01:00')
    expect(firstDay - lastDay).toBe(2 * 60)
  })
})
