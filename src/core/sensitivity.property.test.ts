import { describe, expect, it } from 'vitest'
import { rangesOfDates } from './coverage'
import {
  attendanceInSlot,
  candidateSlots,
  DEFAULT_SCHEDULING_RULES,
  type Participant,
} from './scheduler'
import type { ActionParams, DateString, PersonSchedule, Shift } from './schema'
import { analyzeStability } from './sensitivity'
import { eachDay, formatMinutes } from './time'

/**
 * Náhodný test proti hrubé síle: verdikt „jistý“ nesmí selhat ani jednou.
 *
 * Pro malé náhodné akce se zkouší každé doplnění dat: neznámý den může být volný, nebo obsazený,
 * den s nejistou směnou navíc může zůstat, jak byl přečten. Když analýza řekne „jistý“, musí
 * po každém doplnění vyjít nejlepší termín ve stejný den.
 */

const RULES = { ...DEFAULT_SCHEDULING_RULES, slotStepMinutes: 60 }
const ACTION: ActionParams = {
  from: '2026-11-24',
  to: '2026-11-26',
  durationMinutes: 120,
  windowStart: '16:00',
  windowEnd: '20:00',
}
const DAYS = eachDay('2026-11-23', '2026-11-27')
const SLOTS = eachDay(ACTION.from, ACTION.to).flatMap((date) => candidateSlots(ACTION, date, RULES))

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shift(date: DateString, start: number, hours: number, uncertain: boolean): Shift {
  return {
    date,
    start: formatMinutes(start),
    end: formatMinutes((start + hours * 60) % (24 * 60)),
    label: '',
    raw: '',
    uncertain,
  }
}

/** Směna přes celé denní okno, nepřekročí půlnoc. */
const blocking = (date: DateString) => shift(date, 15 * 60, 6, false)

function randomSchedule(random: () => number): PersonSchedule | null {
  if (random() < 0.1) return null
  const covered = DAYS.filter(() => random() < 0.7)
  const shifts: Shift[] = []
  for (const date of covered) {
    if (random() < 0.5) {
      const start = (10 + Math.floor(random() * 12)) * 60
      shifts.push(shift(date, start, 1 + Math.floor(random() * 4), random() < 0.3))
    }
  }
  return { coverage: rangesOfDates(covered), shifts, warnings: [] }
}

/** Všechna doplnění jednoho člověka, každé jako bitová maska časů, kdy může. */
function possibleMasks(schedule: PersonSchedule | null): Set<number> {
  const unknown = DAYS.filter(
    (date) => !schedule || !schedule.coverage.some((r) => r.from <= date && date <= r.to),
  )
  const doubtful = DAYS.filter(
    (date) => schedule?.shifts.some((item) => item.date === date && item.uncertain) ?? false,
  )
  const certain = schedule?.shifts.filter((item) => !item.uncertain) ?? []
  const choices: { date: DateString; options: Shift[][] }[] = [
    ...unknown.map((date) => ({ date, options: [[], [blocking(date)]] })),
    ...doubtful.map((date) => ({
      date,
      options: [
        schedule!.shifts
          .filter((item) => item.date === date && item.uncertain)
          .map((item) => ({ ...item, uncertain: false })),
        [],
        [blocking(date)],
      ],
    })),
  ]

  const masks = new Set<number>()
  const visit = (index: number, extra: Shift[]) => {
    if (index === choices.length) {
      const complete = {
        coverage: rangesOfDates(DAYS),
        shifts: [...certain, ...extra],
        warnings: [],
      }
      let mask = 0
      SLOTS.forEach((slot, bit) => {
        if (attendanceInSlot(complete, slot, RULES) === 'available') mask |= 1 << bit
      })
      masks.add(mask)
      return
    }
    for (const option of choices[index].options) visit(index + 1, [...extra, ...option])
  }
  visit(0, [])
  return masks
}

/** Den nejlepšího termínu při úplných datech: nejvíc lidí, při shodě dřívější. */
function winnerDay(masks: number[]): DateString | null {
  let best: { date: DateString; count: number } | null = null
  SLOTS.forEach((slot, bit) => {
    const count = masks.filter((mask) => mask & (1 << bit)).length
    if (count > 0 && (!best || count > best.count)) best = { date: slot.date, count }
  })
  return best === null ? null : (best as { date: DateString }).date
}

function* combinations(sets: number[][], prefix: number[] = []): Generator<number[]> {
  if (prefix.length === sets.length) {
    yield prefix
    return
  }
  for (const value of sets[prefix.length]) yield* combinations(sets, [...prefix, value])
}

describe('analyzeStability proti hrubé síle', () => {
  it('never calls a day certain when some completion of the data moves the best date', () => {
    const random = seededRandom(19112026)
    let certainCount = 0
    let changeableCount = 0
    for (let round = 0; round < 10_000; round++) {
      const people: Participant[] = Array.from(
        { length: 2 + Math.floor(random() * 3) },
        (_, i) => ({
          id: `p${i}`,
          schedule: randomSchedule(random),
        }),
      )
      const result = analyzeStability(ACTION, people, RULES)
      if (!result.winner) continue
      if (!result.certain) {
        changeableCount++
        continue
      }
      certainCount++
      const options = people.map((person) => [...possibleMasks(person.schedule)])
      for (const masks of combinations(options)) {
        expect(winnerDay(masks), JSON.stringify({ people, masks })).toBe(result.winner.date)
      }
    }
    // Test nesmí projít jen proto, že by analýza nikdy neřekla „jistý“.
    expect(certainCount).toBeGreaterThan(1000)
    expect(changeableCount).toBeGreaterThan(1000)
  })
})
