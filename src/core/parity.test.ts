import { describe, expect, it } from 'vitest'
import { paritySegment, weekParity, withAnchor } from './parity'
import type { Parity } from './schema'

const none: Parity = { calendar: false, anchors: [] }

describe('weekParity', () => {
  it('is unknown until the document or a person says which week is odd', () => {
    expect(weekParity(none, '2026-11-24')).toBeNull()
  })

  it('follows the week number when the document says parity is by the calendar', () => {
    const calendar = { ...none, calendar: true }
    expect(weekParity(calendar, '2026-11-24')).toBe('even') // týden 48
    expect(weekParity(calendar, '2026-12-01')).toBe('odd') // týden 49
    // Týdny 53/2026 a 1/2027 jsou podle kalendáře oba liché a fakulta, která to říká, to tak myslí.
    expect(weekParity(calendar, '2026-12-30')).toBe('odd')
    expect(weekParity(calendar, '2027-01-05')).toBe('odd')
  })

  it('alternates every seven days from a confirmed week, in both directions', () => {
    const anchored = withAnchor(none, '2026-11-25', true)
    expect(weekParity(anchored, '2026-11-23')).toBe('odd')
    expect(weekParity(anchored, '2026-11-29')).toBe('odd')
    expect(weekParity(anchored, '2026-11-30')).toBe('even')
    expect(weekParity(anchored, '2026-11-16')).toBe('even')
    expect(weekParity(anchored, '2026-10-12')).toBe('odd')
    expect(weekParity(anchored, '2026-10-05')).toBe('even')
  })

  it('is right for a faculty whose odd weeks do not match the calendar', () => {
    // Letní semestr 2025/26 začíná 16. 2. 2026 jako lichý, i když je to 8. týden roku.
    const anchored = withAnchor(none, '2026-02-16', true)
    expect(weekParity(anchored, '2026-02-17')).toBe('odd')
    expect(weekParity(anchored, '2026-02-24')).toBe('even')
    expect(weekParity(anchored, '2026-05-12')).toBe('odd')
  })

  it('does not carry a confirmation across the Christmas break', () => {
    const anchored = withAnchor(none, '2026-11-25', true)
    expect(weekParity(anchored, '2026-12-22')).not.toBeNull()
    expect(weekParity(anchored, '2026-12-28')).toBeNull()
    expect(weekParity(anchored, '2027-01-05')).toBeNull()
  })

  it('does not carry a confirmation from the winter term to the summer term', () => {
    const january = withAnchor(none, '2027-01-05', true)
    expect(weekParity(january, '2027-01-12')).toBe('even')
    expect(weekParity(january, '2027-02-16')).toBeNull()
  })

  it('keeps answers for different terms side by side', () => {
    const both = withAnchor(withAnchor(none, '2026-11-25', true), '2027-01-05', false)
    expect(both.anchors).toHaveLength(2)
    expect(weekParity(both, '2026-11-25')).toBe('odd')
    expect(weekParity(both, '2027-01-05')).toBe('even')
  })
})

describe('paritySegment', () => {
  it('splits the year at the breaks in teaching', () => {
    expect(paritySegment('2026-11-24')).toBe('2026-podzim')
    expect(paritySegment('2026-12-23')).toBeNull()
    expect(paritySegment('2027-01-01')).toBeNull()
    expect(paritySegment('2027-01-04')).toBe('2027-leden')
    expect(paritySegment('2027-02-15')).toBe('2027-jaro')
    expect(paritySegment('2027-07-15')).toBe('2027-léto')
  })
})
