import { z } from 'zod'

/**
 * Sdílený tvar dat celé aplikace. Typy se odvozují odsud (z.infer) a nikde se nepíšou podruhé.
 * Změny jen po domluvě v týmu: stojí na tom výpočet termínů, čtení rozpisů, kalendář i měření.
 */

/** Datum jako text YYYY-MM-DD. Musí existovat v kalendáři (30. února neprojde). */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum musí být ve tvaru RRRR-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, 'Takové datum neexistuje')

/** Čas jako text HH:MM ve 24hodinovém formátu. */
export const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Čas musí být ve tvaru HH:MM')

/** Souvislý úsek dnů včetně obou krajních. */
export const DateRangeSchema = z
  .object({ from: DateStringSchema, to: DateStringSchema })
  .refine((range) => range.from <= range.to, {
    message: 'Úsek končí dřív, než začíná',
    path: ['to'],
  })

/**
 * Jedna směna. Když je konec dřív než začátek, směna končí další den (noční).
 * Den bez směny se neukládá, volno vyplývá z toho, že v daný den žádná směna není.
 */
export const ShiftSchema = z
  .object({
    /** Den, kdy směna začíná. */
    date: DateStringSchema,
    start: TimeStringSchema,
    end: TimeStringSchema,
    /** Označení směny, jak ho chceme ukazovat (R, O, N, …). */
    label: z.string(),
    /** Původní text z rozpisu, pro porovnání s podkladem. */
    raw: z.string().default(''),
    /** Model si čtením nebyl jistý. */
    uncertain: z.boolean().default(false),
    /** Kde v podkladu údaj je (buňka, řádek, strana), aby ho šlo dohledat. */
    source: z.string().optional(),
    /**
     * Blok z rozvrhu, který je jen v lichých, nebo jen v sudých týdnech. Čtení ho vypíše do obou
     * a který týden je který, rozhodne až nastavení zdroje (ParitySchema).
     */
    weeks: z.enum(['odd', 'even']).optional(),
  })
  .refine((shift) => shift.start !== shift.end, {
    message: 'Směna nemůže začínat a končit ve stejný čas',
    path: ['end'],
  })

/**
 * Rozpis jednoho člověka složený ze všech jeho zdrojů (compose.ts). Tohle dostává plánovač.
 * Dny mimo coverage neznáme, nejsou to volné dny.
 */
export const PersonScheduleSchema = z.object({
  /** Dny, o kterých rozpis něco říká. Úseků může být víc, mezery mezi nimi neznáme. */
  coverage: z.array(DateRangeSchema),
  shifts: z.array(ShiftSchema),
  warnings: z.array(z.string()).default([]),
})

export const SourceFileKindSchema = z.enum(['xlsx', 'image', 'pdf', 'text'])

/** Podklad, který uživatel k člověku vložil. Obsah souboru se tu neukládá. */
export const SourceFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: SourceFileKindSchema,
})

export const WORK_CIRCLE = 'Práce'
export const SCHOOL_CIRCLE = 'Škola'

/**
 * Okruh zdroje, třeba Práce nebo Škola. Zdroje stejného okruhu na sebe navazují (listopad a prosinec),
 * různé okruhy se doplňují. Den je známý, jen když ho pokrývá každý okruh, který člověk má.
 */
export const CircleSchema = z.string().trim().min(1, 'Okruh nesmí být prázdný')

/** Který týden je u zdroje lichý a který sudý. */
export const ParitySchema = z.object({
  /** Podklad sám říká, že se počítá podle kalendáře (číslo týdne v roce). */
  calendar: z.boolean().default(false),
  /** Potvrzení od člověka: týden s tímto dnem je lichý, nebo sudý. Platí do nejbližší přestávky ve výuce (parity.ts). */
  anchors: z.array(z.object({ date: DateStringSchema, odd: z.boolean() })).default([]),
})

