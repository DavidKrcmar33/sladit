import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ActionInvite,
  ActionResource,
  ConfirmedSlot,
  Friend,
  Group,
  InviteLink,
  InvitePreview,
  OwnedPerson,
  User,
} from '@/contract/api'
import {
  DateRangeSchema,
  DayOverrideSchema,
  ParitySchema,
  ShiftSchema,
  SourceFileSchema,
  SourceQuestionSchema,
  type ActionDetails,
  type DayOverride,
  type Shift,
  type Source,
} from '@/core/schema'
import { CALENDAR_CIRCLE } from '@/core/compose'
import { SourceAnswerSchema, type SourceAnswer } from '@/core/review'
import { ReviewBasisSchema, type BuiltSource, type ReviewBasis } from '@/llm/review'
import type { Db } from './db'

/**
 * Všechny dotazy do databáze na jednom místě. Každá metoda, která čte nebo mění data člověka
 * nebo akce, dostává id přihlášeného a do dotazu ho dává jako podmínku. Cizí data tak nejde
 * přečíst ani změnit, ani když by trasa zapomněla na kontrolu.
 *
 * Jediná výjimka je `actionForView`: vrací rozpisy všech účastníků akce, aby server spočítal
 * návrhy. Smí ji volat jen výpočet pohledu (server/view.ts), který ven pustí jen tři stavy dne.
 */

/** Nejvíc členů ve skupině. Pozvánka je odkaz, který se může dostat dál, než měl. */
export const MAX_GROUP_MEMBERS = 50

/** Nejvíc uložených odpovědí u jednoho podkladu. Starší se zahodí, novější je přepíšou stejně. */
const MAX_ANSWERS = 100

/** Člověk v akci i s rozpisem. Jen pro výpočet na serveru, nikdy se neposílá celý ven. */
export interface ViewPerson extends OwnedPerson {
  ownerId: string
}

const SourceRowSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  circle: z.string(),
  files: z.array(SourceFileSchema),
  coverage: z.array(DateRangeSchema),
  shifts: z.array(ShiftSchema),
  warnings: z.array(z.string()),
  parity: ParitySchema,
  questions: z.array(SourceQuestionSchema).default([]),
  /** Podklad má uložené čtení, takže se k němu jde doptat (migrace 005). */
  reviewable: z.boolean().default(false),
})

const SOURCE_COLUMNS =
  's.id, s.person_id, s.circle, s.files, s.coverage, s.shifts, s.warnings, s.parity, s.questions, s.basis is not null as reviewable'

interface PersonRow {
  id: string
  name: string
  is_self: boolean
}

interface ActionRow {
  id: string
  owner_id: string
  organizer_name: string | null
  my_status: string | null
  name: string
  date_from: string
  date_to: string
  duration_minutes: number
  window_start: string
  window_end: string
  confirmed_date: string | null
  confirmed_start: string | null
  confirmed_end: string | null
  in_my_calendar: boolean | null
}

interface ParticipantRow {
  action_id: string
  id: string
  name: string
  owner_id: string
  is_self: boolean
}

interface InviteRow {
  id: string
  created_at: Date | string
  expires_at: Date | string
}

/** Akce viditelné uživateli: jeho vlastní a ty, kam je pozvaný a pozvánku neodmítl. */
const VISIBLE_ACTION = `(a.owner_id = $1 or exists (
  select 1 from action_invites ai
  where ai.action_id = a.id and ai.user_id = $1 and ai.status in ('invited', 'accepted')))`

const ACTION_COLUMNS = `a.*,
  (select name from people where owner_id = a.owner_id and is_self) as organizer_name,
  (select status from action_invites where action_id = a.id and user_id = $1) as my_status,
  exists (select 1 from calendar_events ce where ce.action_id = a.id and ce.user_id = $1) as in_my_calendar`

/** Dvojice v tabulce přátel: menší id první. */
function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

function toSource(row: unknown): Source {
  const { id, circle, files, coverage, shifts, warnings, parity, questions, reviewable } =
    SourceRowSchema.parse(row)
  return {
    id,
    circle,
    files,
    coverage,
    shifts,
    warnings,
    parity,
    ...(reviewable ? { questions } : {}),
  }
}

function isoTime(value: Date | string): string {
  return new Date(value).toISOString()
}

function toInvite(row: InviteRow): InviteLink {
  return { id: row.id, createdAt: isoTime(row.created_at), expiresAt: isoTime(row.expires_at) }
}

function toDetails(row: ActionRow): ActionDetails {
  return {
    name: row.name,
    from: row.date_from,
    to: row.date_to,
    durationMinutes: row.duration_minutes,
    windowStart: row.window_start,
    windowEnd: row.window_end,
  }
}

/** Připojený Google Kalendář jednoho uživatele. Token je zašifrovaný (server/crypto.ts). */
export interface CalendarConnection {
  userId: string
  refreshToken: string
  canWrite: boolean
  autoWrite: boolean
  status: 'ok' | 'expired'
  appCalendarId: string | null
  syncedAt: string | null
}

interface CalendarRow {
  user_id: string
  refresh_token: string
  can_write: boolean
  auto_write: boolean
  status: 'ok' | 'expired'
  app_calendar_id: string | null
  synced_at: Date | string | null
}

function toConnection(row: CalendarRow): CalendarConnection {
  return {
    userId: row.user_id,
    refreshToken: row.refresh_token,
    canWrite: row.can_write,
    autoWrite: row.auto_write,
    status: row.status,
    appCalendarId: row.app_calendar_id,
    syncedAt: row.synced_at ? isoTime(row.synced_at) : null,
  }
}

