import { describe, expect, it } from 'vitest'
import { expandReading } from './expand'
import type { DatedEntry, Reading, WeeklyEntry } from './reading'

function reading(overrides: Partial<Reading> = {}): Reading {
  return {
    documentKind: 'table',
    readability: 'good',
    people: 'one',
    legend: '',
    weekParity: 'unstated',
    coverage: [],
    dated: [],
    weekly: [],
    warnings: [],
    ...overrides,
  }
}

function dated(
  date: string,
  start: string,
  end: string,
  extra: Partial<DatedEntry> = {},
): DatedEntry {
  return {
    date,
    weekday: 'none',
    start,
    end,
    label: 'R',
    raw: 'R',
    uncertain: false,
    source: 'B2',
    ...extra,
  }
}

function weekly(
  weekday: WeeklyEntry['weekday'],
  start: string,
  end: string,
  extra: Partial<WeeklyEntry> = {},
): WeeklyEntry {
  return {
    weekday,
    weeks: 'every',
    exceptDates: [],
    start,
    end,
    label: 'ŠK',
    raw: 'Předmět',
    uncertain: false,
    source: 'St, 13:00',
    ...extra,
  }
}

const FROM = '2026-11-23'
const TO = '2026-11-29'

function times(result: ReturnType<typeof expandReading>) {
  return result.shifts.map((shift) => `${shift.date} ${shift.start}-${shift.end}`)
}

describe('expandReading: dated entries', () => {
  it('keeps every entry of the document, not only the period', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-01', to: '2026-11-30' }],
        dated: [
          dated('2026-11-20', '06:00', '14:00'),
          dated('2026-11-24', '06:00', '14:00'),
          dated('2026-11-30', '06:00', '14:00'),
        ],
      }),
      FROM,
      TO,
    )

    expect(times(result)).toEqual([
      '2026-11-20 06:00-14:00',
      '2026-11-24 06:00-14:00',
      '2026-11-30 06:00-14:00',
    ])
    expect(result).toMatchObject({
      coverage: [{ from: '2026-11-01', to: '2026-11-30' }],
      coversPeriod: true,
    })
    expect(result.shifts[1]).toMatchObject({ label: 'R', raw: 'R', source: 'B2', origin: 'dated' })
  })

  it('keeps a night shift from the evening before the period', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-16', to: '2026-11-29' }],
        dated: [dated('2026-11-22', '22:00', '06:00')],
      }),
      FROM,
      TO,
    )
    expect(times(result)).toEqual(['2026-11-22 22:00-06:00'])
  })

  it('derives the coverage from the entries when the document does not state it', () => {
    const result = expandReading(
      reading({
        dated: [dated('2026-11-24', '06:00', '14:00'), dated('2026-11-26', '14:00', '22:00')],
      }),
      FROM,
      TO,
    )
    expect(result.coverage).toEqual([{ from: '2026-11-24', to: '2026-11-26' }])
  })

  it('adds the day of an entry that lies outside the stated range, without filling the gap', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-23', to: '2026-11-25' }],
        dated: [dated('2026-11-27', '06:00', '14:00')],
      }),
      FROM,
      TO,
    )
    expect(result.coverage).toEqual([
      { from: '2026-11-23', to: '2026-11-25' },
      { from: '2026-11-27', to: '2026-11-27' },
    ])
  })

  it('keeps two separate periods of one document apart', () => {
    const result = expandReading(
      reading({
        coverage: [
          { from: '2026-11-02', to: '2026-11-08' },
          { from: '2026-11-23', to: '2026-11-29' },
        ],
      }),
      FROM,
      TO,
    )
    expect(result.coverage).toHaveLength(2)
  })

  it('flags an entry whose weekday in the document does not match its date', () => {
    const result = expandReading(
      reading({ dated: [dated('2026-11-24', '06:00', '14:00', { weekday: 'wed' })] }),
      FROM,
      TO,
    )
    expect(result.shifts[0].uncertain).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/24\. 11\..*den v týdnu/)
  })

  it('returns the same shift from two files only once', () => {
    const result = expandReading(
      reading({
        dated: [dated('2026-11-24', '06:00', '14:00'), dated('2026-11-24', '06:00', '14:00')],
      }),
      FROM,
      TO,
    )
    expect(result.shifts).toHaveLength(1)
  })
})

