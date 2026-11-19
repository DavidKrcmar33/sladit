import { describe, expect, it } from 'vitest'
import type { Participant } from './scheduler'
import type { ActionParams, PersonSchedule, Shift } from './schema'
import { analyzeStability, certainPart } from './sensitivity'

const action: ActionParams = {
  from: '2026-11-23',
  to: '2026-11-25',
  durationMinutes: 120,
  windowStart: '18:00',
  windowEnd: '20:00',
}

const MON = '2026-11-23'
const TUE = '2026-11-24'
const WED = '2026-11-25'

/** Odpolední 14–22 zablokuje celé večerní okno. */
function shift(date: string, extra: Partial<Shift> = {}): Shift {
  return { date, start: '14:00', end: '22:00', label: 'O', raw: 'O', uncertain: false, ...extra }
}

function known(id: string, busyOn: string[], extra: Partial<Shift> = {}): Participant {
  return {
    id,
    schedule: {
      coverage: [{ from: '2026-11-22', to: '2026-11-26' }],
      shifts: busyOn.map((date) => shift(date, extra)),
      warnings: [],
    },
  }
}

function person(id: string, schedule: PersonSchedule | null): Participant {
  return { id, schedule }
}

describe('analyzeStability', () => {
  it('calls the best day certain when no other day can catch up even in the best case', () => {
    const people = [known('a', [TUE, WED]), known('b', [TUE]), person('c', null)]
    // Pondělí: a, b jistě. Úterý a středa nejvýš b a c.
    const result = analyzeStability(action, people)
    expect(result.winner?.date).toBe(MON)
    expect(result).toMatchObject({ certain: true, pivots: [] })
  })

  it('is not certain with 5 known and 1 unknown against 3 known and 3 unknown', () => {
    const openOnTuesday = (id: string) =>
      person(id, {
        coverage: [
          { from: '2026-11-22', to: MON },
          { from: WED, to: '2026-11-26' },
        ],
        shifts: [shift(MON), shift(WED)],
        warnings: [],
      })
    const people = [
      known('a', [WED]),
      known('b', [WED]),
      known('c', [WED]),
      known('d', [TUE, WED]),
      known('e', [TUE, WED]),
      person('x', null),
      openOnTuesday('f'),
      openOnTuesday('g'),
    ]
    // Pondělí: a–e jistě (5) a x neznámý. Úterý: a–c jistě (3) a x, f, g neznámí, takže až 6.
    const result = analyzeStability(action, people)
    expect(result.winner).toMatchObject({ date: MON, available: ['a', 'b', 'c', 'd', 'e'] })
    expect(result.certain).toBe(false)
    expect(result.pivots).toEqual([
      {
        personId: 'x',
        dates: [
          { date: MON, reason: 'missing' },
          { date: TUE, reason: 'missing' },
        ],
      },
      { personId: 'f', dates: [{ date: TUE, reason: 'missing' }] },
      { personId: 'g', dates: [{ date: TUE, reason: 'missing' }] },
    ])
  })

  it('names the people and days the result depends on, with the reason', () => {
    const people = [
      known('anna', []),
      known('petr', [MON], { uncertain: true }),
      person('jana', {
        coverage: [{ from: '2026-11-22', to: MON }],
        shifts: [shift(MON)],
        warnings: [],
      }),
    ]
    // Úterý vede (anna, petr), ale pondělí by při volném Petrovi vyrovnalo a jako dřívější vyhrálo.
    const result = analyzeStability(action, people)
    expect(result.winner?.date).toBe(TUE)
    expect(result.certain).toBe(false)
    expect(result.pivots).toEqual([
      { personId: 'petr', dates: [{ date: MON, reason: 'uncertain' }] },
      {
        personId: 'jana',
        dates: [
          { date: TUE, reason: 'missing' },
          { date: WED, reason: 'missing' },
        ],
      },
    ])
  })

  it('treats an uncertain shift as a doubt about the whole day, not only about its existence', () => {
    // Nejistá ranní 8–12 vypadá, že večer nevadí. Časy jsou ale odhadnuté, mohla to být odpolední.
    const people = [
      person('a', {
        coverage: [{ from: '2026-11-22', to: '2026-11-26' }],
        shifts: [
          shift(MON, { start: '08:00', end: '12:00', uncertain: true }),
          shift(TUE),
          shift(WED),
        ],
        warnings: [],
      }),
      known('b', [TUE, WED]),
      known('c', [MON, WED]),
      known('d', [MON, WED]),
    ]
    // Pondělí: a, b. Úterý: c, d. Shoda, vede dřívější pondělí, ale jen dokud platí Annina ranní.
    const result = analyzeStability(action, people)
    expect(result.winner?.date).toBe(MON)
    expect(result.certain).toBe(false)
    expect(result.pivots).toEqual([{ personId: 'a', dates: [{ date: MON, reason: 'uncertain' }] }])
  })

  it('is certain on a tie that a later day could only equal', () => {
    const people = [known('a', [TUE, WED]), known('b', [MON, WED])]
    // Pondělí: a, úterý: b. Úterý by muselo předčít, vyrovnat nestačí, a nikdo není otevřený.
    expect(analyzeStability(action, people)).toMatchObject({ certain: true })
  })

  it('has no winner and nothing certain when nobody is known to be free', () => {
    expect(analyzeStability(action, [person('a', null)])).toEqual({
      winner: null,
      certain: false,
      pivots: [],
    })
  })
})

describe('certainPart', () => {
  it('turns days with an uncertain shift into unknown days and keeps certain shifts', () => {
    const sure = shift(TUE, { start: '06:00', end: '10:00' })
    const doubtful = shift(TUE, { uncertain: true })
    const schedule = {
      coverage: [{ from: '2026-11-22', to: '2026-11-26' }],
      shifts: [sure, doubtful],
      warnings: [],
    }
    expect(certainPart(schedule)).toEqual({
      coverage: [
        { from: '2026-11-22', to: MON },
        { from: WED, to: '2026-11-26' },
      ],
      shifts: [sure],
      warnings: [],
    })
  })

  it('leaves a schedule without doubts alone', () => {
    const schedule = known('a', [TUE]).schedule
    expect(certainPart(schedule)).toBe(schedule)
  })
})
