import { describe, expect, it, vi } from 'vitest'
import {
  UnreadableSourceError,
  extractSchedule,
  extractWithReport,
  type ExtractDeps,
} from './extract'
import type { PreparedSource } from './ingest'
import { readingJsonSchema, type Reading } from './reading'

function reading(overrides: Partial<Reading> = {}): Reading {
  return {
    documentKind: 'table',
    readability: 'good',
    people: 'one',
    legend: 'R = 6-14',
    weekParity: 'unstated',
    coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
    dated: [
      {
        date: '2026-11-24',
        weekday: 'tue',
        start: '06:00',
        end: '14:00',
        label: 'R',
        raw: 'R',
        uncertain: false,
        source: 'B2',
      },
    ],
    weekly: [],
    warnings: [],
    ...overrides,
  }
}

function uncertainReading(start = '06:00'): Reading {
  const base = reading()
  return { ...base, dated: [{ ...base.dated[0], start, uncertain: true }] }
}

function input(sources: PreparedSource[] = [source('OBSAH Po R'), source('OBSAH x')]) {
  return { sources, from: '2026-11-23', to: '2026-11-29' }
}

function source(text: string, notes: string[] = []): PreparedSource {
  return { part: { text }, notes }
}

function deps(
  answers: unknown[],
  overrides: Partial<Pick<ExtractDeps, 'verify' | 'verifyModel'>> = {},
) {
  const generateJson = vi.fn()
  for (const answer of answers) {
    if (answer instanceof Error) generateJson.mockRejectedValueOnce(answer)
    else generateJson.mockResolvedValueOnce(answer)
  }
  return {
    generateJson,
    systemInstruction: 'SYSTEM',
    verify: 'auto' as const,
    ...overrides,
  }
}

describe('extractSchedule', () => {
  it('turns a reading into a source with dated shifts', async () => {
    const result = await extractSchedule(input(), deps([reading()]))

    expect(result).toEqual({
      circle: 'Práce',
      parity: { calendar: false, anchors: [] },
      coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
      shifts: [
        {
          date: '2026-11-24',
          start: '06:00',
          end: '14:00',
          label: 'R',
          raw: 'R',
          uncertain: false,
          source: 'B2',
        },
      ],
      warnings: [],
      // Tabulka s daty a jistým čtením: není se na co doptat.
      questions: [],
    })
  })

  it('numbers every source, puts the period last and asks for the reading schema', async () => {
    const d = deps([reading()])

    await extractSchedule(input(), d)

    const request = d.generateJson.mock.calls[0][0]
    expect(request.systemInstruction).toBe('SYSTEM')
    expect(request.jsonSchema).toBe(readingJsonSchema)
    expect(request.parts.slice(0, 4)).toEqual([
      { text: 'Podklad 1:' },
      { text: 'OBSAH Po R' },
      { text: 'Podklad 2:' },
      { text: 'OBSAH x' },
    ])
    expect(request.parts[4].text).toContain('2026-11-23')
    expect(request.parts[4].text).toContain('2026-11-29')
  })

  it('refuses to read without any source', async () => {
    await expect(extractSchedule(input([]), deps([reading()]))).rejects.toThrow(/Chybí podklad/)
  })

  it('passes on notes about what was left out of a source', async () => {
    const result = await extractSchedule(
      input([source('OBSAH', ['NOTE']), source('OBSAH x')]),
      deps([reading()]),
    )
    expect(result.warnings).toEqual(['NOTE'])
  })

  it('shows the same note once when two sources produce it', async () => {
    const result = await extractSchedule(
      input([source('A', ['NOTE']), source('B', ['NOTE'])]),
      deps([reading()]),
    )
    expect(result.warnings).toEqual(['NOTE'])
  })

  it('expands a weekly pattern in code, not in the model', async () => {
    const weekly = reading({
      documentKind: 'timetable',
      coverage: [{ from: '2026-09-21', to: '2026-12-20' }],
      dated: [],
      weekly: [
        {
          weekday: 'wed',
          weeks: 'every',
          exceptDates: [],
          start: '13:00',
          end: '14:50',
          label: 'ŠK',
          raw: 'Umělá inteligence',
          uncertain: false,
          source: 'St, 13:00',
        },
      ],
    })

    const result = await extractSchedule(input(), deps([weekly]))

    // Celý semestr, ne jen hledaný týden: zdroj jde použít i pro jiné období.
    expect(result.shifts).toHaveLength(13)
    expect(result.shifts.map((shift) => shift.date)).toContain('2026-11-25')
    expect(result.circle).toBe('Škola')
  })

  it('remembers when the document says odd weeks follow the calendar', async () => {
    const result = await extractSchedule(input(), deps([reading({ weekParity: 'calendar' })]))
    expect(result.parity).toEqual({ calendar: true, anchors: [] })
  })

  it('asks again with the validation errors when the answer is invalid', async () => {
    const d = deps([{ ...reading(), readability: 'great' }, reading()])

    const result = await extractSchedule(input(), d)

    expect(result.shifts).toHaveLength(1)
    expect(d.generateJson).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(d.generateJson.mock.calls[1][0].parts)).toContain('readability')
  })

  it('fails after the second invalid answer', async () => {
    const d = deps([{ nothing: true }, { nothing: true }])
    await expect(extractSchedule(input(), d)).rejects.toThrow(/neplatné čtení/i)
  })
})

