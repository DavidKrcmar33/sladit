import { describe, expect, it } from 'vitest'
import { applyChecks, reconcile } from './checks'
import type { ExpandedShift, Expansion } from './expand'

function shift(
  date: string,
  start: string,
  end: string,
  extra: Partial<ExpandedShift> = {},
): ExpandedShift {
  return {
    date,
    start,
    end,
    label: 'R',
    raw: 'R',
    uncertain: false,
    source: '',
    origin: 'dated',
    ...extra,
  }
}

function expansion(shifts: ExpandedShift[], overrides: Partial<Expansion> = {}): Expansion {
  return {
    coverage: [{ from: '2026-11-16', to: '2026-11-29' }],
    shifts,
    warnings: [],
    period: { from: '2026-11-23', to: '2026-11-29' },
    coversPeriod: true,
    ...overrides,
  }
}

describe('applyChecks', () => {
  it('leaves a plausible schedule alone and drops the internal origin', () => {
    const result = applyChecks(expansion([shift('2026-11-24', '22:00', '06:00')]))
    expect(result.warnings).toEqual([])
    expect(result.shifts[0]).toEqual({
      date: '2026-11-24',
      start: '22:00',
      end: '06:00',
      label: 'R',
      raw: 'R',
      uncertain: false,
      source: '',
    })
  })

  it('flags a shift longer than 16 hours', () => {
    const result = applyChecks(expansion([shift('2026-11-24', '06:00', '23:30')]))
    expect(result.shifts[0].uncertain).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/24\. 11\..*delší než 16 hodin/)
  })

  it('flags overlapping shifts, including a night shift that runs into the next day', () => {
    const result = applyChecks(
      expansion([
        shift('2026-11-24', '22:00', '06:00'),
        shift('2026-11-25', '05:00', '13:00'),
        shift('2026-11-26', '06:00', '14:00'),
      ]),
    )
    expect(result.shifts.map((item) => item.uncertain)).toEqual([true, true, false])
    expect(result.warnings.join(' ')).toMatch(/překrývají/)
  })

  it('does not treat shifts that only touch as overlapping', () => {
    const result = applyChecks(
      expansion([shift('2026-11-24', '06:00', '14:00'), shift('2026-11-24', '14:00', '22:00')]),
    )
    expect(result.warnings).toEqual([])
  })

  it('flags a weekly block on a public holiday, but not a dated shift', () => {
    const result = applyChecks(
      expansion([
        shift('2026-11-17', '13:00', '14:50', { origin: 'weekly' }),
        shift('2026-11-17', '18:00', '22:00', { origin: 'dated' }),
      ]),
    )
    expect(result.shifts.map((item) => item.uncertain)).toEqual([true, false])
    expect(result.warnings.join(' ')).toMatch(/státní svátek: 17\. 11\. \(Den boje/)
  })

  it('names all holidays of a whole term in one warning', () => {
    const result = applyChecks(
      expansion([
        shift('2026-10-28', '13:00', '14:50', { origin: 'weekly' }),
        shift('2026-11-17', '13:00', '14:50', { origin: 'weekly' }),
      ]),
    )
    const holidays = result.warnings.filter((warning) => warning.includes('svátek'))
    expect(holidays).toHaveLength(1)
    expect(holidays[0]).toMatch(/28\. 10\..*17\. 11\./)
  })

  it('does not see an odd-week and an even-week block at the same time as an overlap', () => {
    const result = applyChecks(
      expansion([
        shift('2026-11-24', '10:00', '11:30', { origin: 'weekly', weeks: 'even' }),
        shift('2026-11-24', '10:00', '11:30', { origin: 'weekly', weeks: 'odd' }),
      ]),
    )
    expect(result.warnings).toEqual([])
    expect(result.shifts.map((item) => item.weeks)).toEqual(['even', 'odd'])
  })

  it('says so when the searched period contains no shift at all', () => {
    expect(applyChecks(expansion([])).warnings.join(' ')).toMatch(/není žádná směna/)
    // Směny jen mimo hledané období se počítají jako prázdné období.
    const outside = expansion([shift('2026-11-17', '06:00', '14:00')])
    expect(applyChecks(outside).warnings.join(' ')).toMatch(/není žádná směna/)
    expect(applyChecks(expansion([], { coversPeriod: false })).warnings).toEqual([])
  })

  it('does not repeat the same warning', () => {
    const result = applyChecks(expansion([], { warnings: ['A', 'A'] }))
    expect(result.warnings.filter((warning) => warning === 'A')).toHaveLength(1)
  })
})

describe('reconcile', () => {
  it('trusts a shift both readings agree on, even if one of them hesitated', () => {
    const first = expansion([shift('2026-11-24', '06:00', '14:00', { uncertain: true })])
    const second = expansion([shift('2026-11-24', '06:00', '14:00')])

    const result = reconcile(first, second)

    expect(result.disagreements).toBe(0)
    expect(result.expansion.shifts[0].uncertain).toBe(false)
  })

  it('keeps a shift uncertain when both readings hesitated', () => {
    const first = expansion([shift('2026-11-24', '06:00', '14:00', { uncertain: true })])
    const second = expansion([shift('2026-11-24', '06:00', '14:00', { uncertain: true })])
    expect(reconcile(first, second).expansion.shifts[0].uncertain).toBe(true)
  })

  it('keeps shifts only one reading found, marks them uncertain and reports them', () => {
    const first = expansion([
      shift('2026-11-24', '06:00', '14:00'),
      shift('2026-11-25', '06:00', '14:00'),
    ])
    const second = expansion([
      shift('2026-11-24', '06:00', '14:00'),
      shift('2026-11-26', '22:00', '06:00'),
    ])

    const result = reconcile(first, second)

    expect(result.disagreements).toBe(2)
    expect(result.expansion.shifts.map((item) => [item.date, item.uncertain])).toEqual([
      ['2026-11-24', false],
      ['2026-11-25', true],
      ['2026-11-26', true],
    ])
    expect(result.expansion.warnings.join(' ')).toMatch(
      /Dvě čtení se neshodla.*25\. 11\..*26\. 11\./,
    )
  })

  it('keeps the warnings and the coverage of the first reading', () => {
    const coverage = [{ from: '2026-11-16', to: '2026-11-22' }]
    const first = expansion([], { warnings: ['A'], coverage })
    const second = expansion([], { warnings: ['A jinými slovy'] })
    const result = reconcile(first, second).expansion
    expect(result.warnings).toEqual(['A'])
    expect(result.coverage).toEqual(coverage)
  })
})