/** Obsazenost z kalendáře jako zdroj rozpisu (okruh, který jen přidává „nemůže“). */
function calendarSource(busy: unknown): Source {
  return {
    id: 'google-kalendar',
    circle: CALENDAR_CIRCLE,
    files: [],
    coverage: [],
    shifts: z.array(ShiftSchema).parse(busy),
    warnings: [],
    parity: { calendar: false, anchors: [] },
  }
}

function toConfirmed(row: ActionRow): ConfirmedSlot | null {
  return row.confirmed_date && row.confirmed_start && row.confirmed_end
    ? { date: row.confirmed_date, start: row.confirmed_start, end: row.confirmed_end }
    : null
}

export function createStore(db: Db) {
  /** Doplní lidem zdroje a ruční úpravy. Volající odpovídá za to, že lidi smí vidět. */
  async function withSchedules<T extends PersonRow>(
    rows: T[],
  ): Promise<(T & Pick<OwnedPerson, 'sources' | 'overrides'>)[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const sources = await db.query(
      `select ${SOURCE_COLUMNS} from sources s where s.person_id = any($1) order by s.position`,
      [ids],
    )
    const overrides = await db.query<{ person_id: string; date: string; shifts: unknown }>(
      'select person_id, date, shifts from day_overrides where person_id = any($1) order by date',
      [ids],
    )
    // Obsazenost z připojeného kalendáře. Jen u člověka „sám za sebe“ a jen platná.
    const calendars = await db.query<{ person_id: string; busy: unknown }>(
      `select p.id as person_id, c.busy from calendar_connections c
       join people p on p.owner_id = c.user_id and p.is_self
       where p.id = any($1) and c.status = 'ok' and jsonb_array_length(c.busy) > 0`,
      [ids],
    )
    return rows.map((row) => ({
      ...row,
      sources: [
        ...sources
          .filter((source) => source.person_id === row.id)
          .map((source) => toSource(source)),
        ...calendars
          .filter((calendar) => calendar.person_id === row.id)
          .map((calendar) => calendarSource(calendar.busy)),
      ],
      overrides: overrides
        .filter((override) => override.person_id === row.id)
        .map((override) =>
          DayOverrideSchema.parse({ date: override.date, shifts: override.shifts }),
        ),
    }))
  }

  async function peopleOf(ownerId: string, onlyIds?: string[]): Promise<OwnedPerson[]> {
    const rows = await db.query<PersonRow>(
      onlyIds
        ? 'select id, name, is_self from people where owner_id = $1 and id = any($2) order by is_self desc, position'
        : 'select id, name, is_self from people where owner_id = $1 order by is_self desc, position',
      onlyIds ? [ownerId, onlyIds] : [ownerId],
    )
    return (await withSchedules(rows)).map(({ id, name, is_self, sources, overrides }) => ({
      id,
      name,
      isSelf: is_self,
      sources,
      overrides,
    }))
  }

  async function personOf(ownerId: string, personId: string): Promise<OwnedPerson | null> {
    const [person] = await peopleOf(ownerId, [personId])
    return person ?? null
  }

  /** Účastníci akcí v pořadí: organizátor sám za sebe, pak ti, kdo pozvánku přijali. */
  async function participantsOf(actionIds: string[]): Promise<Map<string, ParticipantRow[]>> {
    const rows = await db.query<ParticipantRow>(
      `select action_id, id, name, owner_id, is_self from (
         select a.id as action_id, p.id, p.name, p.owner_id, p.is_self, 0 as part, 0 as position
         from actions a join people p on p.owner_id = a.owner_id and p.is_self
         where a.id = any($1)
         union all
         select ai.action_id, p.id, p.name, p.owner_id, p.is_self, 1, ai.position
         from action_invites ai join people p on p.owner_id = ai.user_id and p.is_self
         where ai.action_id = any($1) and ai.status = 'accepted'
       ) as participants order by action_id, part, position`,
      [actionIds],
    )
    const byAction = new Map<string, ParticipantRow[]>()
    for (const row of rows)
      byAction.set(row.action_id, [...(byAction.get(row.action_id) ?? []), row])
    return byAction
  }

  async function invitesOf(actionIds: string[]): Promise<Map<string, ActionInvite[]>> {
    const rows = await db.query<{
      action_id: string
      user_id: string
      name: string
      status: string
    }>(
      `select ai.action_id, ai.user_id, p.name, ai.status
       from action_invites ai join people p on p.owner_id = ai.user_id and p.is_self
       where ai.action_id = any($1) order by ai.position`,
      [actionIds],
    )
    const byAction = new Map<string, ActionInvite[]>()
    for (const row of rows) {
      const invite = {
        userId: row.user_id,
        name: row.name,
        status: row.status as ActionInvite['status'],
      }
      byAction.set(row.action_id, [...(byAction.get(row.action_id) ?? []), invite])
    }
    return byAction
  }

  function toResource(
    viewerId: string,
    row: ActionRow,
    participants: ParticipantRow[],
    invites: ActionInvite[],
  ): ActionResource {
    const isOrganizer = row.owner_id === viewerId
    return {
      id: row.id,
      details: toDetails(row),
      participantIds: participants.map((person) => person.id),
      // O lidech, které přihlášený nevlastní, se dozví jen jméno.
      others: participants
        .filter((person) => person.owner_id !== viewerId)
        .map((person) => ({ id: person.id, name: person.name })),
      isOrganizer,
      organizerName: row.organizer_name ?? '',
      myStatus: isOrganizer ? 'organizer' : row.my_status === 'accepted' ? 'accepted' : 'invited',
      invites,
      confirmed: toConfirmed(row),
      inMyCalendar: row.in_my_calendar ?? false,
    }
  }

  async function actionsOf(viewerId: string, onlyId?: string): Promise<ActionResource[]> {
    const rows = await db.query<ActionRow>(
      onlyId
        ? `select ${ACTION_COLUMNS} from actions a where ${VISIBLE_ACTION} and a.id = $2`
        : `select ${ACTION_COLUMNS} from actions a where ${VISIBLE_ACTION} order by a.position`,
      onlyId ? [viewerId, onlyId] : [viewerId],
    )
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const [participants, invites] = await Promise.all([participantsOf(ids), invitesOf(ids)])
    return rows.map((row) =>
      toResource(viewerId, row, participants.get(row.id) ?? [], invites.get(row.id) ?? []),
    )
  }

  async function isMember(tx: Db, userId: string, groupId: string, role?: 'owner') {
    const rows = await tx.query(
      role
        ? "select 1 from memberships where user_id = $1 and group_id = $2 and role = 'owner'"
        : 'select 1 from memberships where user_id = $1 and group_id = $2',
      [userId, groupId],
    )
    return rows.length > 0
  }

  /** Koho smí uživatel pozvat do akce: přátele a lidi ze skupin, kde je sám členem. */
  async function contactsAmong(tx: Db, userId: string, candidates: string[]): Promise<Set<string>> {
    if (candidates.length === 0) return new Set()
    const rows = await tx.query<{ id: string }>(
      `select u.id from users u where u.id = any($2) and u.id <> $1 and (
         exists (select 1 from friendships f
                 where (f.user_a = $1 and f.user_b = u.id) or (f.user_b = $1 and f.user_a = u.id))
         or exists (select 1 from memberships m1 join memberships m2 on m2.group_id = m1.group_id
                    where m1.user_id = $1 and m2.user_id = u.id))`,
      [userId, candidates],
    )
    return new Set(rows.map((row) => row.id))
  }

  /** Pozve lidi do akce. Kdo pozvánku dřív odmítl, dostane ji znovu. */
  async function invite(tx: Db, actionId: string, userIds: string[]) {
    for (const userId of userIds) {
      await tx.query(
        `insert into action_invites (action_id, user_id, status) values ($1, $2, 'invited')
         on conflict (action_id, user_id) do update set status = 'invited', responded_at = null
         where action_invites.status = 'declined'`,
        [actionId, userId],
      )
    }
  }

  /** Odchod ze skupiny. Zakladatel předá skupinu nejstaršímu členovi, poslední člen ji smaže. */
  async function leave(tx: Db, userId: string, groupId: string): Promise<boolean> {
    const [membership] = await tx.query<{ role: string }>(
      'delete from memberships where user_id = $1 and group_id = $2 returning role',
      [userId, groupId],
    )
    if (!membership) return false
    if (membership.role === 'owner') {
      const [next] = await tx.query(
        `update memberships set role = 'owner'
         where (group_id, user_id) = (select group_id, user_id from memberships where group_id = $1 order by position limit 1)
         returning user_id`,
        [groupId],
      )
      if (!next) await tx.query('delete from groups where id = $1', [groupId])
    }
    return true
  }

  async function groupsOf(userId: string, now: Date, onlyId?: string): Promise<Group[]> {
    const groups = await db.query<{ id: string; name: string; role: string }>(
      `select g.id, g.name, m.role from groups g join memberships m on m.group_id = g.id
       where m.user_id = $1 ${onlyId ? 'and g.id = $2' : ''} order by g.position`,
      onlyId ? [userId, onlyId] : [userId],
    )
    if (groups.length === 0) return []
    const ids = groups.map((group) => group.id)
    const members = await db.query<{
      group_id: string
      user_id: string
      role: string
      name: string
    }>(
      `select m.group_id, m.user_id, m.role, p.name from memberships m
       join people p on p.owner_id = m.user_id and p.is_self
       where m.group_id = any($1) order by m.position`,
      [ids],
    )
    // Pozvánky vidí jen zakladatel.
    const owned = groups.filter((group) => group.role === 'owner').map((group) => group.id)
    const invites = await db.query<InviteRow & { group_id: string }>(
      `select id, group_id, created_at, expires_at from invites
       where group_id = any($1) and revoked_at is null and expires_at > $2 order by created_at`,
      [owned, now.toISOString()],
    )
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      isOwner: group.role === 'owner',
      members: members
        .filter((member) => member.group_id === group.id)
        .map((member) => ({
          userId: member.user_id,
          name: member.name,
          isOwner: member.role === 'owner',
          isYou: member.user_id === userId,
        })),
      invites: invites.filter((item) => item.group_id === group.id).map((item) => toInvite(item)),
    }))
  }

  async function friendsOf(userId: string, now: Date) {
    const friends = await db.query<Friend>(
      `select p.owner_id as "userId", p.name from friendships f
       join people p on p.is_self and p.owner_id = case when f.user_a = $1 then f.user_b else f.user_a end
       where f.user_a = $1 or f.user_b = $1 order by p.name`,
      [userId],
    )
    const invites = await db.query<InviteRow>(
      `select id, created_at, expires_at from friend_invites
       where created_by = $1 and revoked_at is null and expires_at > $2 order by created_at`,
      [userId, now.toISOString()],
    )
    return { friends, invites: invites.map((row) => toInvite(row)) }
  }

  return {
    db,

    // Účty a relace

    /** Najde nebo založí uživatele podle účtu Google. Nový uživatel dostane i člověka sám za sebe. */
    async upsertUser(googleSub: string, email: string, name: string): Promise<User> {
      return db.transaction(async (tx) => {
        const [existing] = await tx.query<User>(
          'update users set email = $2, name = $3 where google_sub = $1 returning id, email, name',
          [googleSub, email, name],
        )
        if (existing) return existing
        const user = { id: randomUUID(), email, name }
        await tx.query('insert into users (id, google_sub, email, name) values ($1, $2, $3, $4)', [
          user.id,
          googleSub,
          email,
          name,
        ])
        await tx.query(
          'insert into people (id, owner_id, is_self, name) values ($1, $2, true, $3)',
          [randomUUID(), user.id, name],
        )
        return user
      })
    },

    async createSession(userId: string, tokenHash: string, expiresAt: Date) {
      await db.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [
        tokenHash,
        userId,
        expiresAt.toISOString(),
      ])
    },

    /** Uživatel podle relace. Platnost se porovná s hodinami serveru (v testech pevnými). */
    async userBySession(tokenHash: string, now: Date): Promise<User | null> {
      const [user] = await db.query<User>(
        'select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2',
        [tokenHash, now.toISOString()],
      )
      return user ?? null
    },

    async deleteSession(tokenHash: string) {
      await db.query('delete from sessions where token_hash = $1', [tokenHash])
    },

    /**
     * Smaže účet a kaskádou všechna jeho data: lidi, zdroje, úpravy, akce, relace, členství.
     * Skupiny, které založil, předá dalším členům.
     */
    async deleteUser(userId: string) {
      await db.transaction(async (tx) => {
        const groups = await tx.query<{ group_id: string }>(
          'select group_id from memberships where user_id = $1',
          [userId],
        )
        for (const group of groups) await leave(tx, userId, group.group_id)
        await tx.query('delete from users where id = $1', [userId])
      })
    },

    async saveOauthState(state: string, verifier: string, purpose: string, userId: string | null) {
      await db.query("delete from oauth_states where created_at < now() - interval '15 minutes'")
      await db.query(
        'insert into oauth_states (state, verifier, purpose, user_id) values ($1, $2, $3, $4)',
        [state, verifier, purpose, userId],
      )
    },

    /** Vrátí a hned smaže rozpracované přihlášení. Každý stav jde použít jen jednou. */
    async takeOauthState(state: string) {
      const [row] = await db.query<{ verifier: string; purpose: string; user_id: string | null }>(
        "delete from oauth_states where state = $1 and created_at > now() - interval '15 minutes' returning verifier, purpose, user_id",
        [state],
      )
      return row ?? null
    },

    // Rozpis

    peopleOf,
    personOf,

    async renamePerson(ownerId: string, personId: string, name: string): Promise<boolean> {
      const rows = await db.query(
        'update people set name = $3 where owner_id = $1 and id = $2 returning id',
        [ownerId, personId, name],
      )
      return rows.length > 0
    },

    /** Uloží přečtený podklad. Se strukturálním čtením (`basis`) se k němu jde později doptat. */
    async addSource(
      ownerId: string,
      personId: string,
      source: Source,
      basis: ReviewBasis | null = null,
    ): Promise<boolean> {
      const rows = await db.query(
        `insert into sources (id, person_id, circle, files, coverage, shifts, warnings, parity, basis, questions)
         select $3, p.id, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb
         from people p where p.owner_id = $1 and p.id = $2
         returning id`,
        [
          ownerId,
          personId,
          source.id,
          source.circle,
          json(source.files),
          json(source.coverage),
          json(source.shifts),
          json(source.warnings),
          json(source.parity),
          basis ? json(basis) : null,
          json(source.questions ?? []),
        ],
      )
      return rows.length > 0
    },

    /** Podklad i se čtením a dosavadními odpověďmi, pro doptání. Jen vlastníkův. */
    async sourceReview(
      ownerId: string,
      personId: string,
      sourceId: string,
    ): Promise<{ source: Source; basis: ReviewBasis | null; answers: SourceAnswer[] } | null> {
      const [row] = await db.query<{ basis: unknown; answers: unknown }>(
        `select ${SOURCE_COLUMNS}, s.basis, s.answers
         from sources s join people p on p.id = s.person_id
         where p.owner_id = $1 and s.person_id = $2 and s.id = $3`,
        [ownerId, personId, sourceId],
      )
      if (!row) return null
      return {
        source: toSource(row),
        basis: row.basis ? ReviewBasisSchema.parse(row.basis) : null,
        answers: z.array(SourceAnswerSchema).parse(row.answers),
      }
    },

    /**
     * Přidá odpovědi a uloží přepočtený podklad. Přepočet běží v transakci se zamčeným řádkem,
     * takže dvě odpovědi naráz se nepřepíšou.
     */
    async answerSource(
      ownerId: string,
      personId: string,
      sourceId: string,
      added: SourceAnswer[],
      build: (basis: ReviewBasis, answers: SourceAnswer[]) => BuiltSource,
    ): Promise<'saved' | 'missing' | 'not-reviewable'> {
      return db.transaction(async (tx) => {
        const [row] = await tx.query<{ basis: unknown; answers: unknown }>(
          `select s.basis, s.answers from sources s join people p on p.id = s.person_id
           where p.owner_id = $1 and s.person_id = $2 and s.id = $3 for update of s`,
          [ownerId, personId, sourceId],
        )
        if (!row) return 'missing' as const
        if (!row.basis) return 'not-reviewable' as const
        const answers = [...z.array(SourceAnswerSchema).parse(row.answers), ...added].slice(
          -MAX_ANSWERS,
        )
        const built = build(ReviewBasisSchema.parse(row.basis), answers)
        await tx.query(
          `update sources set coverage = $2::jsonb, shifts = $3::jsonb, warnings = $4::jsonb,
             questions = $5::jsonb, answers = $6::jsonb
           where id = $1`,
          [
            sourceId,
            json(built.coverage),
            json(built.shifts),
            json(built.warnings),
            json(built.questions),
            json(answers),
          ],
        )
        return 'saved' as const
      })
    },

    async updateSource(
      ownerId: string,
      personId: string,
      sourceId: string,
      update: (source: Source) => Source,
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [row] = await tx.query(
          `select ${SOURCE_COLUMNS}
           from sources s join people p on p.id = s.person_id
           where p.owner_id = $1 and s.person_id = $2 and s.id = $3 for update`,
          [ownerId, personId, sourceId],
        )
        if (!row) return false
        const next = update(toSource(row))
        await tx.query('update sources set circle = $2, parity = $3::jsonb where id = $1', [
          sourceId,
          next.circle,
          json(next.parity),
        ])
        return true
      })
    },

    async deleteSource(ownerId: string, personId: string, sourceId: string): Promise<boolean> {
      const rows = await db.query(
        `delete from sources s using people p
         where p.id = s.person_id and p.owner_id = $1 and s.person_id = $2 and s.id = $3
         returning s.id`,
        [ownerId, personId, sourceId],
      )
      return rows.length > 0
    },

    async setOverride(ownerId: string, personId: string, override: DayOverride): Promise<boolean> {
      const rows = await db.query(
        `insert into day_overrides (person_id, date, shifts)
         select p.id, $3, $4::jsonb from people p where p.owner_id = $1 and p.id = $2
         on conflict (person_id, date) do update set shifts = excluded.shifts
         returning date`,
        [ownerId, personId, override.date, json(override.shifts satisfies Shift[])],
      )
      return rows.length > 0
    },

    async deleteOverride(ownerId: string, personId: string, date: string): Promise<boolean> {
      const rows = await db.query(
        `delete from day_overrides d using people p
         where p.id = d.person_id and p.owner_id = $1 and d.person_id = $2 and d.date = $3
         returning d.date`,
        [ownerId, personId, date],
      )
      return rows.length > 0
    },

    // Akce

    actionsOf,

    /** Akce, kterou uživatel vidí: vlastní, nebo ta, kam je pozvaný. */
    async actionOf(viewerId: string, actionId: string): Promise<ActionResource | null> {
      const [action] = await actionsOf(viewerId, actionId)
      return action ?? null
    },

    /**
     * Akce i s rozpisy všech účastníků, pokud ji uživatel vidí. Jen pro výpočet pohledu
     * (server/view.ts), rozpisy cizích lidí se nesmí poslat ven.
     */
    async actionForView(
      viewerId: string,
      actionId: string,
    ): Promise<{ action: ActionResource; people: ViewPerson[] } | null> {
      const [row] = await db.query<ActionRow>(
        `select ${ACTION_COLUMNS} from actions a where ${VISIBLE_ACTION} and a.id = $2`,
        [viewerId, actionId],
      )
      if (!row) return null
      const [participantMap, inviteMap] = await Promise.all([
        participantsOf([row.id]),
        invitesOf([row.id]),
      ])
      const participants = participantMap.get(row.id) ?? []
      const people = await withSchedules(participants)
      return {
        action: toResource(viewerId, row, participants, inviteMap.get(row.id) ?? []),
        people: people.map(({ id, name, is_self, owner_id, sources, overrides }) => ({
          id,
          name,
          isSelf: is_self,
          ownerId: owner_id,
          sources,
          overrides,
        })),
      }
    },

    /**
     * Založí akci a rovnou pozve vybrané lidi. Pozvat jde jen přátele a lidi ze skupin,
     * kde je organizátor členem. Organizátor se akce účastní vždy.
     */
    async createAction(
      ownerId: string,
      details: ActionDetails,
      inviteUserIds: string[] = [],
    ): Promise<ActionResource | 'not-contact'> {
      const id = await db.transaction(async (tx) => {
        const wanted = [...new Set(inviteUserIds)].filter((userId) => userId !== ownerId)
        const allowed = await contactsAmong(tx, ownerId, wanted)
        if (wanted.some((userId) => !allowed.has(userId))) return null
        const actionId = randomUUID()
        await tx.query(
          `insert into actions (id, owner_id, name, date_from, date_to, duration_minutes, window_start, window_end)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            actionId,
            ownerId,
            details.name,
            details.from,
            details.to,
            details.durationMinutes,
            details.windowStart,
            details.windowEnd,
          ],
        )
        await invite(tx, actionId, wanted)
        return actionId
      })
      if (!id) return 'not-contact'
      const [action] = await actionsOf(ownerId, id)
      return action!
    },

    /** Změní parametry. Potvrzený termín zmizí, když se změní období, délka nebo denní okno. */
    async updateAction(
      ownerId: string,
      actionId: string,
      details: ActionDetails,
    ): Promise<boolean> {
      const rows = await db.query(
        `update actions set
           confirmed_date = case when (date_from, date_to, duration_minutes, window_start, window_end)
             = ($4, $5, $6, $7, $8) then confirmed_date end,
           confirmed_start = case when (date_from, date_to, duration_minutes, window_start, window_end)
             = ($4, $5, $6, $7, $8) then confirmed_start end,
           confirmed_end = case when (date_from, date_to, duration_minutes, window_start, window_end)
             = ($4, $5, $6, $7, $8) then confirmed_end end,
           name = $3, date_from = $4, date_to = $5, duration_minutes = $6,
           window_start = $7, window_end = $8
         where owner_id = $1 and id = $2 returning id`,
        [
          ownerId,
          actionId,
          details.name,
          details.from,
          details.to,
          details.durationMinutes,
          details.windowStart,
          details.windowEnd,
        ],
      )
      return rows.length > 0
    },

    async deleteAction(ownerId: string, actionId: string): Promise<boolean> {
      const rows = await db.query(
        'delete from actions where owner_id = $1 and id = $2 returning id',
        [ownerId, actionId],
      )
      return rows.length > 0
    },

    /** Pozve další lidi. Smí jen organizátor a jen přátele a lidi ze svých skupin. */
    async inviteToAction(
      ownerId: string,
      actionId: string,
      userIds: string[],
    ): Promise<'ok' | 'not-found' | 'not-contact'> {
      return db.transaction(async (tx) => {
        const [action] = await tx.query('select id from actions where owner_id = $1 and id = $2', [
          ownerId,
          actionId,
        ])
        if (!action) return 'not-found'
        const wanted = [...new Set(userIds)].filter((userId) => userId !== ownerId)
        const allowed = await contactsAmong(tx, ownerId, wanted)
        if (wanted.some((userId) => !allowed.has(userId))) return 'not-contact'
        await invite(tx, actionId, wanted)
        return 'ok'
      })
    },

    /** Organizátor zruší pozvánku nebo odebere účastníka. */
    async cancelInvite(ownerId: string, actionId: string, userId: string): Promise<boolean> {
      const rows = await db.query(
        `delete from action_invites ai using actions a
         where a.id = ai.action_id and a.owner_id = $1 and ai.action_id = $2 and ai.user_id = $3
         returning ai.user_id`,
        [ownerId, actionId, userId],
      )
      return rows.length > 0
    },

    /** Pozvaný přijme, nebo odmítne. Přijatou pozvánku jde později odmítnout (odchod z akce). */
    async respondToAction(userId: string, actionId: string, accept: boolean): Promise<boolean> {
      const rows = await db.query(
        `update action_invites set status = $3, responded_at = now()
         where action_id = $2 and user_id = $1 and status in ('invited', 'accepted')
         returning action_id`,
        [userId, actionId, accept ? 'accepted' : 'declined'],
      )
      return rows.length > 0
    },

    /** Potvrdí termín, nebo ho zruší (null). Smí jen organizátor. */
    async confirmAction(
      ownerId: string,
      actionId: string,
      slot: ConfirmedSlot | null,
    ): Promise<boolean> {
      const rows = await db.query(
        `update actions set confirmed_date = $3, confirmed_start = $4, confirmed_end = $5
         where owner_id = $1 and id = $2 returning id`,
        [ownerId, actionId, slot?.date ?? null, slot?.start ?? null, slot?.end ?? null],
      )
      return rows.length > 0
    },

    // Přátelé

    friendsOf,

    async createFriendInvite(
      userId: string,
      tokenHash: string,
      expiresAt: Date,
    ): Promise<InviteLink> {
      const [row] = await db.query<InviteRow>(
        `insert into friend_invites (id, token_hash, created_by, expires_at)
         values ($1, $2, $3, $4) returning id, created_at, expires_at`,
        [randomUUID(), tokenHash, userId, expiresAt.toISOString()],
      )
      return toInvite(row)
    },

    async revokeFriendInvite(userId: string, inviteId: string): Promise<boolean> {
      const rows = await db.query(
        `update friend_invites set revoked_at = now()
         where id = $2 and created_by = $1 and revoked_at is null returning id`,
        [userId, inviteId],
      )
      return rows.length > 0
    },

    /** Zruší přátelství z obou stran. Akce, kam se už pozvali, zůstávají. */
    async removeFriend(userId: string, friendId: string): Promise<boolean> {
      const [a, b] = pair(userId, friendId)
      const rows = await db.query(
        'delete from friendships where user_a = $1 and user_b = $2 returning user_a',
        [a, b],
      )
      return rows.length > 0
    },

    // Skupiny

    groupsOf,

    async groupOf(userId: string, groupId: string, now: Date): Promise<Group | null> {
      const [group] = await groupsOf(userId, now, groupId)
      return group ?? null
    },

    /** Založí skupinu. Kdo ji založí, je její zakladatel. */
    async createGroup(userId: string, name: string): Promise<string> {
      return db.transaction(async (tx) => {
        const id = randomUUID()
        await tx.query('insert into groups (id, name) values ($1, $2)', [id, name])
        await tx.query(
          "insert into memberships (group_id, user_id, role) values ($1, $2, 'owner')",
          [id, userId],
        )
        return id
      })
    },

    /** Smaže skupinu. Akce zůstávají, skupina je jen seznam lidí. Smí jen zakladatel. */
    async deleteGroup(ownerId: string, groupId: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return false
        await tx.query('delete from groups where id = $1', [groupId])
        return true
      })
    },

    async leaveGroup(userId: string, groupId: string): Promise<boolean> {
      return db.transaction((tx) => leave(tx, userId, groupId))
    },

    /**
     * Zakladatel přidá do skupiny přítele rovnou, bez odkazu. Kdo už členem je, zůstane.
     * Přidat jde jen vlastní přátele, ne kohokoli podle id.
     */
    async addMember(
      ownerId: string,
      groupId: string,
      userId: string,
    ): Promise<'added' | 'not-owner' | 'not-friend' | 'full'> {
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return 'not-owner' as const
        const [a, b] = pair(ownerId, userId)
        const friends = await tx.query(
          'select 1 from friendships where user_a = $1 and user_b = $2',
          [a, b],
        )
        if (ownerId === userId || friends.length === 0) return 'not-friend' as const
        if (await isMember(tx, userId, groupId)) return 'added' as const
        const [count] = await tx.query<{ count: number | string }>(
          'select count(*) as count from memberships where group_id = $1',
          [groupId],
        )
        if (Number(count?.count ?? 0) >= MAX_GROUP_MEMBERS) return 'full' as const
        await tx.query(
          "insert into memberships (group_id, user_id, role) values ($1, $2, 'member')",
          [groupId, userId],
        )
        return 'added' as const
      })
    },

    /** Zakladatel odebere člena. Sám sebe odebrat nemůže, na to je odchod. */
    async removeMember(ownerId: string, groupId: string, userId: string): Promise<boolean> {
      if (ownerId === userId) return false
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return false
        return leave(tx, userId, groupId)
      })
    },

    /** Uloží otisk nové pozvánky do skupiny. Smí jen zakladatel. */
    async createInvite(
      ownerId: string,
      groupId: string,
      tokenHash: string,
      expiresAt: Date,
    ): Promise<InviteLink | null> {
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return null
        const [row] = await tx.query<InviteRow>(
          `insert into invites (id, token_hash, group_id, created_by, expires_at)
           values ($1, $2, $3, $4, $5) returning id, created_at, expires_at`,
          [randomUUID(), tokenHash, groupId, ownerId, expiresAt.toISOString()],
        )
        return toInvite(row)
      })
    },

    async revokeInvite(ownerId: string, groupId: string, inviteId: string): Promise<boolean> {
      const rows = await db.query(
        `update invites set revoked_at = now()
         where id = $3 and group_id = $2 and revoked_at is null
           and exists (select 1 from memberships where user_id = $1 and group_id = $2 and role = 'owner')
         returning id`,
        [ownerId, groupId, inviteId],
      )
      return rows.length > 0
    },

    // Odkazy s pozvánkou: do skupiny, nebo do přátel

    /** Co pozvaný uvidí před přijetím. Neplatný, zrušený nebo vypršelý odkaz vrátí null. */
    async invitePreview(
      userId: string,
      tokenHash: string,
      now: Date,
    ): Promise<InvitePreview | null> {
      const [group] = await db.query<{
        group_id: string
        group_name: string
        owner_name: string | null
        member_count: number | string
        is_member: boolean
      }>(
        `select g.id as group_id, g.name as group_name,
           (select p.name from memberships m join people p on p.owner_id = m.user_id and p.is_self
            where m.group_id = g.id and m.role = 'owner') as owner_name,
           (select count(*) from memberships m where m.group_id = g.id) as member_count,
           exists (select 1 from memberships m where m.group_id = g.id and m.user_id = $3) as is_member
         from invites i join groups g on g.id = i.group_id
         where i.token_hash = $1 and i.revoked_at is null and i.expires_at > $2`,
        [tokenHash, now.toISOString(), userId],
      )
      if (group) {
        return {
          kind: 'group',
          groupId: group.group_id,
          groupName: group.group_name,
          ownerName: group.owner_name ?? '',
          memberCount: Number(group.member_count),
          isMember: group.is_member,
        }
      }
      const [friend] = await db.query<{ created_by: string; from_name: string | null }>(
        `select fi.created_by,
           (select name from people where owner_id = fi.created_by and is_self) as from_name
         from friend_invites fi
         where fi.token_hash = $1 and fi.revoked_at is null and fi.expires_at > $2`,
        [tokenHash, now.toISOString()],
      )
      if (!friend) return null
      const [a, b] = pair(userId, friend.created_by)
      const existing = await db.query(
        'select 1 from friendships where user_a = $1 and user_b = $2',
        [a, b],
      )
      return {
        kind: 'friend',
        fromName: friend.from_name ?? '',
        isFriend: existing.length > 0,
        isSelf: friend.created_by === userId,
      }
    },

    /** Přijme odkaz: přidá do skupiny, nebo do přátel. Vrací výsledek, nebo důvod odmítnutí. */
    async acceptInvite(
      userId: string,
      tokenHash: string,
      now: Date,
    ): Promise<
      | { kind: 'group'; groupId: string }
      | { kind: 'friend'; friendId: string }
      | 'invalid'
      | 'full'
      | 'self'
    > {
      return db.transaction(async (tx) => {
        const [group] = await tx.query<{ group_id: string }>(
          `select group_id from invites
           where token_hash = $1 and revoked_at is null and expires_at > $2 for update`,
          [tokenHash, now.toISOString()],
        )
        if (group) {
          if (await isMember(tx, userId, group.group_id)) {
            return { kind: 'group' as const, groupId: group.group_id }
          }
          const [count] = await tx.query<{ count: number | string }>(
            'select count(*) as count from memberships where group_id = $1',
            [group.group_id],
          )
          if (Number(count?.count ?? 0) >= MAX_GROUP_MEMBERS) return 'full' as const
          await tx.query(
            "insert into memberships (group_id, user_id, role) values ($1, $2, 'member')",
            [group.group_id, userId],
          )
          return { kind: 'group' as const, groupId: group.group_id }
        }
        const [friend] = await tx.query<{ created_by: string }>(
          `select created_by from friend_invites
           where token_hash = $1 and revoked_at is null and expires_at > $2`,
          [tokenHash, now.toISOString()],
        )
        if (!friend) return 'invalid' as const
        if (friend.created_by === userId) return 'self' as const
        const [a, b] = pair(userId, friend.created_by)
        await tx.query(
          'insert into friendships (user_a, user_b) values ($1, $2) on conflict do nothing',
          [a, b],
        )
        return { kind: 'friend' as const, friendId: friend.created_by }
      })
    },

    /** Přítel podle id, pokud jím opravdu je. */
    async friendOf(userId: string, friendId: string): Promise<Friend | null> {
      const [a, b] = pair(userId, friendId)
      const [row] = await db.query<Friend>(
        `select p.owner_id as "userId", p.name from friendships f
         join people p on p.owner_id = $3 and p.is_self
         where f.user_a = $1 and f.user_b = $2`,
        [a, b, friendId],
      )
      return row ?? null
    },

    // Google Kalendář

    async calendarConnection(userId: string): Promise<CalendarConnection | null> {
      const [row] = await db.query<CalendarRow>(
        'select * from calendar_connections where user_id = $1',
        [userId],
      )
      return row ? toConnection(row) : null
    },

    async calendarConnections(userIds: string[]): Promise<CalendarConnection[]> {
      const rows = await db.query<CalendarRow>(
        'select * from calendar_connections where user_id = any($1)',
        [userIds],
      )
      return rows.map(toConnection)
    },

    /** Uloží nové připojení. Při opětovném připojení zůstane volba zápisu i kalendář Sladit. */
    async saveCalendarConnection(userId: string, refreshToken: string, canWrite: boolean) {
      await db.query(
        `insert into calendar_connections (user_id, refresh_token, can_write)
         values ($1, $2, $3)
         on conflict (user_id) do update set refresh_token = excluded.refresh_token,
           can_write = excluded.can_write, status = 'ok', synced_at = null`,
        [userId, refreshToken, canWrite],
      )
    },

    async updateCalendar(
      userId: string,
      change: {
        autoWrite?: boolean
        status?: 'ok' | 'expired'
        busy?: Shift[]
        syncedAt?: Date
        appCalendarId?: string | null
      },
    ) {
      await db.query(
        `update calendar_connections set
           auto_write = coalesce($2, auto_write),
           status = coalesce($3, status),
           busy = coalesce($4::jsonb, busy),
           synced_at = coalesce($5, synced_at),
           app_calendar_id = case when $6 then $7 else app_calendar_id end
         where user_id = $1`,
        [
          userId,
          change.autoWrite ?? null,
          change.status ?? null,
          change.busy ? json(change.busy) : null,
          change.syncedAt?.toISOString() ?? null,
          change.appCalendarId !== undefined,
          change.appCalendarId ?? null,
        ],
      )
    },

    async deleteCalendarConnection(userId: string) {
      await db.query('delete from calendar_connections where user_id = $1', [userId])
      await db.query('delete from calendar_events where user_id = $1', [userId])
    },

    async calendarEvents(
      actionId: string,
    ): Promise<{ userId: string; calendarId: string; eventId: string }[]> {
      return db.query(
        `select user_id as "userId", calendar_id as "calendarId", event_id as "eventId"
         from calendar_events where action_id = $1`,
        [actionId],
      )
    },

    async saveCalendarEvent(userId: string, actionId: string, calendarId: string, eventId: string) {
      await db.query(
        `insert into calendar_events (user_id, action_id, calendar_id, event_id) values ($1, $2, $3, $4)
         on conflict (user_id, action_id) do update set calendar_id = excluded.calendar_id, event_id = excluded.event_id`,
        [userId, actionId, calendarId, eventId],
      )
    },

    async deleteCalendarEvent(userId: string, actionId: string) {
      await db.query('delete from calendar_events where user_id = $1 and action_id = $2', [
        userId,
        actionId,
      ])
    },

    /** Uživatelé, kteří se akce účastní: organizátor a ti, kdo pozvánku přijali. */
    async participantUserIds(actionId: string): Promise<string[]> {
      const rows = await db.query<{ user_id: string }>(
        `select owner_id as user_id from actions where id = $1
         union all
         select user_id from action_invites where action_id = $1 and status = 'accepted'`,
        [actionId],
      )
      return rows.map((row) => row.user_id)
    },

    // Převzetí dat z prohlížeče

    /** Založí akce z prohlížeče. Jen jejich parametry, lidi z nich se nepřevezmou. */
    async importActions(ownerId: string, actions: { details: ActionDetails }[]): Promise<number> {
      return db.transaction(async (tx) => {
        for (const { details } of actions) {
          await tx.query(
            `insert into actions (id, owner_id, name, date_from, date_to, duration_minutes, window_start, window_end)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              randomUUID(),
              ownerId,
              details.name,
              details.from,
              details.to,
              details.durationMinutes,
              details.windowStart,
              details.windowEnd,
            ],
          )
        }
        return actions.length
      })
    },

    // Limity čtení

    /**
     * Započte jedno čtení, pokud se vejde do limitů. Počítá se předem, i když čtení selže,
     * jinak by šlo limit obejít podklady, které model odmítne.
     */
    async reserveReading(
      userId: string,
      day: string,
      perUser: number,
      total: number,
    ): Promise<'ok' | 'user' | 'total'> {
      return db.transaction(async (tx) => {
        // Zámek řádku limitu celkem: dvě čtení najednou nesmí obě projít přes strop.
        await tx.query("select pg_advisory_xact_lock(hashtext('read_usage'))")
        const [all] = await tx.query<{ sum: number | string | null }>(
          'select sum(count) as sum from read_usage where day = $1',
          [day],
        )
        if (Number(all?.sum ?? 0) >= total) return 'total'
        const [mine] = await tx.query<{ count: number }>(
          'select count from read_usage where user_id = $1 and day = $2',
          [userId, day],
        )
        if ((mine?.count ?? 0) >= perUser) return 'user'
        await tx.query(
          `insert into read_usage (user_id, day, count) values ($1, $2, 1)
           on conflict (user_id, day) do update set count = read_usage.count + 1`,
          [userId, day],
        )
        return 'ok'
      })
    },
  }
}

export type Store = ReturnType<typeof createStore>
