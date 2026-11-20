import { describe, expect, it, vi } from 'vitest'
import type { ClarifyResponse, OwnedPerson } from '@/contract/api'
import type { Reading } from '@/llm/reading'
import { buildSource, type ReviewBasis } from '@/llm/review'
import { browser, testServer } from './testing'

/**
 * Doptání po čtení: otázky, které z rozvrhu vzniknou, odpovědi z tlačítek a návrh od AI
 * z věty napsané vlastními slovy. Model je falešný, přepočet podkladu skutečný.
 */

const block = { weeks: 'every' as const, exceptDates: [], source: 'řádek 1' }

/** Rozvrh bez data platnosti: úterý 8–10 a nejistě přečtený čtvrtek „Cv?“. */
const timetable: Reading = {
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

const basis: ReviewBasis = {
  readings: [timetable],
  period: { from: '2026-11-23', to: '2026-12-06' },
  extraWarnings: [],
  notes: [],
}

function reading() {
  return {
    from: '2026-11-23',
    to: '2026-12-06',
    files: [{ id: 'f1', name: 'rozvrh.txt', kind: 'text' }],
    parts: [{ part: { text: 'Podklad (text):\nÚt 8-10 Přednáška' }, notes: [] }],
  }
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Anna si nahraje rozvrh. Čtení vrátí i strukturální čtení, takže se k němu jde doptat. */
async function setup(clarify = vi.fn(), withBasis = true) {
  const built = buildSource(basis, [])
  const source = {
    circle: 'Škola',
    coverage: built.coverage,
    shifts: built.shifts,
    warnings: built.warnings,
    questions: built.questions,
    parity: { calendar: false, anchors: [] },
  }
  const server = await testServer(
    { READ_LIMIT_PER_USER_PER_DAY: '2' },
    async () => (withBasis ? { source, basis } : source),
    () => new Date('2026-11-20T12:00:00Z'),
    clarify,
  )
  const anna = browser(server.app)
  await anna.login('anna@example.com', 'Anna')
  const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
  const { person } = await json<{ person: OwnedPerson }>(
    await anna.send('POST', `/api/people/${people[0].id}/readings`, reading()),
  )
  const sourceId = person.sources[0].id
  const base = `/api/people/${person.id}/sources/${sourceId}`
  return { ...server, anna, person, base }
}

describe('doptání po čtení', () => {
  it('shows the owner the questions to a timetable without dates', async () => {
    const { person } = await setup()
    expect(person.sources[0].questions?.map((question) => question.kind)).toEqual([
      'period',
      'shift',
    ])
  })

  it('applies an answer at once and keeps the earlier ones', async () => {
    const { anna, base } = await setup()
    const period = await json<{ person: OwnedPerson }>(
      await anna.send('POST', `${base}/answers`, {
        answers: [{ kind: 'period', range: { from: '2026-11-23', to: '2026-11-29' } }],
      }),
    )
    expect(period.person.sources[0].coverage).toEqual([{ from: '2026-11-23', to: '2026-11-29' }])
    expect(period.person.sources[0].questions?.map((question) => question.kind)).toEqual(['shift'])

    const { person } = await json<{ person: OwnedPerson }>(
      await anna.send('POST', `${base}/answers`, {
        answers: [
          {
            kind: 'shift',
            raw: 'Cv?',
            start: '12:00',
            end: '14:00',
            change: { type: 'remove' },
          },
        ],
      }),
    )
    // Platnost z první odpovědi platí dál.
    expect(person.sources[0].coverage).toEqual([{ from: '2026-11-23', to: '2026-11-29' }])
    expect(person.sources[0].shifts.map((shift) => shift.label)).toEqual(['P'])
    expect(person.sources[0].questions).toEqual([])
  })

  it('proposes the changes from a message and saves nothing until confirmed', async () => {
    const clarify = vi.fn(async () => ({
      reply: 'Platí do 29. 11.',
      answers: [{ kind: 'period' as const, range: { from: '2026-11-23', to: '2026-11-29' } }],
    }))
    const { anna, base } = await setup(clarify)

    const proposal = await json<ClarifyResponse>(
      await anna.send('POST', `${base}/clarify`, { message: 'platí to jen tenhle týden' }),
    )
    expect(proposal).toEqual({
      reply: 'Platí do 29. 11.',
      answers: [{ kind: 'period', range: { from: '2026-11-23', to: '2026-11-29' } }],
      changes: ['Platnost: 23. 11. – 6. 12. → 23. 11. – 29. 11.', 'Ubude směn: 2 (1. 12., 3. 12.)'],
    })
    expect(clarify).toHaveBeenCalledWith({
      basis,
      answers: [],
      message: 'platí to jen tenhle týden',
      today: '2026-11-20',
    })
    const { people } = await json<{ people: OwnedPerson[] }>(await anna.get('/api/people'))
    expect(people[0].sources[0].coverage).toEqual([{ from: '2026-11-23', to: '2026-12-06' }])
  })

  it('counts every message into the daily limit of model calls', async () => {
    const { anna, base } = await setup(vi.fn(async () => ({ reply: 'Rozumím.', answers: [] })))
    // Čtení spotřebovalo jedno volání z limitu 2.
    expect((await anna.send('POST', `${base}/clarify`, { message: 'a' })).status).toBe(200)
    const limited = await anna.send('POST', `${base}/clarify`, { message: 'b' })
    expect(limited.status).toBe(429)
  })

  it('explains that a source read before this feature cannot be reviewed', async () => {
    const { anna, base, person } = await setup(vi.fn(), false)
    expect(person.sources[0].questions).toBeUndefined()
    const answered = await anna.send('POST', `${base}/answers`, {
      answers: [{ kind: 'holiday', applies: true }],
    })
    expect(answered.status).toBe(409)
    expect(await json<{ code: string }>(answered)).toMatchObject({ code: 'review' })
    expect((await anna.send('POST', `${base}/clarify`, { message: 'x' })).status).toBe(409)
  })

  it('does not let anyone else answer or ask about my source', async () => {
    const { app, base } = await setup()
    const eva = browser(app)
    await eva.login('eva@example.com', 'Eva')
    const answers = { answers: [{ kind: 'holiday', applies: true }] }
    expect((await eva.send('POST', `${base}/answers`, answers)).status).toBe(404)
    expect((await eva.send('POST', `${base}/clarify`, { message: 'x' })).status).toBe(404)
  })
})
