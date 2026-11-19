import { z } from 'zod'
import {
  ActionDetailsSchema,
  ActionSchema,
  DateStringSchema,
  DayOverrideSchema,
  ShiftSchema,
  SourceFileSchema,
  SourceSchema,
} from '@/core/schema'

/**
 * Tvar dat mezi prohlížečem a serverem. Oba konce je ověřují stejnými schématy:
 * server požadavky, prohlížeč odpovědi.
 */

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
})

export const MeResponseSchema = z.object({
  user: UserSchema.nullable(),
  /** Přihlášení přes falešný Google pro vývoj. V produkci nikdy. */
  fakeGoogle: z.boolean(),
})

/** Člověk, kterého vlastní přihlášený uživatel: on sám, nebo host, kterého přidal. Vidí o něm vše. */
export const OwnedPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  isSelf: z.boolean(),
  sources: z.array(SourceSchema),
  overrides: z.array(DayOverrideSchema),
})

export const PeopleResponseSchema = z.object({ people: z.array(OwnedPersonSchema) })
export const PersonResponseSchema = z.object({ person: OwnedPersonSchema })

export const PersonNameSchema = z.object({
  name: z.string().trim().min(1, 'Jméno nesmí být prázdné').max(80, 'Jméno je příliš dlouhé'),
})

/** Akce s parametry a lidmi, kteří se jí účastní. */
export const ActionResourceSchema = z.object({
  id: z.string(),
  details: ActionDetailsSchema,
  participantIds: z.array(z.string()),
})

export const ActionsResponseSchema = z.object({ actions: z.array(ActionResourceSchema) })
export const ActionResponseSchema = z.object({ action: ActionResourceSchema })

export const CreateActionRequestSchema = z.object({ details: ActionDetailsSchema })

export const UpdateActionRequestSchema = z.object({ details: ActionDetailsSchema })

/** Host přidaný do akce: člověk bez účtu, jehož rozpis spravuje ten, kdo ho přidal. */
export const AddGuestResponseSchema = z.object({
  person: OwnedPersonSchema,
  action: ActionResourceSchema,
})

/** Část podkladu připravená v prohlížeči (ingest.ts): text, nebo soubor v base64. */
export const ModelPartSchema = z.union([
  z.object({ text: z.string().max(300_000, 'Podklad je příliš dlouhý') }),
  z.object({
    inlineData: z.object({ mimeType: z.string(), data: z.string() }),
  }),
])

export const ReadingRequestSchema = z
  .object({
    from: DateStringSchema,
    to: DateStringSchema,
    /** Názvy souborů jen pro vlastníka rozpisu. Modelu se neposílají. */
    files: z.array(SourceFileSchema).min(1).max(6, 'Najednou jde přečíst nejvýš 6 souborů'),
    parts: z.array(z.object({ part: ModelPartSchema, notes: z.array(z.string()).max(10) })),
  })
  .refine((request) => request.files.length === request.parts.length, {
    message: 'Ke každému souboru patří jedna připravená část',
    path: ['parts'],
  })

export const ReadingResponseSchema = z.object({ person: OwnedPersonSchema })

export const UpdateSourceRequestSchema = z.object({
  circle: z.string().trim().min(1).max(40).optional(),
  /** Odpověď na otázku, zda je týden s tímto dnem lichý, nebo sudý. */
  weekParity: z.object({ date: DateStringSchema, odd: z.boolean() }).optional(),
})

export const SetOverrideRequestSchema = z.object({ shifts: z.array(ShiftSchema).max(10) })

/** Akce z prohlížeče (localStorage) k jednorázovému převzetí do účtu. */
export const ImportRequestSchema = z.object({ actions: z.array(ActionSchema).max(50) })
export const ImportResponseSchema = z.object({ imported: z.number() })

export const ErrorResponseSchema = z.object({
  error: z.string(),
  /** Strojový kód chyby, kde na něm prohlížeč něco mění. */
  code: z.string().optional(),
  /** U nečitelného podkladu: co se z něj modelu neposlalo. */
  notes: z.array(z.string()).optional(),
})

export type User = z.infer<typeof UserSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
export type OwnedPerson = z.infer<typeof OwnedPersonSchema>
export type ActionResource = z.infer<typeof ActionResourceSchema>
export type ReadingRequest = z.infer<typeof ReadingRequestSchema>
export type UpdateSourceRequest = z.infer<typeof UpdateSourceRequestSchema>
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
