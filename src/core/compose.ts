import { clipRanges, intersectRanges, rangesOfDates, unionRanges } from './coverage'
import { paritySegment, weekParity, type WeekParity } from './parity'
import type {
  Action,
  DateRange,
  DateString,
  DayOverride,
  PersonSchedule,
  Shift,
  Source,
} from './schema'
import { addDays } from './time'

/**
 * Skládání rozpisu člověka z jeho zdrojů. Pravidla:
 * - Zdroje stejného okruhu se sčítají (listopad a prosinec, dvě verze téhož měsíce).
 * - Den je známý, jen když ho pokrývá každý okruh, který člověk má. Škola do 18. 12. a směny do 6. 12.
 *   dají po 6. 12. „nevíme“, ne volno.
 * - Ruční úprava pokrývá přesně svůj den a nahradí směny, které ten den začínají.
 * - Blok jen pro lichý nebo sudý týden platí podle nastavení zdroje. Dokud není jasné, který týden
 *   je který, počítá se v obou a je nejistý.
 */

export interface PersonSources {
  sources: Source[]
  overrides: DayOverride[]
}

export interface Period {
  from: DateString
  to: DateString
}

/** Člověk s hotovým rozpisem pro jednu akci, vstup plánovače a kalendáře. */
export interface ComposedPerson {
  id: string
  name: string
  /** Null, dokud nemá žádný přečtený podklad ani ruční úpravu. */
  schedule: PersonSchedule | null
}

/**
 * Okruh obsazenosti z Google Kalendáře. Kalendář jen přidává „nemůže“: jeho úseky blokují
 * i v ručně upravený den, ale pokrytí nemá, takže žádný den neudělá známým a nepočítá se mezi
 * okruhy, které musí den pokrýt.
 */
export const CALENDAR_CIRCLE = 'Kalendář z Googlu'

function isCalendar(source: Source): boolean {
  return source.circle === CALENDAR_CIRCLE
}

export const PARITY_WARNING =
  'Rozvrh má liché a sudé týdny a není potvrzené, který je který. Do potvrzení se počítá s oběma.'

