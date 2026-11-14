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
  })
  .refine((shift) => shift.start !== shift.end, {
    message: 'Směna nemůže začínat a končit ve stejný čas',
    path: ['end'],
  })

/**
 * Rozpis jednoho člověka, jak ho vrací čtení podkladů.
 * Dny mimo rozsah coveredFrom–coveredTo neznáme (nejsou to volné dny).
 */
export const PersonScheduleSchema = z
  .object({
    coveredFrom: DateStringSchema,
    coveredTo: DateStringSchema,
    shifts: z.array(ShiftSchema),
    warnings: z.array(z.string()).default([]),
  })
  .refine((schedule) => schedule.coveredFrom <= schedule.coveredTo, {
    message: 'Rozsah rozpisu končí dřív, než začíná',
    path: ['coveredTo'],
  })

export const SourceFileKindSchema = z.enum(['xlsx', 'image', 'pdf', 'text'])

/** Podklad, který uživatel k člověku vložil. Obsah souboru se tu neukládá. */
export const SourceFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: SourceFileKindSchema,
})

/** Účastník akce. Rozpis je null, dokud se jeho podklady nepřečetly. */
export const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Jméno nesmí být prázdné'),
  files: z.array(SourceFileSchema),
  schedule: PersonScheduleSchema.nullable(),
})

/** Akce, pro kterou se hledá termín. */
export const ActionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, 'Název nesmí být prázdný'),
    /** Období, ve kterém se termín hledá (včetně obou krajních dnů). */
    from: DateStringSchema,
    to: DateStringSchema,
    /** Délka akce v minutách, po půlhodinách. */
    durationMinutes: z.number().int().positive().multipleOf(30),
    /** Denní okno, do kterého se akce musí vejít. */
    windowStart: TimeStringSchema,
    windowEnd: TimeStringSchema,
    people: z.array(PersonSchema),
  })
  .refine((action) => action.from <= action.to, {
    message: 'Období končí dřív, než začíná',
    path: ['to'],
  })
  .refine((action) => action.windowStart < action.windowEnd, {
    message: 'Denní okno končí dřív, než začíná',
    path: ['windowEnd'],
  })

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
export type Shift = z.infer<typeof ShiftSchema>
export type PersonSchedule = z.infer<typeof PersonScheduleSchema>
export type SourceFileKind = z.infer<typeof SourceFileKindSchema>
export type SourceFile = z.infer<typeof SourceFileSchema>
export type Person = z.infer<typeof PersonSchema>
export type Action = z.infer<typeof ActionSchema>
export type Proposal = z.infer<typeof ProposalSchema>
