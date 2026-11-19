import { z } from 'zod'
import {
  ActionDetailsSchema,
  ActionSchema,
  DateStringSchema,
  DayOverrideSchema,
  ProposalSchema,
  ShiftSchema,
  SourceFileSchema,
  SourceSchema,
  TimeStringSchema,
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

/** Účastník akce, jehož rozpis přihlášený nevidí. Ví se o něm jen jméno. */
export const OtherParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
})

/** Pozvaný do akce a jak odpověděl. Do termínu se počítá až po přijetí. */
export const ActionInviteSchema = z.object({
  userId: z.string(),
  name: z.string(),
  status: z.enum(['invited', 'accepted', 'declined']),
})

/** Termín, který organizátor potvrdil. */
export const ConfirmedSlotSchema = z.object({
  date: DateStringSchema,
  start: TimeStringSchema,
  end: TimeStringSchema,
})

/** Akce s parametry a lidmi, kteří se jí účastní. */
export const ActionResourceSchema = z.object({
  id: z.string(),
  details: ActionDetailsSchema,
  /** Účastníci v pořadí: organizátor a ti, kdo pozvánku přijali. */
  participantIds: z.array(z.string()),
  /** Účastníci, jejichž rozpis přihlášený nevidí. */
  others: z.array(OtherParticipantSchema),
  /** Akci upravuje, zve do ní a potvrzuje termín jen organizátor. */
  isOrganizer: z.boolean(),
  organizerName: z.string(),
  /** Vztah přihlášeného k akci: pořádá ji, je pozvaný, nebo pozvánku přijal. */
  myStatus: z.enum(['organizer', 'invited', 'accepted']),
  invites: z.array(ActionInviteSchema),
  confirmed: ConfirmedSlotSchema.nullable(),
})

export const ActionsResponseSchema = z.object({ actions: z.array(ActionResourceSchema) })
export const ActionResponseSchema = z.object({ action: ActionResourceSchema })

const UserIdsSchema = z.array(z.string()).max(50, 'Najednou jde pozvat nejvýš 50 lidí')

export const CreateActionRequestSchema = z.object({
  details: ActionDetailsSchema,
  /** Koho rovnou pozvat: přátelé a lidé ze skupin, kde je organizátor členem. */
  inviteUserIds: UserIdsSchema.default([]),
})

export const InviteToActionRequestSchema = z.object({
  userIds: UserIdsSchema.min(1, 'Vyber, koho pozvat'),
})

export const RespondToActionRequestSchema = z.object({ accept: z.boolean() })

/** Stav dne vůči akci: může, nemůže, nevíme. Nic víc o cizím rozpisu server neprozradí. */
export const DayAttendanceSchema = z.enum(['available', 'busy', 'unknown'])

/**
 * Pohled na akci, ve které jsou lidé s rozpisem, který přihlášený nevidí. Návrhy a jejich
 * jistotu počítá server ze všech rozpisů. U cizích lidí vrací jen stav dne a u křehkého termínu
 * jen den, na kterém záleží, bez důvodu.
 */
export const ActionViewSchema = z.object({
  actionId: z.string(),
  dates: z.array(DateStringSchema),
  others: z.array(z.object({ personId: z.string(), days: z.array(DayAttendanceSchema) })),
  proposals: z.array(ProposalSchema),
  stability: z.object({
    winner: ProposalSchema.nullable(),
    certain: z.boolean(),
    pivots: z.array(
      z.object({
        personId: z.string(),
        dates: z.array(
          z.object({
            date: DateStringSchema,
            reason: z.enum(['missing', 'uncertain', 'private']),
          }),
        ),
      }),
    ),
  }),
})

export const ActionViewResponseSchema = z.object({ view: ActionViewSchema })

// Skupiny

export const GroupNameSchema = z.object({
  name: z.string().trim().min(1, 'Název nesmí být prázdný').max(60, 'Název je příliš dlouhý'),
})

/** Platný odkaz s pozvánkou. Samotný odkaz se ukáže jen jednou, při založení. */
export const InviteLinkSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
})

/** Člen skupiny. Ostatní o něm vidí jen jméno, e-mail ne. */
export const GroupMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  isOwner: z.boolean(),
  isYou: z.boolean(),
})

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Zakladatel zve, ruší pozvánky, odebírá členy a může skupinu smazat. */
  isOwner: z.boolean(),
  members: z.array(GroupMemberSchema),
  /** Platné pozvánky, jen pro zakladatele. */
  invites: z.array(InviteLinkSchema),
})

export const GroupsResponseSchema = z.object({ groups: z.array(GroupSchema) })
export const GroupResponseSchema = z.object({ group: GroupSchema })

export const CreateInviteResponseSchema = z.object({
  group: GroupSchema,
  invite: InviteLinkSchema,
  /** Odkaz s pozvánkou. Server ho neuloží, zná jen jeho otisk. */
  url: z.string(),
})

// Přátelé

/** Přítel. Vidí o sobě navzájem jen jméno, e-mail ne. */
export const FriendSchema = z.object({ userId: z.string(), name: z.string() })

export const FriendsResponseSchema = z.object({
  friends: z.array(FriendSchema),
  /** Moje platné osobní odkazy „přidej si mě do přátel“. */
  invites: z.array(InviteLinkSchema),
})

export const CreateFriendInviteResponseSchema = z.object({
  invite: InviteLinkSchema,
  url: z.string(),
})

// Odkaz s pozvánkou: do skupiny, nebo do přátel. Obojí má adresu /pozvanka/<token>.

export const InvitePreviewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('group'),
    groupId: z.string(),
    groupName: z.string(),
    ownerName: z.string(),
    memberCount: z.number(),
    isMember: z.boolean(),
  }),
  z.object({
    kind: z.literal('friend'),
    fromName: z.string(),
    isFriend: z.boolean(),
    /** Vlastní odkaz: sám sebe si do přátel přidat nejde. */
    isSelf: z.boolean(),
  }),
])

export const InvitePreviewResponseSchema = z.object({ invite: InvitePreviewSchema })

export const AcceptInviteResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('group'), group: GroupSchema }),
  z.object({ kind: z.literal('friend'), friend: FriendSchema }),
])

export const UpdateActionRequestSchema = z.object({ details: ActionDetailsSchema })

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

/**
 * Akce z prohlížeče (localStorage) k jednorázovému převzetí do účtu. Převezmou se jen parametry
 * akcí. Lidi z nich ne: každý si teď nahrává rozpis do svého účtu sám.
 */
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
export type OtherParticipant = z.infer<typeof OtherParticipantSchema>
export type ActionInvite = z.infer<typeof ActionInviteSchema>
export type ConfirmedSlot = z.infer<typeof ConfirmedSlotSchema>
export type Friend = z.infer<typeof FriendSchema>
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>
export type DayAttendance = z.infer<typeof DayAttendanceSchema>
export type ActionView = z.infer<typeof ActionViewSchema>
export type Group = z.infer<typeof GroupSchema>
export type InviteLink = z.infer<typeof InviteLinkSchema>
/** Starší název, totéž co InviteLink. */
export type GroupInvite = InviteLink
export type InvitePreview = z.infer<typeof InvitePreviewSchema>
export type ReadingRequest = z.infer<typeof ReadingRequestSchema>
export type UpdateSourceRequest = z.infer<typeof UpdateSourceRequestSchema>
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
