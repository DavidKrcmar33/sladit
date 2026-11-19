import { describe, expect, it } from 'vitest'
import type { Proposal, Shift } from '../src/core/schema'
import { aggregate, compareShifts, diffShifts, isTopProposalHit, ratio } from './metrics'

function shift(date: string, start: string, end: string, label = 'X'): Shift {
  return { date, start, end, label, raw: '', uncertain: false }
}

describe('compareShifts', () => {
  const expected = [shift('2026-11-23', '06:00', '14:00'), shift('2026-11-24', '22:00', '06:00')]

  it('counts a shift as correct when date, start and end match, whatever the label', () => {
    const actual = [
      shift('2026-11-23', '06:00', '14:00', 'R'),
      shift('2026-11-24', '22:00', '06:00', 'N'),
    ]
    expect(compareShifts(expected, actual)).toEqual({ correct: 2, expected: 2, returned: 2 })
  })

  it('does not count a shift with a wrong time or a missing one', () => {
    const actual = [shift('2026-11-23', '07:00', '14:00')]
    expect(compareShifts(expected, actual)).toEqual({ correct: 0, expected: 2, returned: 1 })
  })

  it('counts an invented shift only in the returned total', () => {
    const actual = [...expected, shift('2026-11-25', '06:00', '14:00')]
    expect(compareShifts(expected, actual)).toEqual({ correct: 2, expected: 2, returned: 3 })
  })

  it('does not let one expected shift match a duplicate twice', () => {
    const actual = [expected[0], expected[0]]
    expect(compareShifts(expected, actual)).toEqual({ correct: 1, expected: 2, returned: 2 })
  })
})

describe('aggregate', () => {
  it('sums counts and derives recall and precision', () => {
    const total = aggregate([
      { correct: 8, expected: 10, returned: 8 },
      { correct: 1, expected: 10, returned: 2 },
    ])
    expect(total.recall).toBeCloseTo(9 / 20)
    expect(total.precision).toBeCloseTo(9 / 10)
  })

  it('gives null instead of dividing by zero', () => {
    expect(aggregate([])).toMatchObject({ recall: null, precision: null })
    expect(ratio(1, 0)).toBeNull()
  })
})

describe('isTopProposalHit', () => {
  const proposal = (date: string): Proposal => ({
    date,
    start: '16:00',
    end: '19:00',
    available: [],
    missing: [],
    unknown: [],
  })

  it('is a hit when the expected date is among the proposals', () => {
    expect(isTopProposalHit('2026-11-27', [proposal('2026-11-25'), proposal('2026-11-27')])).toBe(
      true,
    )
  })

  it('is a miss otherwise, including when there are no proposals', () => {
    expect(isTopProposalHit('2026-11-27', [proposal('2026-11-25')])).toBe(false)
    expect(isTopProposalHit('2026-11-27', [])).toBe(false)
  })
})

describe('diffShifts', () => {
  it('lists missing and extra shifts', () => {
    const a = shift('2026-11-23', '06:00', '14:00')
    const b = shift('2026-11-24', '22:00', '06:00')
    const c = shift('2026-11-25', '06:00', '14:00')
    expect(diffShifts([a, b], [a, c])).toEqual({ missing: [b], extra: [c] })
  })

  it('is empty for identical shifts', () => {
    const a = shift('2026-11-23', '06:00', '14:00')
    expect(diffShifts([a], [a])).toEqual({ missing: [], extra: [] })
  })
})
