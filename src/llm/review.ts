import { z } from 'zod'
import { czechHolidayName } from '@/core/holidays'
import { answeredQuestionIds, questionId, type SourceAnswer } from '@/core/review'
import {
  DateRangeSchema,
  type DateRange,
  type Shift,
  type SourceContent,
  type SourceQuestion,
} from '@/core/schema'
import { applyChecks, reconcile } from './checks'
import { expandReading, shortDate, type ExpandedShift, type Expansion } from './expand'
import { ReadingSchema, type Reading } from './reading'

/**
 * Doptání po čtení. Podklad se po každé odpovědi přepočítá znovu ze strukturálního čtení
 * a všech dosavadních odpovědí, takže výsledek nezávisí na pořadí kliknutí ani na tom,
 * zda odpověď přišla z tlačítka, nebo ji z věty sestavila AI.
 */

/** Co server u podkladu uloží, aby ho šlo po odpovědích přepočítat. Prohlížeč to nedostává. */
export const ReviewBasisSchema = z.object({
  /** Strukturální čtení: jedno, nebo dvě, když se kvůli nejistotě četlo podruhé. */
  readings: z.array(ReadingSchema).min(1).max(2),
  /** Hledané období při čtení. */
  period: DateRangeSchema,
  /** Upozornění, která nejsou z modelu (nepovedené druhé čtení). Jdou ke kontrolám. */
  extraWarnings: z.array(z.string()),
  /** Poznámky o tom, co se modelu neposlalo (skryté listy v Excelu). Jdou na konec. */
  notes: z.array(z.string()),
})

export type ReviewBasis = z.infer<typeof ReviewBasisSchema>

/** Přepočtený podklad: obsah zdroje bez okruhu a parity a k tomu otevřené otázky. */
export type BuiltSource = Pick<SourceContent, 'coverage' | 'shifts' | 'warnings'> & {
  questions: SourceQuestion[]
}

/** Víc otázek na nejisté bloky by okno doptání zahltilo. Další zůstanou označené v rozpisu. */
const MAX_SHIFT_QUESTIONS = 8
const MAX_HOLIDAYS_LISTED = 10

function blockKey(shift: Pick<Shift, 'raw' | 'start' | 'end'>): string {
  return `${shift.raw}|${shift.start}|${shift.end}`
}

/**
 * Poznámky modelu o chybějící platnosti („Podklad neuvádí období platnosti“). Model je píše
 * vlastními slovy, proto podle slov. Když platnost chybí, řekne to jednou program a zeptá se
 * na ni. Po odpovědi na období už neplatí vůbec.
 */
const PERIOD_NOTE = /platnost|obdob/i

/**
 * Poznámky modelu, které člověku nic neřeknou: že platnost končí dřív než hledané období
 * (aplikace to sama ukáže jako „nevíme“) a že jsou ve stejný čas dva předměty (blok je jeden
 * a člověk je obsazený tak jako tak). Starší čtení je ještě obsahují, proto podle slov.
 */
const NEEDLESS_NOTE = /hledan\S* obdob|stejn\S* čas.*(dva|dvě|více) předmět|vrácen jeden blok/i

/** Odpovědi, které mění samotné čtení: platnost a dny, kdy podklad neplatí. */
function patchReading(reading: Reading, answers: SourceAnswer[]): Reading {
  const useful = {
    ...reading,
    warnings: reading.warnings.filter((warning) => !NEEDLESS_NOTE.test(warning)),
  }
  let next = statesPeriod(useful)
    ? useful
    : { ...useful, warnings: useful.warnings.filter((warning) => !PERIOD_NOTE.test(warning)) }
  for (const answer of answers) {
    if (answer.kind === 'period') {
      next = {
        ...next,
        coverage: [answer.range],
        warnings: next.warnings.filter((warning) => !PERIOD_NOTE.test(warning)),
      }
    }
    if (answer.kind === 'days-off') {
      const off = new Set(answer.dates)
      next = {
        ...next,
        dated: next.dated.filter((entry) => !off.has(entry.date)),
        weekly: next.weekly.map((entry) => ({
          ...entry,
          exceptDates: [...new Set([...entry.exceptDates, ...answer.dates])].sort(),
        })),
      }
    }
  }
  return next
}

function isHolidayBlock(shift: ExpandedShift): boolean {
  return shift.origin === 'weekly' && czechHolidayName(shift.date) !== null
}

/** Odpovědi, které se týkají už rozepsaných směn: nejisté bloky a svátky. */
function patchShifts(expansion: Expansion, answers: SourceAnswer[]): Expansion {
  let shifts = expansion.shifts
  for (const answer of answers) {
    if (answer.kind === 'holiday' && !answer.applies) {
      shifts = shifts.filter((shift) => !isHolidayBlock(shift))
    }
    if (answer.kind !== 'shift') continue
    const key = blockKey(answer)
    const { change } = answer
    if (change.type === 'remove') {
      shifts = shifts.filter((shift) => blockKey(shift) !== key)
    } else {
      shifts = shifts.map((shift) => {
        if (blockKey(shift) !== key) return shift
        return change.type === 'time'
          ? { ...shift, start: change.start, end: change.end, uncertain: false }
          : { ...shift, uncertain: false }
      })
    }
  }
  return { ...expansion, shifts }
}

function statesPeriod(reading: Reading): boolean {
  return reading.coverage.some((range) => range.from <= range.to)
}