/**
 * Otázka k přečtenému podkladu, na kterou odpoví jen člověk (doptání po čtení). Vzniká ze čtení
 * pravidly, ne modelem, a zmizí, když na ni člověk odpoví nebo ji přeskočí.
 */
export const SourceQuestionSchema = z.discriminatedUnion('kind', [
  /** Týdenní rozvrh bez data platnosti. Dokud člověk neodpoví, platí pro hledané období. */
  z.object({ kind: z.literal('period'), assumed: DateRangeSchema }),
  /** Nejistě přečtený blok: text z podkladu a časy, jak je model přečetl. */
  z.object({
    kind: z.literal('shift'),
    raw: z.string(),
    label: z.string(),
    start: TimeStringSchema,
    end: TimeStringSchema,
    firstDate: DateStringSchema,
    count: z.number().int().positive(),
  }),
  /** Pravidelný rozvrh vychází na státní svátky. */
  z.object({
    kind: z.literal('holiday'),
    holidays: z.array(z.object({ date: DateStringSchema, name: z.string() })).min(1),
  }),
])

/**
 * Jeden přečtený podklad (i víc souborů přečtených najednou), s vlastním pokrytím.
 * Směny se neořezávají na období akce, takže zdroj jde použít i pro jinou akci.
 */
export const SourceSchema = z.object({
  id: z.string().min(1),
  circle: CircleSchema,
  /** Soubory, ze kterých zdroj vznikl. Obsah se neukládá. */
  files: z.array(SourceFileSchema),
  coverage: z.array(DateRangeSchema),
  shifts: z.array(ShiftSchema),
  warnings: z.array(z.string()).default([]),
  parity: ParitySchema.default({ calendar: false, anchors: [] }),
  /**
   * Otevřené otázky doptání. Chybí u podkladů přečtených před doptáním a u obsazenosti
   * z kalendáře: k těm se doptat nejde.
   */
  questions: z.array(SourceQuestionSchema).optional(),
})

/** Ruční úprava jednoho dne. Pokrývá přesně ten den a nové čtení ji nepřepíše. */
export const DayOverrideSchema = z
  .object({
    date: DateStringSchema,
    /** Směny, které ten den začínají. Prázdný seznam znamená volno. */
    shifts: z.array(ShiftSchema),
  })
  .refine((override) => override.shifts.every((shift) => shift.date === override.date), {
    message: 'Všechny směny ruční úpravy musí začínat v upravovaný den',
    path: ['shifts'],
  })

/** Účastník akce. Rozpis se skládá z přečtených zdrojů a ručních úprav (compose.ts). */
export const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Jméno nesmí být prázdné'),
  /** Vložené podklady, které se ještě nečetly. */
  files: z.array(SourceFileSchema),
  sources: z.array(SourceSchema).default([]),
  overrides: z.array(DayOverrideSchema).default([]),
})

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Parametry akce, podle kterých se hledá termín. */
const actionFields = {
  name: z.string().trim().min(1, 'Název nesmí být prázdný'),
  /** Období, ve kterém se termín hledá (včetně obou krajních dnů). */
  from: DateStringSchema,
  to: DateStringSchema,
  /** Délka akce v minutách, po půlhodinách. */
  durationMinutes: z.number().int().positive().multipleOf(30),
  /** Denní okno, do kterého se akce musí vejít. */
  windowStart: TimeStringSchema,
  windowEnd: TimeStringSchema,
  /** Ideální začátek: ze dne se navrhne čas, který mu je nejblíž. Bez něj co nejdřív. */
  preferredStart: TimeStringSchema.optional(),
  /** Jiné denní okno pro sobotu a neděli. Bez něj platí i o víkendu `windowStart`–`windowEnd`. */
  weekendWindowStart: TimeStringSchema.optional(),
  weekendWindowEnd: TimeStringSchema.optional(),
  /** Nejmenší počet lidí, kteří musí moct. Termín s méně lidmi se nenavrhne. */
  minPeople: z.number().int().min(1, 'Aspoň 1 člověk').max(50).optional(),
}

