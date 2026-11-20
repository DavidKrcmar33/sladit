import { czechHolidayName } from '@/core/holidays'
import type { Shift, SourceContent } from '@/core/schema'
import { MINUTES_PER_DAY, absoluteMinutes, toMinutes } from '@/core/time'
import { shortDate, type ExpandedShift, type Expansion } from './expand'

const MAX_SHIFT_MINUTES = 16 * 60
const MAX_LISTED = 5

function durationMinutes(shift: Shift): number {
  const minutes = toMinutes(shift.end) - toMinutes(shift.start)
  return minutes > 0 ? minutes : minutes + MINUTES_PER_DAY
}

function interval(shift: Shift) {
  const start = absoluteMinutes(shift.date, shift.start)
  return { start, end: start + durationMinutes(shift) }
}

function timeRange(shift: Shift): string {
  return `${shift.start}–${shift.end}`
}

function shiftKey(shift: Shift): string {
  return `${shift.date} ${shift.start} ${shift.end} ${shift.weeks ?? ''}`
}

/** Blok jen pro lichý a blok jen pro sudý týden nikdy nenastanou spolu. */
function canCoincide(a: Shift, b: Shift): boolean {
  return !a.weeks || !b.weeks || a.weeks === b.weeks
}

function listed(items: string[]): string {
  const shown = items.slice(0, MAX_LISTED).join(', ')
  return items.length > MAX_LISTED ? `${shown} a další (${items.length - MAX_LISTED})` : shown
}

/** Směna bez interní poznámky o původu. */
function toShift(shift: ExpandedShift, uncertain: boolean): Shift {
  const { date, start, end, label, raw, source, weeks } = shift
  return { date, start, end, label, raw, uncertain, source, ...(weeks ? { weeks } : {}) }
}

/** Výsledek čtení po kontrolách: obsah zdroje bez okruhu a parity, ty doplní extract.ts. */
export type CheckedReading = Pick<SourceContent, 'coverage' | 'shifts' | 'warnings'>

/**
 * Pravidla, která nezávisí na modelu. Podezřelou směnu nemažou, jen ji označí jako nejistou
 * a napíšou proč, aby ji člověk zkontroloval.
 */
export function applyChecks(
  expansion: Expansion,
  /** Člověk potvrdil, že rozvrh platí i ve svátky (doptání): svátek už není podezřelý. */
  options: { acceptHolidays?: boolean } = {},
): CheckedReading {
  const warnings = [...expansion.warnings]
  const suspicious = new Set<number>()
  const holidays = new Map<string, string>()

  expansion.shifts.forEach((shift, index) => {
    if (durationMinutes(shift) > MAX_SHIFT_MINUTES) {
      suspicious.add(index)
      warnings.push(`${shortDate(shift.date)}: směna ${timeRange(shift)} je delší než 16 hodin.`)
    }
    const holiday =
      shift.origin === 'weekly' && !options.acceptHolidays ? czechHolidayName(shift.date) : null
    if (holiday) {
      suspicious.add(index)
      holidays.set(shift.date, `${shortDate(shift.date)} (${holiday})`)
    }
  })
  if (holidays.size > 0) {
    const days = [...holidays.entries()].sort().map(([, text]) => text)
    // Rozvrh na celý semestr trefí svátků víc, proto jedna věta za všechny.
    warnings.push(
      `Pravidelný rozvrh vychází na státní svátek: ${listed(days)}. Ten den nemusí platit.`,
    )
  }

  const overlaps: string[] = []
  expansion.shifts.forEach((shift, index) => {
    for (let other = index + 1; other < expansion.shifts.length; other++) {
      const a = interval(shift)
      const b = interval(expansion.shifts[other])
      if (a.start < b.end && b.start < a.end && canCoincide(shift, expansion.shifts[other])) {
        suspicious.add(index).add(other)
        overlaps.push(
          `${shortDate(shift.date)} ${timeRange(shift)} a ${timeRange(expansion.shifts[other])}`,
        )
      }
    }
  })
  if (overlaps.length > 0) warnings.push(`Směny se překrývají: ${listed(overlaps)}.`)

  const { period } = expansion
  const inPeriod = expansion.shifts.filter(
    (shift) => period.from <= shift.date && shift.date <= period.to,
  )
  if (expansion.coversPeriod && inPeriod.length === 0) {
    warnings.push('V hledaném období není žádná směna. Zkontroluj, že podklad odpovídá.')
  }

  return {
    coverage: expansion.coverage,
    shifts: expansion.shifts.map((shift, index) =>
      toShift(shift, shift.uncertain || suspicious.has(index)),
    ),
    warnings: [...new Set(warnings)],
  }
}

export interface Reconciliation {
  expansion: Expansion
  /** Počet směn, které našlo jen jedno ze dvou čtení. */
  disagreements: number
}

/**
 * Porovná dvě nezávislá čtení téhož podkladu. Na čem se shodnou, tomu se věří.
 * Co našlo jen jedno, zůstane, ale jako nejisté a s upozorněním.
 */
export function reconcile(first: Expansion, second: Expansion): Reconciliation {
  const secondByKey = new Map(second.shifts.map((shift) => [shiftKey(shift), shift]))
  const firstKeys = new Set(first.shifts.map(shiftKey))
  const disputed: ExpandedShift[] = []

  const shifts = first.shifts.map((shift) => {
    const match = secondByKey.get(shiftKey(shift))
    if (match) return { ...shift, uncertain: shift.uncertain && match.uncertain }
    disputed.push(shift)
    return { ...shift, uncertain: true }
  })
  for (const shift of second.shifts) {
    if (firstKeys.has(shiftKey(shift))) continue
    disputed.push(shift)
    shifts.push({ ...shift, uncertain: true })
  }
  shifts.sort((a, b) => shiftKey(a).localeCompare(shiftKey(b)))

  // Varování druhého čtení říkají totéž jinými slovy, proto se berou jen z prvního.
  const warnings = [...first.warnings]
  if (disputed.length > 0) {
    const items = disputed
      .sort((a, b) => shiftKey(a).localeCompare(shiftKey(b)))
      .map((shift) => `${shortDate(shift.date)} ${timeRange(shift)}`)
    warnings.push(`Dvě čtení se neshodla na směnách: ${listed(items)}.`)
  }

  return { expansion: { ...first, shifts, warnings }, disagreements: disputed.length }
}