function findQuestions(
  basis: ReviewBasis,
  readings: Reading[],
  expansion: Expansion,
  answers: SourceAnswer[],
): SourceQuestion[] {
  const questions: SourceQuestion[] = []

  if (readings[0].weekly.length > 0 && !readings.some(statesPeriod)) {
    questions.push({ kind: 'period', assumed: basis.period })
  }

  const holidays = new Map<string, string>()
  for (const shift of expansion.shifts) {
    const name = shift.origin === 'weekly' ? czechHolidayName(shift.date) : null
    if (name) holidays.set(shift.date, name)
  }
  if (holidays.size > 0) {
    questions.push({
      kind: 'holiday',
      holidays: [...holidays.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, MAX_HOLIDAYS_LISTED)
        .map(([date, name]) => ({ date, name })),
    })
  }

  // Nejisté bloky se seskupí podle textu a časů: týdenní blok je v rozpisu mnohokrát.
  const groups = new Map<string, Extract<SourceQuestion, { kind: 'shift' }>>()
  for (const shift of expansion.shifts) {
    if (!shift.uncertain || shift.date < basis.period.from) continue
    const key = blockKey(shift)
    const group = groups.get(key)
    if (group) {
      group.count += 1
    } else {
      groups.set(key, {
        kind: 'shift',
        raw: shift.raw,
        label: shift.label,
        start: shift.start,
        end: shift.end,
        firstDate: shift.date,
        count: 1,
      })
    }
  }
  questions.push(
    ...[...groups.values()]
      .sort((a, b) => a.firstDate.localeCompare(b.firstDate))
      .slice(0, MAX_SHIFT_QUESTIONS),
  )

  const answered = answeredQuestionIds(answers)
  return questions.filter((question) => !answered.has(questionId(question)))
}

/**
 * Podklad ze čtení a odpovědí. Bez odpovědí dá totéž, co samotné čtení (extract.ts).
 * Odpovědi se použijí v pořadí, v jakém přišly: pozdější platnost přepíše dřívější.
 */
export function buildSource(basis: ReviewBasis, answers: SourceAnswer[]): BuiltSource {
  const { from, to } = basis.period
  const readings = basis.readings.map((reading) => patchReading(reading, answers))
  let expansion = expandReading(readings[0], from, to)
  if (readings[1]) expansion = reconcile(expansion, expandReading(readings[1], from, to)).expansion
  if (basis.extraWarnings.length > 0) {
    expansion = { ...expansion, warnings: [...expansion.warnings, ...basis.extraWarnings] }
  }
  expansion = patchShifts(expansion, answers)
  const questions = findQuestions(basis, readings, expansion, answers)
  const acceptHolidays = answers.some((answer) => answer.kind === 'holiday' && answer.applies)
  const checked = applyChecks(expansion, { acceptHolidays })
  return { ...checked, warnings: [...checked.warnings, ...basis.notes], questions }
}

function hull(ranges: DateRange[]): DateRange | null {
  if (ranges.length === 0) return null
  return {
    from: ranges.map((range) => range.from).sort()[0],
    to: ranges
      .map((range) => range.to)
      .sort()
      .at(-1)!,
  }
}

function describeRange(range: DateRange | null): string {
  return range ? `${shortDate(range.from)} – ${shortDate(range.to)}` : 'nic'
}

function shiftId(shift: Shift): string {
  return `${shift.date} ${shift.start} ${shift.end} ${shift.weeks ?? ''}`
}

function listDates(shifts: Shift[]): string {
  const dates = [...new Set(shifts.map((shift) => shortDate(shift.date)))]
  const shown = dates.slice(0, 4).join(', ')
  return dates.length > 4 ? `${shown} a další` : shown
}

/** Co se v rozpisu změní, česky a krátce. Ukáže se před potvrzením návrhu od AI. */
export function describeChanges(
  before: Pick<SourceContent, 'coverage' | 'shifts'>,
  after: Pick<SourceContent, 'coverage' | 'shifts'>,
): string[] {
  const changes: string[] = []
  const beforeRange = hull(before.coverage)
  const afterRange = hull(after.coverage)
  if (describeRange(beforeRange) !== describeRange(afterRange)) {
    changes.push(`Platnost: ${describeRange(beforeRange)} → ${describeRange(afterRange)}`)
  }
  const beforeIds = new Map(before.shifts.map((shift) => [shiftId(shift), shift]))
  const afterIds = new Map(after.shifts.map((shift) => [shiftId(shift), shift]))
  let removed = before.shifts.filter((shift) => !afterIds.has(shiftId(shift)))
  let added = after.shifts.filter((shift) => !beforeIds.has(shiftId(shift)))
  const confirmed = after.shifts.filter(
    (shift) => !shift.uncertain && beforeIds.get(shiftId(shift))?.uncertain,
  )
  // Směna, která ubyla, a jiná, která ve stejný den přibyla, je změna času.
  const retimed: Shift[] = []
  for (const shift of [...removed]) {
    const match = added.find((other) => other.date === shift.date)
    if (!match) continue
    retimed.push(match)
    removed = removed.filter((other) => other !== shift)
    added = added.filter((other) => other !== match)
  }
  if (retimed.length > 0) changes.push(`Změní se čas: ${retimed.length} (${listDates(retimed)})`)
  if (removed.length > 0) changes.push(`Ubude směn: ${removed.length} (${listDates(removed)})`)
  if (added.length > 0) changes.push(`Přibude směn: ${added.length} (${listDates(added)})`)
  if (confirmed.length > 0) changes.push(`Potvrdí se nejisté čtení: ${confirmed.length}`)
  return changes
}