describe('recognition', () => {
  it('refuses an unreadable source with its own error', async () => {
    const d = deps([reading({ readability: 'unreadable', dated: [] })])
    await expect(extractSchedule(input(), d)).rejects.toBeInstanceOf(UnreadableSourceError)
  })

  it('says with the error what was left out of an unreadable source', async () => {
    const d = deps([reading({ readability: 'unreadable', dated: [] })])
    await expect(extractSchedule(input([source('OBSAH', ['NOTE'])]), d)).rejects.toMatchObject({
      name: 'UnreadableSourceError',
      notes: ['NOTE'],
    })
  })

  it('returns nothing and explains why when the source holds schedules of several people', async () => {
    const d = deps([reading({ people: 'many' })])

    const { source: schedule, report } = await extractWithReport(input(), d)

    expect(schedule.shifts).toEqual([])
    expect(schedule.warnings.join(' ')).toMatch(/více lidí/)
    // Prázdné pokrytí: žádný den z tohoto podkladu nevypadá jako volný.
    expect(schedule.coverage).toEqual([])
    expect(report).toMatchObject({ people: 'many', readings: 1 })
    expect(d.generateJson).toHaveBeenCalledTimes(1)
  })

  it('reports what kind of document it was', async () => {
    const { report } = await extractWithReport(input(), deps([reading()]))
    expect(report).toEqual({
      documentKind: 'table',
      readability: 'good',
      people: 'one',
      readings: 1,
      disagreements: 0,
    })
  })
})

describe('second look', () => {
  it('is skipped when the first reading is confident', async () => {
    const d = deps([reading()])
    await extractSchedule(input(), d)
    expect(d.generateJson).toHaveBeenCalledTimes(1)
  })

  it('reads again when the first reading is unsure and trusts what both agree on', async () => {
    const d = deps([uncertainReading(), reading()], { verifyModel: 'other-model' })

    const { source: schedule, report } = await extractWithReport(input(), d)

    expect(d.generateJson).toHaveBeenCalledTimes(2)
    const second = d.generateJson.mock.calls[1][0]
    expect(second.model).toBe('other-model')
    expect(JSON.stringify(second.parts)).toMatch(/druhé, nezávislé čtení/i)
    expect(schedule.shifts[0].uncertain).toBe(false)
    expect(report).toMatchObject({ readings: 2, disagreements: 0 })
  })

  it('flags what the two readings disagree on', async () => {
    const d = deps([uncertainReading('06:00'), uncertainReading('07:00')])

    const { source: schedule, report } = await extractWithReport(input(), d)

    expect(schedule.shifts.map((shift) => [shift.start, shift.uncertain])).toEqual([
      ['06:00', true],
      ['07:00', true],
    ])
    expect(schedule.warnings.join(' ')).toMatch(/Dvě čtení se neshodla/)
    expect(report.disagreements).toBe(2)
  })

  it('also runs for a partly readable source', async () => {
    const d = deps([reading({ readability: 'partial' }), reading()])
    const { source: schedule } = await extractWithReport(input(), d)
    expect(d.generateJson).toHaveBeenCalledTimes(2)
    expect(schedule.warnings.join(' ')).toMatch(/čitelný jen zčásti/)
  })

  it('keeps the first reading when the second one fails', async () => {
    const d = deps([uncertainReading(), new Error('Gemini vrátilo 503')])

    const { source: schedule, report } = await extractWithReport(input(), d)

    expect(schedule.shifts).toHaveLength(1)
    expect(schedule.shifts[0].uncertain).toBe(true)
    expect(schedule.warnings.join(' ')).toMatch(/Druhé čtení se nepodařilo/)
    expect(report.readings).toBe(1)
  })

  it('can be switched off', async () => {
    const d = deps([uncertainReading()], { verify: 'never' })
    await extractSchedule(input(), d)
    expect(d.generateJson).toHaveBeenCalledTimes(1)
  })
})
