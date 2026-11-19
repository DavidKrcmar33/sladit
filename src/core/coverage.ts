import type { DateRange, DateString } from './schema'
import { addDays } from './time'

/**
 * Práce s pokrytím: seznamy úseků dnů, o kterých rozpis něco říká.
 * Výsledek je vždy seřazený a úseky se nepřekrývají ani na sebe nenavazují.
 */

/** Seřadí úseky a spojí ty, které se překrývají nebo na sebe navazují. */
export function normalizeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from))
  const merged: DateRange[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && range.from <= addDays(last.to, 1)) {
      if (range.to > last.to) last.to = range.to
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function isCovered(ranges: DateRange[], date: DateString): boolean {
  return ranges.some((range) => range.from <= date && date <= range.to)
}

export function unionRanges(...lists: DateRange[][]): DateRange[] {
  return normalizeRanges(lists.flat())
}

/** Dny, které pokrývají oba seznamy. */
export function intersectRanges(a: DateRange[], b: DateRange[]): DateRange[] {
  const result: DateRange[] = []
  for (const left of normalizeRanges(a)) {
    for (const right of normalizeRanges(b)) {
      const from = left.from > right.from ? left.from : right.from
      const to = left.to < right.to ? left.to : right.to
      if (from <= to) result.push({ from, to })
    }
  }
  return normalizeRanges(result)
}

/** Část pokrytí mezi from a to (včetně). */
export function clipRanges(ranges: DateRange[], from: DateString, to: DateString): DateRange[] {
  return intersectRanges(ranges, [{ from, to }])
}

/** Úseky z jednotlivých dnů. */
export function rangesOfDates(dates: DateString[]): DateRange[] {
  return normalizeRanges(dates.map((date) => ({ from: date, to: date })))
}
