import { intersectRanges, normalizeRanges, rangesOfDates } from '@/core/coverage'
import type { DateRange, DateString, Shift } from '@/core/schema'
import { eachDay, weekdayOf } from '@/core/time'
import { WEEKDAYS, type DatedEntry, type Reading, type WeeklyEntry } from './reading'

/** Směna s poznámkou, zda vznikla z konkrétního data, nebo z týdenního vzoru. Kontroly se podle toho liší. */
export interface ExpandedShift extends Shift {
  origin: 'dated' | 'weekly'
}

export interface Expansion {
  /** Dny, které podklad pokrývá. Neořezávají se na hledané období. */
  coverage: DateRange[]
  shifts: ExpandedShift[]
  warnings: string[]
  /** Hledané období, ke kterému se podklad četl (určuje rok a platnost rozvrhu bez data). */
  period: DateRange
  /** Podklad říká něco o hledaném období. Když ne, zdroj se uloží, ale v období nic nepřidá. */
  coversPeriod: boolean
}

export function shortDate(date: DateString): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day}. ${month}.`
}

function hull(ranges: DateRange[]): DateRange {
  return {
    from: ranges.map((range) => range.from).sort()[0],
    to: ranges
      .map((range) => range.to)
      .sort()
      .at(-1)!,
  }
}

function documentRanges(reading: Reading, period: DateRange, warnings: string[]): DateRange[] {
  const stated = reading.coverage.filter((range) => range.from <= range.to)
  if (stated.length > 0) return stated
  if (reading.weekly.length > 0) {
    warnings.push('Platnost rozpisu není v podkladu uvedena, počítá se s celým hledaným obdobím.')
    return [period]
  }
  if (reading.dated.length > 0) {
    return [hull(reading.dated.map((entry) => ({ from: entry.date, to: entry.date })))]
  }
  return []
}

function fromDated(entry: DatedEntry, warnings: string[]): ExpandedShift {
  const { date, weekday, start, end, label, raw, source } = entry
  const mismatch = weekday !== 'none' && WEEKDAYS[weekdayOf(date) - 1] !== weekday
  if (mismatch) {
    warnings.push(
      `${shortDate(date)}: v podkladu je u data jiný den v týdnu, než na který datum vychází.`,
    )
  }
  return {
    date,
    start,
    end,
    label,
    raw,
    source,
    uncertain: entry.uncertain || mismatch,
    origin: 'dated',
  }
}

function occursOn(entry: WeeklyEntry, date: DateString): boolean {
  return WEEKDAYS[weekdayOf(date) - 1] === entry.weekday && !entry.exceptDates.includes(date)
}

/**
 * Blok jen pro lichý nebo sudý týden se rozepíše do obou a dostane značku `weeks`.
 * Který týden je který, rozhodne až skládání rozpisu podle potvrzení (core/parity.ts).
 */
function fromWeekly(entry: WeeklyEntry, date: DateString): ExpandedShift {
  const { start, end, label, raw, source, uncertain, weeks } = entry
  return {
    date,
    start,
    end,
    label,
    raw,
    source,
    uncertain,
    ...(weeks === 'every' ? {} : { weeks }),
    origin: 'weekly',
  }
}

function compareShifts(a: Shift, b: Shift): number {
  return (
    a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end)
  )
}

/** Stejná směna ze dvou souborů se vrátí jednou. Nejistá je, když si nebyl jistý aspoň jeden zdroj. */
function withoutDuplicates(shifts: ExpandedShift[]): ExpandedShift[] {
  const unique = new Map<string, ExpandedShift>()
  for (const shift of shifts) {
    // Lichý a sudý blok ve stejný čas jsou dva různé bloky (každý týden jiný předmět).
    const key = `${shift.date} ${shift.start} ${shift.end} ${shift.weeks ?? ''}`
    const existing = unique.get(key)
    unique.set(
      key,
      existing ? { ...existing, uncertain: existing.uncertain || shift.uncertain } : shift,
    )
  }
  return [...unique.values()].sort(compareShifts)
}

/**
 * Převede strukturální čtení na směny s konkrétními daty. Celý podklad, ne jen hledané období:
 * noční z předvečera, další týden nebo jiná akce se tak obejdou bez nového čtení.
 * Počítání dnů, týdnů a výjimek dělá kód, protože v tom se modely pletou.
 */
export function expandReading(reading: Reading, from: DateString, to: DateString): Expansion {
  const period = { from, to }
  const warnings = [...reading.warnings]
  const ranges = documentRanges(reading, period, warnings)

  const shifts: ExpandedShift[] = reading.dated.map((entry) => fromDated(entry, warnings))
  // Vzor se opakuje jen ve dnech, které podklad opravdu pokrývá (platnost rozvrhu).
  for (const range of normalizeRanges(ranges)) {
    for (const date of eachDay(range.from, range.to)) {
      for (const entry of reading.weekly) {
        if (occursOn(entry, date)) shifts.push(fromWeekly(entry, date))
      }
    }
  }

  // Směna mimo uvedené období dokazuje, že podklad ten den pokrývá.
  const coverage = normalizeRanges([
    ...ranges,
    ...rangesOfDates(reading.dated.map((entry) => entry.date)),
  ])
  const coversPeriod = intersectRanges(coverage, [period]).length > 0
  if (!coversPeriod && coverage.length > 0) {
    const all = hull(coverage)
    warnings.push(
      `Podklad nepokrývá hledané období (pokrývá ${shortDate(all.from)} až ${shortDate(all.to)}).`,
    )
  }

  return { coverage, shifts: withoutDuplicates(shifts), warnings, period, coversPeriod }
}