type ActionFields = z.infer<z.ZodObject<typeof actionFields>>

/** Kontroly parametrů, společné pro akci i pro samotné parametry (formulář, API). */
const actionChecks = [
  {
    check: (action: ActionFields) => action.from <= action.to,
    message: 'Období končí dřív, než začíná',
    path: ['to'],
  },
  {
    check: (action: ActionFields) => action.windowStart < action.windowEnd,
    message: 'Denní okno končí dřív, než začíná',
    path: ['windowEnd'],
  },
  {
    check: (action: ActionFields) =>
      action.windowStart >= action.windowEnd ||
      minutesOf(action.windowEnd) - minutesOf(action.windowStart) >= action.durationMinutes,
    message: 'Akce se do denního okna nevejde',
    path: ['durationMinutes'],
  },
  {
    check: (action: ActionFields) =>
      (action.weekendWindowStart === undefined) === (action.weekendWindowEnd === undefined),
    message: 'Víkendové okno potřebuje začátek i konec',
    path: ['weekendWindowEnd'],
  },
  {
    check: (action: ActionFields) =>
      !action.weekendWindowStart ||
      !action.weekendWindowEnd ||
      (action.weekendWindowStart < action.weekendWindowEnd &&
        minutesOf(action.weekendWindowEnd) - minutesOf(action.weekendWindowStart) >=
          action.durationMinutes),
    message: 'Akce se do víkendového okna nevejde',
    path: ['weekendWindowEnd'],
  },
]

function withActionChecks<T extends ActionFields>(schema: z.ZodType<T>): z.ZodType<T> {
  return actionChecks.reduce<z.ZodType<T>>(
    (checked, { check, message, path }) => checked.refine(check, { message, path }),
    schema,
  )
}

export const ActionDetailsSchema = withActionChecks(z.object(actionFields))

/** Akce, pro kterou se hledá termín. */
export const ActionSchema = withActionChecks(
  z.object({ id: z.string().min(1), ...actionFields, people: z.array(PersonSchema) }),
)

/** Navržený termín. Seznamy obsahují id lidí. */
export const ProposalSchema = z.object({
  date: DateStringSchema,
  start: TimeStringSchema,
  end: TimeStringSchema,
  /** Kdo může. */
  available: z.array(z.string()),
  /** Kdo má směnu. */
  missing: z.array(z.string()),
  /** U koho rozpis ten den nepokrývá. */
  unknown: z.array(z.string()),
})

export type DateString = z.infer<typeof DateStringSchema>
export type TimeString = z.infer<typeof TimeStringSchema>
export type DateRange = z.infer<typeof DateRangeSchema>
export type Shift = z.infer<typeof ShiftSchema>
export type PersonSchedule = z.infer<typeof PersonScheduleSchema>
export type SourceFileKind = z.infer<typeof SourceFileKindSchema>
export type SourceFile = z.infer<typeof SourceFileSchema>
export type Parity = z.infer<typeof ParitySchema>
export type SourceQuestion = z.infer<typeof SourceQuestionSchema>
export type Source = z.infer<typeof SourceSchema>
/** Co vrací čtení podkladů: zdroj bez id a souborů, ty doplní ten, kdo čtení zadal. */
export type SourceContent = Omit<Source, 'id' | 'files'>
export type DayOverride = z.infer<typeof DayOverrideSchema>
export type Person = z.infer<typeof PersonSchema>
export type Action = z.infer<typeof ActionSchema>
/** Parametry akce bez lidí: podle nich se hledá termín. */
export type ActionParams = Pick<
  Action,
  | 'from'
  | 'to'
  | 'durationMinutes'
  | 'windowStart'
  | 'windowEnd'
  | 'preferredStart'
  | 'weekendWindowStart'
  | 'weekendWindowEnd'
  | 'minPeople'
>
/** Parametry akce včetně názvu, jak je zadává formulář. */
export type ActionDetails = z.infer<typeof ActionDetailsSchema>
export type Proposal = z.infer<typeof ProposalSchema>