describe('expandReading: weekly pattern', () => {
  it('repeats a block on its weekday across the whole validity', () => {
    const result = expandReading(
      reading({
        documentKind: 'timetable',
        coverage: [{ from: '2026-11-09', to: '2026-11-29' }],
        weekly: [weekly('wed', '13:00', '14:50')],
      }),
      '2026-11-16',
      '2026-11-29',
    )
    expect(times(result)).toEqual([
      '2026-11-11 13:00-14:50',
      '2026-11-18 13:00-14:50',
      '2026-11-25 13:00-14:50',
    ])
    expect(result.shifts[0]).toMatchObject({ origin: 'weekly', label: 'ŠK', source: 'St, 13:00' })
  })

  it('writes odd and even blocks into every week and leaves the choice to the composition', () => {
    const blocks = reading({
      coverage: [{ from: '2026-11-16', to: '2026-11-29' }],
      weekly: [
        weekly('thu', '09:00', '10:50', { weeks: 'odd' }),
        weekly('thu', '16:00', '16:50', { weeks: 'even' }),
        weekly('fri', '08:00', '09:00'),
      ],
    })
    const result = expandReading(blocks, '2026-11-16', '2026-11-29')
    expect(result.shifts.map((shift) => [shift.date, shift.start, shift.weeks])).toEqual([
      ['2026-11-19', '09:00', 'odd'],
      ['2026-11-19', '16:00', 'even'],
      ['2026-11-20', '08:00', undefined],
      ['2026-11-26', '09:00', 'odd'],
      ['2026-11-26', '16:00', 'even'],
      ['2026-11-27', '08:00', undefined],
    ])
  })

  it('keeps an odd and an even block at the same time as two blocks', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
        weekly: [
          weekly('tue', '10:00', '11:30', { weeks: 'even', raw: 'Programování' }),
          weekly('tue', '10:00', '11:30', { weeks: 'odd', raw: 'Databáze' }),
        ],
      }),
      FROM,
      TO,
    )
    expect(result.shifts.map((shift) => shift.raw)).toEqual(['Programování', 'Databáze'])
  })

  it('skips the dates listed as exceptions', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-16', to: '2026-11-29' }],
        weekly: [weekly('thu', '13:00', '14:50', { exceptDates: ['2026-11-26'] })],
      }),
      '2026-11-16',
      '2026-11-29',
    )
    expect(times(result)).toEqual(['2026-11-19 13:00-14:50'])
  })

  it('does not repeat the pattern outside its validity', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-09', to: '2026-11-20' }],
        weekly: [weekly('wed', '13:00', '14:50')],
      }),
      '2026-11-16',
      '2026-11-29',
    )
    expect(times(result)).toEqual(['2026-11-11 13:00-14:50', '2026-11-18 13:00-14:50'])
    expect(result.coverage).toEqual([{ from: '2026-11-09', to: '2026-11-20' }])
  })

  it('assumes the whole period and says so when the validity is not stated', () => {
    const result = expandReading(reading({ weekly: [weekly('mon', '06:00', '14:00')] }), FROM, TO)
    expect(times(result)).toEqual(['2026-11-23 06:00-14:00'])
    expect(result.coverage).toEqual([{ from: FROM, to: TO }])
    expect(result.warnings.join(' ')).toMatch(/Platnost/)
  })
})

describe('expandReading: nothing for the period', () => {
  it('keeps a document about another time, says so and adds nothing to the period', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-09-01', to: '2026-09-30' }],
        dated: [dated('2026-09-02', '06:00', '14:00')],
      }),
      FROM,
      TO,
    )
    expect(result).toMatchObject({
      coverage: [{ from: '2026-09-01', to: '2026-09-30' }],
      coversPeriod: false,
    })
    expect(times(result)).toEqual(['2026-09-02 06:00-14:00'])
    expect(result.warnings.join(' ')).toMatch(/nepokrývá hledané období/)
  })

  it('covers nothing when the document holds no schedule at all', () => {
    const result = expandReading(reading(), FROM, TO)
    expect(result).toMatchObject({ coverage: [], shifts: [], coversPeriod: false })
  })

  it('ignores a coverage range that ends before it starts', () => {
    const result = expandReading(
      reading({
        coverage: [{ from: '2026-11-29', to: '2026-11-23' }],
        dated: [dated('2026-11-24', '06:00', '14:00')],
      }),
      FROM,
      TO,
    )
    expect(result.coverage).toEqual([{ from: '2026-11-24', to: '2026-11-24' }])
  })

  it('passes on the warnings of the model', () => {
    expect(expandReading(reading({ warnings: ['Legenda chybí.'] }), FROM, TO).warnings).toContain(
      'Legenda chybí.',
    )
  })
})
