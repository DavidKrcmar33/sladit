import { describe, expect, it } from 'vitest'
import {
  clipRanges,
  intersectRanges,
  isCovered,
  normalizeRanges,
  rangesOfDates,
  unionRanges,
} from './coverage'

describe('normalizeRanges', () => {
  it('sorts ranges and merges overlapping and adjacent ones', () => {
    expect(
      normalizeRanges([
        { from: '2026-12-01', to: '2026-12-05' },
        { from: '2026-11-23', to: '2026-11-29' },
        { from: '2026-11-30', to: '2026-11-30' },
        { from: '2026-12-10', to: '2026-12-12' },
      ]),
    ).toEqual([
      { from: '2026-11-23', to: '2026-12-05' },
      { from: '2026-12-10', to: '2026-12-12' },
    ])
  })

  it('keeps a gap of one day', () => {
    expect(
      normalizeRanges([
        { from: '2026-11-23', to: '2026-11-24' },
        { from: '2026-11-26', to: '2026-11-27' },
      ]),
    ).toHaveLength(2)
  })

  it('merges across the end of the year', () => {
    expect(
      normalizeRanges([
        { from: '2026-12-28', to: '2026-12-31' },
        { from: '2027-01-01', to: '2027-01-03' },
      ]),
    ).toEqual([{ from: '2026-12-28', to: '2027-01-03' }])
  })
})

describe('set operations', () => {
  const november = [{ from: '2026-11-01', to: '2026-11-30' }]
  const school = [
    { from: '2026-09-21', to: '2026-11-15' },
    { from: '2026-11-25', to: '2026-12-18' },
  ]

  it('tells whether a day is covered', () => {
    expect(isCovered(school, '2026-11-20')).toBe(false)
    expect(isCovered(school, '2026-11-25')).toBe(true)
  })

  it('unites and intersects ranges', () => {
    expect(unionRanges(november, school)).toEqual([{ from: '2026-09-21', to: '2026-12-18' }])
    expect(intersectRanges(november, school)).toEqual([
      { from: '2026-11-01', to: '2026-11-15' },
      { from: '2026-11-25', to: '2026-11-30' },
    ])
  })

  it('clips ranges to a period', () => {
    expect(clipRanges(school, '2026-11-10', '2026-11-27')).toEqual([
      { from: '2026-11-10', to: '2026-11-15' },
      { from: '2026-11-25', to: '2026-11-27' },
    ])
  })

  it('builds ranges from single days', () => {
    expect(rangesOfDates(['2026-11-25', '2026-11-23', '2026-11-24', '2026-11-27'])).toEqual([
      { from: '2026-11-23', to: '2026-11-25' },
      { from: '2026-11-27', to: '2026-11-27' },
    ])
  })
})
