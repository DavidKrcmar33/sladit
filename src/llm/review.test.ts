import { describe, expect, it } from 'vitest'
import type { SourceAnswer } from '@/core/review'
import type { Reading } from './reading'
import { buildSource, describeChanges, type ReviewBasis } from './review'

/** Rozvrh bez data platnosti: v úterý přednáška 8–10, ve čtvrtek nejistě přečtený blok „Cv?“. */
function timetable(overrides: Partial<Reading> = {}): Reading {
  const block = {
    weeks: 'every' as const,
    exceptDates: [],
    uncertain: false,
    source: 'řádek 1',
  }
  return {
    documentKind: 'timetable',
    readability: 'good',
    people: 'one',
    legend: '',
    weekParity: 'unstated',
    coverage: [],
    dated: [],
    weekly: [
      { ...block, weekday: 'tue', start: '08:00', end: '10:00', label: 'P', raw: 'Přednáška' },
      {
        ...block,
        weekday: 'thu',
        start: '12:00',
        end: '14:00',
        label: 'Cv',
        raw: 'Cv?',
        uncertain: true,
      },
    ],
    warnings: [],
    ...overrides,
  }
}

/** Hledané období 16.–29. 11. 2026, úterý 17. 11. je státní svátek. */
function basis(reading: Reading = timetable()): ReviewBasis {
  return {
    readings: [reading],
    period: { from: '2026-11-16', to: '2026-11-29' },
    extraWarnings: [],
    notes: [],
  }
}

function datesOf(answers: SourceAnswer[], label: string) {
  return buildSource(basis(), answers)
    .shifts.filter((shift) => shift.label === label)
    .map((shift) => shift.date)
}

describe('doptání: otázky ze čtení', () => {
  it('asks for the period of a timetable without dates, about holidays and uncertain blocks', () => {
    const built = buildSource(basis(), [])
    expect(built.coverage).toEqual([{ from: '2026-11-16', to: '2026-11-29' }])
    expect(built.questions).toEqual([
      { kind: 'period', assumed: { from: '2026-11-16', to: '2026-11-29' } },
      {
        kind: 'holiday',
        holidays: [{ date: '2026-11-17', name: 'Den boje za svobodu a demokracii' }],
      },
      {
        kind: 'shift',
        raw: 'Cv?',
        label: 'Cv',
        start: '12:00',
        end: '14:00',
        firstDate: '2026-11-19',
        count: 2,
      },
    ])
  })

  it('asks nothing about a dated table read with certainty', () => {
    const table = timetable({
      documentKind: 'table',
      coverage: [{ from: '2026-11-16', to: '2026-11-22' }],
      weekly: [],
      dated: [
        {
          date: '2026-11-18',
          weekday: 'wed',
          start: '06:00',
          end: '14:00',
          label: 'R',
          raw: 'R',
          uncertain: false,
          source: 'B2',
        },
      ],
    })
    expect(buildSource(basis(table), []).questions).toEqual([])
  })
})

describe('doptání: odpovědi', () => {
  it('re-expands the timetable over the answered period and stops asking', () => {
    const built = buildSource(basis(), [
      { kind: 'period', range: { from: '2026-11-23', to: '2026-12-13' } },
    ])
    expect(built.coverage).toEqual([{ from: '2026-11-23', to: '2026-12-13' }])
    expect(built.shifts.filter((shift) => shift.label === 'P').map((shift) => shift.date)).toEqual([
      '2026-11-24',
      '2026-12-01',
      '2026-12-08',
    ])
    expect(built.questions.map((question) => question.kind)).toEqual(['shift'])
    expect(built.warnings.join(' ')).not.toMatch(/Platnost rozvrhu není/)
  })

  it('drops the timetable on holidays, or accepts them without a warning', () => {
    expect(datesOf([{ kind: 'holiday', applies: false }], 'P')).toEqual(['2026-11-24'])

    const accepted = buildSource(basis(), [{ kind: 'holiday', applies: true }])
    const holiday = accepted.shifts.find((shift) => shift.date === '2026-11-17')!
    expect(holiday.uncertain).toBe(false)
    expect(accepted.warnings.join(' ')).not.toMatch(/státní svátek/)
    expect(accepted.questions.map((question) => question.kind)).toEqual(['period', 'shift'])
  })

  it('confirms, removes or retimes every occurrence of an uncertain block', () => {
    const block = { kind: 'shift', raw: 'Cv?', start: '12:00', end: '14:00' } as const
    const confirmed = buildSource(basis(), [{ ...block, change: { type: 'correct' } }])
    expect(confirmed.shifts.filter((shift) => shift.label === 'Cv')).toMatchObject([
      { uncertain: false },
      { uncertain: false },
    ])
    expect(datesOf([{ ...block, change: { type: 'remove' } }], 'Cv')).toEqual([])

    const retimed = buildSource(basis(), [
      { ...block, change: { type: 'time', start: '13:00', end: '14:30' } },
    ])
    expect(retimed.shifts.filter((shift) => shift.label === 'Cv')).toMatchObject([
      { date: '2026-11-19', start: '13:00', end: '14:30', uncertain: false },
      { date: '2026-11-26', start: '13:00', end: '14:30', uncertain: false },
    ])
    expect(retimed.questions.map((question) => question.kind)).toEqual(['period', 'holiday'])
  })

  it('leaves the source as read when a question is skipped', () => {
    const built = buildSource(basis(), [{ kind: 'skip', questionId: 'period' }])
    expect(built.coverage).toEqual([{ from: '2026-11-16', to: '2026-11-29' }])
    expect(built.questions.map((question) => question.kind)).toEqual(['holiday', 'shift'])
  })

  it('removes the blocks on days off but keeps the days known', () => {
    const built = buildSource(basis(), [{ kind: 'days-off', dates: ['2026-11-24', '2026-11-26'] }])
    expect(built.shifts.map((shift) => shift.date)).toEqual(['2026-11-17', '2026-11-19'])
    expect(built.coverage).toEqual([{ from: '2026-11-16', to: '2026-11-29' }])
  })

  it('lets a later period answer replace an earlier one', () => {
    const built = buildSource(basis(), [
      { kind: 'period', range: { from: '2026-11-23', to: '2026-12-31' } },
      { kind: 'period', range: { from: '2026-11-23', to: '2026-11-29' } },
    ])
    expect(built.coverage).toEqual([{ from: '2026-11-23', to: '2026-11-29' }])
  })
})

describe('popis změn', () => {
  it('says how the period and the shifts change', () => {
    const before = buildSource(basis(), [])
    const after = buildSource(basis(), [
      { kind: 'period', range: { from: '2026-11-16', to: '2026-11-22' } },
      { kind: 'shift', raw: 'Cv?', start: '12:00', end: '14:00', change: { type: 'correct' } },
    ])
    expect(describeChanges(before, after)).toEqual([
      'Platnost: 16. 11. – 29. 11. → 16. 11. – 22. 11.',
      'Ubude směn: 2 (24. 11., 26. 11.)',
      'Potvrdí se nejisté čtení: 1',
    ])
    expect(describeChanges(before, before)).toEqual([])
  })
})
