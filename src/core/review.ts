import { z } from 'zod'
import { DateRangeSchema, DateStringSchema, TimeStringSchema, type SourceQuestion } from './schema'
import { daysBetween } from './time'

/**
 * Odpovědi na doptání k přečtenému podkladu. Přijdou z tlačítek v okně doptání, nebo je z věty
 * napsané vlastními slovy sestaví AI (llm/clarify.ts). Na podklad je vždy použije kód
 * (llm/review.ts), AI rozpis sama nemění.
 */

/** Delší platnost nedává smysl a zbytečně by rozepisovala rozvrh na roky dopředu. */
export const MAX_PERIOD_DAYS = 400

const differentTimes = {
  message: 'Směna nemůže začínat a končit ve stejný čas',
  path: ['end'],
}

const ShiftChangeSchema = z.discriminatedUnion('type', [
  /** Přečteno správně. */
  z.object({ type: z.literal('correct') }),
  /** Není to směna ani blok, nemá se počítat. */
  z.object({ type: z.literal('remove') }),
  /** Správně je jiný čas. */
  z
    .object({ type: z.literal('time'), start: TimeStringSchema, end: TimeStringSchema })
    .refine((change) => change.start !== change.end, differentTimes),
])

export const SourceAnswerSchema = z.discriminatedUnion('kind', [
  /** Na jaké období podklad platí. */
  z.object({
    kind: z.literal('period'),
    range: DateRangeSchema.refine(
      (range) => daysBetween(range.from, range.to) <= MAX_PERIOD_DAYS,
      'Období je delší než rok',
    ),
  }),
  /** Nejistý blok podle textu a časů, jak je model přečetl. Platí pro všechny jeho výskyty. */
  z.object({
    kind: z.literal('shift'),
    raw: z.string().max(100),
    start: TimeStringSchema,
    end: TimeStringSchema,
    change: ShiftChangeSchema,
  }),
  /** Zda pravidelný rozvrh platí i ve státní svátky. */
  z.object({ kind: z.literal('holiday'), applies: z.boolean() }),
  /** Dny, kdy podklad neplatí (dovolená, volno). */
  z.object({ kind: z.literal('days-off'), dates: z.array(DateStringSchema).min(1).max(62) }),
  /** Člověk neví, otázka se už neukáže a podklad zůstane, jak byl přečtený. */
  z.object({ kind: z.literal('skip'), questionId: z.string().min(1).max(200) }),
])

export type SourceAnswer = z.infer<typeof SourceAnswerSchema>

export function shiftQuestionId(raw: string, start: string, end: string): string {
  return `shift:${raw}|${start}|${end}`
}

/** Stálý klíč otázky: podle něj se pozná, že na ni člověk už odpověděl. */
export function questionId(question: SourceQuestion): string {
  switch (question.kind) {
    case 'period':
      return 'period'
    case 'holiday':
      return 'holiday'
    case 'shift':
      return shiftQuestionId(question.raw, question.start, question.end)
  }
}

/** Na které otázky odpověď odpovídá (přeskočení se počítá taky). */
export function answeredQuestionIds(answers: SourceAnswer[]): Set<string> {
  const ids = new Set<string>()
  for (const answer of answers) {
    if (answer.kind === 'period') ids.add('period')
    if (answer.kind === 'holiday') ids.add('holiday')
    if (answer.kind === 'shift') ids.add(shiftQuestionId(answer.raw, answer.start, answer.end))
    if (answer.kind === 'skip') ids.add(answer.questionId)
  }
  return ids
}
