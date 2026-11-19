import type { DateString, Proposal, Shift } from '../src/core/schema'

export interface ShiftCounts {
  correct: number
  expected: number
  returned: number
}

export interface ReadingScore extends ShiftCounts {
  recall: number | null
  precision: number | null
}

/** Podíl, nebo null, když by se dělilo nulou (třeba skupina bez očekávaných směn). */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole
}

function shiftKey(shift: Shift): string {
  return `${shift.date} ${shift.start} ${shift.end}`
}

/** Směna je správně, když sedí den, začátek a konec. Označení se nepočítá, každá očekávaná směna jde spárovat jen jednou. */
export function compareShifts(expected: Shift[], actual: Shift[]): ShiftCounts {
  const remaining = new Map<string, number>()
  for (const shift of expected) {
    remaining.set(shiftKey(shift), (remaining.get(shiftKey(shift)) ?? 0) + 1)
  }

  let correct = 0
  for (const shift of actual) {
    const key = shiftKey(shift)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      correct++
    }
  }
  return { correct, expected: expected.length, returned: actual.length }
}

export function aggregate(counts: ShiftCounts[]): ReadingScore {
  const total = counts.reduce(
    (sum, item) => ({
      correct: sum.correct + item.correct,
      expected: sum.expected + item.expected,
      returned: sum.returned + item.returned,
    }),
    { correct: 0, expected: 0, returned: 0 },
  )
  return {
    ...total,
    recall: ratio(total.correct, total.expected),
    precision: ratio(total.correct, total.returned),
  }
}

/** Trefa: očekávaný termín je mezi dny navržených termínů. */
export function isTopProposalHit(expectedDate: DateString, proposals: Proposal[]): boolean {
  return proposals.some((proposal) => proposal.date === expectedDate)
}

export interface ShiftDiff {
  /** Očekávané směny, které model nevrátil. */
  missing: Shift[]
  /** Vrácené směny, které v očekávaných nejsou. */
  extra: Shift[]
}

export function diffShifts(expected: Shift[], actual: Shift[]): ShiftDiff {
  const unmatched = [...actual]
  const missing: Shift[] = []
  for (const shift of expected) {
    const index = unmatched.findIndex((candidate) => shiftKey(candidate) === shiftKey(shift))
    if (index === -1) missing.push(shift)
    else unmatched.splice(index, 1)
  }
  return { missing, extra: unmatched }
}
