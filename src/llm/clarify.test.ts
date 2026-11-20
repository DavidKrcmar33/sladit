import { describe, expect, it, vi } from 'vitest'
import { CLARIFY_INSTRUCTION, clarifyAnswers, clarifyContext, clarifyJsonSchema } from './clarify'
import type { Reading } from './reading'
import type { ReviewBasis } from './review'

/** Rozvrh bez data platnosti s nejistým blokem „Cv?“ ve čtvrtek. */
function basis(): ReviewBasis {
  const block = { weeks: 'every' as const, exceptDates: [], source: 'řádek 1' }
  const reading: Reading = {
    documentKind: 'timetable',
    readability: 'good',
    people: 'one',
    legend: '',
    weekParity: 'unstated',
    coverage: [],
    dated: [],
    weekly: [
      {
        ...block,
        weekday: 'tue',
        start: '08:00',
        end: '10:00',
        label: 'P',
        raw: 'Přednáška',
        uncertain: false,
      },
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
  }
  return {
    readings: [reading],
    period: { from: '2026-11-16', to: '2026-11-29' },
    extraWarnings: [],
    notes: [],
  }
}

const input = (message = 'platí to od prosince do konce února, o Vánocích nemám školu') => ({
  basis: basis(),
  answers: [],
  message,
  today: '2026-11-20',
})

function output(overrides: Record<string, unknown> = {}) {
  return {
    reply: 'Rozvrh platí od 1. 12. do 28. 2., 24.–26. 12. volno.',
    period: [{ from: '2026-12-01', to: '2027-02-28' }],
    daysOff: ['2026-12-26', '2026-12-24', '2026-12-25', '2026-12-24'],
    holidays: 'unchanged',
    blocks: [],
    ...overrides,
  }
}

function model(...answers: unknown[]) {
  const generateJson = vi.fn()
  for (const answer of answers) generateJson.mockResolvedValueOnce(answer)
  return { generateJson }
}

describe('doptání vlastními slovy', () => {
  it('turns the reply of the model into answers the code applies', async () => {
    const deps = model(output())
    const result = await clarifyAnswers(input(), deps)
    expect(result).toEqual({
      reply: 'Rozvrh platí od 1. 12. do 28. 2., 24.–26. 12. volno.',
      answers: [
        { kind: 'period', range: { from: '2026-12-01', to: '2027-02-28' } },
        { kind: 'days-off', dates: ['2026-12-24', '2026-12-25', '2026-12-26'] },
      ],
    })
    const request = deps.generateJson.mock.calls[0][0]
    expect(request.systemInstruction).toBe(CLARIFY_INSTRUCTION)
    expect(request.jsonSchema).toBe(clarifyJsonSchema)
  })

  it('tells the model today, the reading, the open questions and the message', () => {
    const text = clarifyContext(input('ve čtvrtek je to až od 13'))
    expect(text).toContain('Dnes je 2026-11-20. Hledané období: 2026-11-16 až 2026-11-29.')
    expect(text).toContain('- út 08:00–10:00 "Přednáška" (každý týden)')
    expect(text).toContain('Platnost: v podkladu není')
    expect(text).toContain('- Nejistý blok: raw "Cv?", start 12:00, end 14:00')
    expect(text).toContain('"""ve čtvrtek je to až od 13"""')
  })

  it('corrects only the blocks it was asked about and drops what does not pass the checks', async () => {
    const blocks = [
      {
        raw: 'Cv?',
        start: '12:00',
        end: '14:00',
        change: 'time',
        newStart: '13:00',
        newEnd: '14:00',
      },
      // Na tento blok se aplikace neptala.
      {
        raw: 'Přednáška',
        start: '08:00',
        end: '10:00',
        change: 'remove',
        newStart: '',
        newEnd: '',
      },
    ]
    const result = await clarifyAnswers(
      input(),
      model(
        output({
          period: [{ from: '2026-12-01', to: '2029-01-01' }],
          daysOff: [],
          holidays: 'free',
          blocks,
        }),
      ),
    )
    // Platnost delší než rok neprojde.
    expect(result.answers).toEqual([
      { kind: 'holiday', applies: false },
      {
        kind: 'shift',
        raw: 'Cv?',
        start: '12:00',
        end: '14:00',
        change: { type: 'time', start: '13:00', end: '14:00' },
      },
    ])
  })

  it('asks once more after an invalid reply and gives up after the second one', async () => {
    const retried = model({ reply: 'x' }, output({ daysOff: [] }))
    expect((await clarifyAnswers(input(), retried)).answers).toHaveLength(1)
    expect(retried.generateJson.mock.calls[1][0].parts.at(-1).text).toMatch(/neplatná/)

    await expect(clarifyAnswers(input(), model({}, {}))).rejects.toThrow(/neplatnou odpověď/)
  })

  it('says it did not understand when the model leaves the reply empty', async () => {
    const result = await clarifyAnswers(
      input('blabla'),
      model(output({ reply: ' ', period: [], daysOff: [] })),
    )
    expect(result).toEqual({
      reply: 'Nerozuměl jsem, co se má změnit. Zkus to napsat jinak.',
      answers: [],
    })
  })
})
