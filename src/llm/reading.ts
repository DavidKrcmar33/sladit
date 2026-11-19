import { z } from 'zod'
import { DateStringSchema, TimeStringSchema } from '@/core/schema'

/**
 * Strukturální čtení podkladu: to, co model v dokumentu vidí, ještě před převodem na konkrétní dny.
 * Opakování po týdnech, lichý a sudý týden nebo výjimky model jen popíše, na data je rozepisuje kód (expand.ts).
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const blockFields = {
  start: TimeStringSchema,
  end: TimeStringSchema,
  /** Jednotné označení (R, O, N, ŠK …). */
  label: z.string(),
  /** Přesný text nebo značka z podkladu. */
  raw: z.string(),
  uncertain: z.boolean(),
  /** Kde v podkladu údaj je: buňka, řádek, strana. */
  source: z.string(),
}

const differentTimes = {
  message: 'Blok nemůže začínat a končit ve stejný čas',
  path: ['end'],
}

/** Blok s konkrétním datem. */
export const DatedEntrySchema = z
  .object({
    date: DateStringSchema,
    /** Den v týdnu, jak je u data napsaný v podkladu. Slouží ke kontrole data. */
    weekday: z.enum([...WEEKDAYS, 'none']),
    ...blockFields,
  })
  .refine((entry) => entry.start !== entry.end, differentTimes)

/** Blok, který se opakuje každý týden ve stejný den. */
export const WeeklyEntrySchema = z
  .object({
    weekday: z.enum(WEEKDAYS),
    /** Každý týden, nebo jen liché či sudé týdny podle kalendáře. */
    weeks: z.enum(['every', 'odd', 'even']),
    /** Dny, kdy blok výjimečně odpadá. */
    exceptDates: z.array(DateStringSchema),
    ...blockFields,
  })
  .refine((entry) => entry.start !== entry.end, differentTimes)

export const ReadingSchema = z.object({
  /** Rozpoznání podkladu je první, aby si ho model ujasnil dřív, než začne číst. */
  documentKind: z.enum(['timetable', 'table', 'list', 'message', 'calendar', 'other']),
  readability: z.enum(['good', 'partial', 'unreadable']),
  people: z.enum(['one', 'many', 'unclear']),
  legend: z.string(),
  /** Podklad výslovně říká, že se lichý a sudý týden počítá podle kalendáře. Jinak to potvrdí člověk. */
  weekParity: z.enum(['calendar', 'unstated']),
  /** Období, která podklad pokrývá (platnost rozvrhu, měsíc tabulky). Prázdné, když to z podkladu nejde poznat. */
  coverage: z.array(z.object({ from: DateStringSchema, to: DateStringSchema })),
  dated: z.array(DatedEntrySchema),
  weekly: z.array(WeeklyEntrySchema),
  warnings: z.array(z.string()),
})

export type Weekday = (typeof WEEKDAYS)[number]
export type DatedEntry = z.infer<typeof DatedEntrySchema>
export type WeeklyEntry = z.infer<typeof WeeklyEntrySchema>
export type Reading = z.infer<typeof ReadingSchema>

export const readingJsonSchema: object = Object.fromEntries(
  Object.entries(z.toJSONSchema(ReadingSchema, { io: 'output' })).filter(
    ([key]) => key !== '$schema',
  ),
)
