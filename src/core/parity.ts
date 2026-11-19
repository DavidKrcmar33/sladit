import type { DateString, Parity } from './schema'
import { daysBetween, isoWeek, mondayOf } from './time'

/**
 * Lichý a sudý týden. Fakulty je počítají různě: podle čísla týdne v roce, nebo od prvního týdne výuky,
 * a přes přestávky ve výuce se počítání často začíná znovu. Proto platí jen to, co řekne podklad
 * („dle kalendáře“), nebo co potvrdí člověk, a potvrzení neplatí přes přestávku.
 */

export type WeekParity = 'odd' | 'even'

/**
 * Úsek výuky, ve kterém platí jedno potvrzení. Hranice jsou přestávky: Vánoce (23. 12. až 1. 1.),
 * konec ledna (zkouškové), léto. Vánoce nepatří do žádného úseku.
 */
export function paritySegment(date: DateString): string | null {
  const year = date.slice(0, 4)
  const monthDay = date.slice(5)
  if (monthDay >= '12-23' || monthDay <= '01-01') return null
  if (monthDay <= '01-31') return `${year}-leden`
  if (monthDay <= '06-30') return `${year}-jaro`
  if (monthDay <= '08-31') return `${year}-léto`
  return `${year}-podzim`
}

/** Potvrzení, které pro daný den platí. Když je jich v úseku víc, platí poslední. */
function anchorFor(parity: Parity, date: DateString) {
  const segment = paritySegment(date)
  if (segment === null) return null
  const matching = parity.anchors.filter((anchor) => paritySegment(anchor.date) === segment)
  return matching.at(-1) ?? null
}

/** Je týden s tímto dnem lichý, nebo sudý? Null, když to podklad neříká a člověk nepotvrdil. */
export function weekParity(parity: Parity, date: DateString): WeekParity | null {
  if (parity.calendar) return isoWeek(date) % 2 === 1 ? 'odd' : 'even'
  const anchor = anchorFor(parity, date)
  if (!anchor) return null
  const weeksApart = daysBetween(mondayOf(anchor.date), mondayOf(date)) / 7
  const sameAsAnchor = weeksApart % 2 === 0
  return anchor.odd === sameAsAnchor ? 'odd' : 'even'
}

/** Přidá potvrzení a nahradí dřívější ze stejného úseku. */
export function withAnchor(parity: Parity, date: DateString, odd: boolean): Parity {
  const segment = paritySegment(date)
  return {
    ...parity,
    anchors: [
      ...parity.anchors.filter((anchor) => paritySegment(anchor.date) !== segment),
      { date, odd },
    ],
  }
}