function shortDate(date: DateString): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day}. ${month}.`
}

function shiftKey(shift: Shift): string {
  return `${shift.date} ${shift.start} ${shift.end} ${shift.weeks ?? ''}`
}

function compareShifts(a: Shift, b: Shift): number {
  return shiftKey(a).localeCompare(shiftKey(b))
}

interface ResolvedShifts {
  shifts: Shift[]
  /** Dny s blokem, u kterého není jasné, zda je lichý, nebo sudý týden. */
  unresolvedDates: DateString[]
}

/** Nechá jen bloky, které podle parity zdroje opravdu nastanou. */
function resolveParity(source: Source): ResolvedShifts {
  const shifts: Shift[] = []
  const unresolvedDates: DateString[] = []
  for (const shift of source.shifts) {
    if (!shift.weeks) {
      shifts.push(shift)
      continue
    }
    const parity = weekParity(source.parity, shift.date)
    if (parity === null) {
      shifts.push({ ...shift, uncertain: true })
      unresolvedDates.push(shift.date)
    } else if (parity === shift.weeks) {
      shifts.push(shift)
    }
  }
  return { shifts, unresolvedDates }
}

function groupByCircle(sources: Source[]): Map<string, Source[]> {
  const groups = new Map<string, Source[]>()
  for (const source of sources) {
    groups.set(source.circle, [...(groups.get(source.circle) ?? []), source])
  }
  return groups
}

/** Dny, které zná každý okruh. */
function knownDays(sources: Source[]): DateRange[] {
  const circles = [...groupByCircle(sources.filter((source) => !isCalendar(source))).values()].map(
    (group) => unionRanges(...group.map((source) => source.coverage)),
  )
  if (circles.length === 0) return []
  return circles.reduce((known, coverage) => intersectRanges(known, coverage))
}

function formatRanges(ranges: DateRange[]): string {
  return ranges
    .map((range) =>
      range.from === range.to
        ? shortDate(range.from)
        : `${shortDate(range.from)}–${shortDate(range.to)}`,
    )
    .join(', ')
}

/** Zdroje stejného okruhu, které pokrývají stejné dny. Může to být nová verze, nebo omyl. */
function overlapWarnings(sources: Source[], window: Period | undefined): string[] {
  const warnings: string[] = []
  for (const [circle, group] of groupByCircle(sources.filter((source) => !isCalendar(source)))) {
    const overlaps: DateRange[] = []
    group.forEach((source, index) => {
      for (const other of group.slice(index + 1)) {
        overlaps.push(...intersectRanges(source.coverage, other.coverage))
      }
    })
    const shown = window ? clipRanges(overlaps, window.from, window.to) : unionRanges(overlaps)
    if (shown.length > 0) {
      warnings.push(
        `Podklady v okruhu ${circle} pokrývají stejné dny (${formatRanges(shown)}). Směny z nich se sčítají. Když je novější podklad náhradou staršího, starší odeber.`,
      )
    }
  }
  return warnings
}

/** Stejná směna ze dvou zdrojů se počítá jednou. Nejistá je, když si nebyl jistý aspoň jeden zdroj. */
function withoutDuplicates(shifts: Shift[]): Shift[] {
  const unique = new Map<string, Shift>()
  for (const shift of shifts) {
    const existing = unique.get(shiftKey(shift))
    unique.set(
      shiftKey(shift),
      existing ? { ...existing, uncertain: existing.uncertain || shift.uncertain } : shift,
    )
  }
  return [...unique.values()].sort(compareShifts)
}

/**
 * Složí rozpis člověka. S obdobím vrátí jen to, co plánovač pro akci potřebuje:
 * období a den před ním i po něm (noční z předvečera, směna po půlnoci).
 */
export function composeSchedule(person: PersonSources, period?: Period): PersonSchedule | null {
  if (person.sources.length === 0 && person.overrides.length === 0) return null

  const documents = person.sources.filter((source) => !isCalendar(source))
  const resolved = documents.map(resolveParity)
  const overrideDates = new Set(person.overrides.map((override) => override.date))
  const shifts = withoutDuplicates([
    ...resolved
      .flatMap((result) => result.shifts)
      .filter((shift) => !overrideDates.has(shift.date)),
    ...person.overrides.flatMap((override) => override.shifts),
    // Kalendář platí i v ručně upravený den: ruční úprava opravuje podklad, ne schůzky.
    ...person.sources.filter(isCalendar).flatMap((source) => source.shifts),
  ])
  const coverage = unionRanges(knownDays(person.sources), rangesOfDates([...overrideDates]))

  const window = period ? { from: addDays(period.from, -1), to: addDays(period.to, 1) } : undefined
  const unresolved = resolved
    .flatMap((result) => result.unresolvedDates)
    .filter((date) => !overrideDates.has(date))
    .filter((date) => !period || (period.from <= date && date <= period.to))

  const warnings = [
    ...person.sources.flatMap((source) => source.warnings),
    ...overlapWarnings(person.sources, period),
    ...(unresolved.length > 0 ? [PARITY_WARNING] : []),
  ]

  return {
    coverage: window ? clipRanges(coverage, window.from, window.to) : coverage,
    shifts: window
      ? shifts.filter((shift) => window.from <= shift.date && shift.date <= window.to)
      : shifts,
    warnings: [...new Set(warnings)],
  }
}

/** Rozpisy všech lidí akce pro její období. */
export function composePeople(action: Action): ComposedPerson[] {
  const period = { from: action.from, to: action.to }
  return action.people.map((person) => ({
    id: person.id,
    name: person.name,
    schedule: composeSchedule(person, period),
  }))
}

/** Otázka „je tento týden lichý, nebo sudý?“ pro jeden zdroj a jeden úsek výuky v období akce. */
export interface ParityQuestion {
  personId: string
  personName: string
  sourceId: string
  /** První den s takovým blokem. Ptáme se na týden, ve kterém leží, a k němu se uloží odpověď. */
  date: DateString
  /** Odpověď, pokud už ji člověk dal. */
  answer: WeekParity | null
}

/**
 * Kde je potřeba potvrdit lichý a sudý týden: zdroje s takovými bloky v období akce, u kterých
 * to neříká podklad. Za každý úsek výuky jedna otázka na první týden, ve kterém blok je.
 */
export function findParityQuestions(action: Action): ParityQuestion[] {
  const questions: ParityQuestion[] = []
  for (const person of action.people) {
    for (const source of person.sources) {
      if (source.parity.calendar) continue
      const dates = source.shifts
        .filter((shift) => shift.weeks && action.from <= shift.date && shift.date <= action.to)
        .map((shift) => shift.date)
        .sort()
      const asked = new Set<string>()
      for (const date of dates) {
        const segment = paritySegment(date)
        if (segment === null || asked.has(segment)) continue
        asked.add(segment)
        questions.push({
          personId: person.id,
          personName: person.name,
          sourceId: source.id,
          date,
          answer: weekParity(source.parity, date),
        })
      }
    }
  }
  return questions
}
