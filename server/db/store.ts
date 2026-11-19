import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ActionResource,
  Group,
  GroupInvite,
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
  type ActionDetails,
  type DayOverride,
  type Shift,
  type Source,
} from '@/core/schema'
import type { Db } from './db'

/**
 * Všechny dotazy do databáze na jednom místě. Každá metoda, která čte nebo mění data člověka
 * nebo akce, dostává id vlastníka a do dotazu ho dává jako podmínku. Cizí data tak nejde
 * přečíst ani změnit, ani když by trasa zapomněla na kontrolu.
 *
 * Jediná výjimka je `actionForView`: vrací rozpisy všech účastníků akce, aby server spočítal
 * návrhy. Smí ji volat jen výpočet pohledu (server/view.ts), který ven pustí jen tři stavy dne.
 */

/** Nejvíc členů ve skupině. Pozvánka je odkaz, který se může dostat dál, než měl. */
export const MAX_GROUP_MEMBERS = 50

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
})

interface PersonRow {
  id: string
  name: string
  is_self: boolean
}

interface ActionRow {
  id: string
  owner_id: string
  group_id: string | null
  organizer_name: string | null
  name: string
  date_from: string
  date_to: string
  duration_minutes: number
  window_start: string
  window_end: string
}

interface ParticipantRow {
  action_id: string
  id: string
  name: string
  owner_id: string
  is_self: boolean
}

/** Akce viditelné uživateli: jeho vlastní a akce ve skupinách, kde je členem. */
const VISIBLE_ACTION = `(a.owner_id = $1 or a.group_id in (select group_id from memberships where user_id = $1))`

const ACTION_COLUMNS = `a.*, (select name from people where owner_id = a.owner_id and is_self) as organizer_name`

function json(value: unknown): string {
  return JSON.stringify(value)
}

function toSource(row: unknown): Source {
  const { id, circle, files, coverage, shifts, warnings, parity } = SourceRowSchema.parse(row)
  return { id, circle, files, coverage, shifts, warnings, parity }
}

function isoTime(value: Date | string): string {
  return new Date(value).toISOString()
}

function toInvite(row: {
  id: string
  created_at: Date | string
  expires_at: Date | string
}): GroupInvite {
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

export function createStore(db: Db) {
  /** Doplní lidem zdroje a ruční úpravy. Volající odpovídá za to, že lidi smí vidět. */
  async function withSchedules<T extends PersonRow>(
    rows: T[],
  ): Promise<(T & Pick<OwnedPerson, 'sources' | 'overrides'>)[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const sources = await db.query(
      'select id, person_id, circle, files, coverage, shifts, warnings, parity from sources where person_id = any($1) order by position',
      [ids],
    )
    const overrides = await db.query<{ person_id: string; date: string; shifts: unknown }>(
      'select person_id, date, shifts from day_overrides where person_id = any($1) order by date',
      [ids],
    )
    return rows.map((row) => ({
      ...row,
      sources: sources
        .filter((source) => source.person_id === row.id)
        .map((source) => toSource(source)),
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

  /**
   * Účastníci akcí v pořadí: nejdřív lidé přidaní organizátorem (on sám a jeho hosté),
   * pak členové skupiny. Členové se neukládají, akce ve skupině patří všem jejím současným členům.
   */
  async function participantsOf(actionIds: string[]): Promise<Map<string, ParticipantRow[]>> {
    const rows = await db.query<ParticipantRow>(
      `select action_id, id, name, owner_id, is_self from (
         select ap.action_id, p.id, p.name, p.owner_id, p.is_self, 0 as part, ap.position
         from action_participants ap join people p on p.id = ap.person_id
         where ap.action_id = any($1)
         union all
         select a.id, p.id, p.name, p.owner_id, p.is_self, 1, m.position
         from actions a
         join memberships m on m.group_id = a.group_id
         join people p on p.owner_id = m.user_id and p.is_self
         where a.id = any($1)
       ) as participants order by action_id, part, position`,
      [actionIds],
    )
    const byAction = new Map<string, ParticipantRow[]>()
    for (const row of rows) {
      const list = byAction.get(row.action_id) ?? []
      if (!list.some((existing) => existing.id === row.id)) list.push(row)
      byAction.set(row.action_id, list)
    }
    return byAction
  }

  function toResource(
    viewerId: string,
    row: ActionRow,
    participants: ParticipantRow[],
  ): ActionResource {
    return {
      id: row.id,
      details: toDetails(row),
      participantIds: participants.map((person) => person.id),
      // O lidech, které přihlášený nevlastní, se dozví jen jméno a zda jde o člena, nebo hosta.
      others: participants
        .filter((person) => person.owner_id !== viewerId)
        .map((person) => ({
          id: person.id,
          name: person.name,
          kind: person.is_self ? ('member' as const) : ('guest' as const),
        })),
      groupId: row.group_id,
      isOrganizer: row.owner_id === viewerId,
      organizerName: row.organizer_name ?? '',
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
    const participants = await participantsOf(rows.map((row) => row.id))
    return rows.map((row) => toResource(viewerId, row, participants.get(row.id) ?? []))
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

  /**
   * Odchod ze skupiny: akce, které v ní člověk pořádal, se smažou i s jeho hosty, kteří už
   * nejsou v jiné akci. Zakladatel předá skupinu nejstaršímu členovi, poslední člen ji smaže.
   */
  async function leave(tx: Db, userId: string, groupId: string): Promise<boolean> {
    const [membership] = await tx.query<{ role: string }>(
      'delete from memberships where user_id = $1 and group_id = $2 returning role',
      [userId, groupId],
    )
    if (!membership) return false
    const guests = await tx.query<{ person_id: string }>(
      `select ap.person_id from action_participants ap join actions a on a.id = ap.action_id
       where a.owner_id = $1 and a.group_id = $2`,
      [userId, groupId],
    )
    await tx.query('delete from actions where owner_id = $1 and group_id = $2', [userId, groupId])
    await deleteOrphanGuests(
      tx,
      userId,
      guests.map((guest) => guest.person_id),
    )
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
    const invites = await db.query<{
      id: string
      group_id: string
      created_at: Date | string
      expires_at: Date | string
    }>(
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
      invites: invites
        .filter((invite) => invite.group_id === group.id)
        .map((invite) => toInvite(invite)),
    }))
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

    async userBySession(tokenHash: string): Promise<User | null> {
      const [user] = await db.query<User>(
        'select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()',
        [tokenHash],
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

    // Lidé a jejich rozpisy

    peopleOf,
    personOf,

    async createGuest(ownerId: string, name: string): Promise<OwnedPerson> {
      const id = randomUUID()
      await db.query(
        'insert into people (id, owner_id, is_self, name) values ($1, $2, false, $3)',
        [id, ownerId, name],
      )
      return { id, name, isSelf: false, sources: [], overrides: [] }
    },

    async renamePerson(ownerId: string, personId: string, name: string): Promise<boolean> {
      const rows = await db.query(
        'update people set name = $3 where owner_id = $1 and id = $2 returning id',
        [ownerId, personId, name],
      )
      return rows.length > 0
    },

    async addSource(ownerId: string, personId: string, source: Source): Promise<boolean> {
      const rows = await db.query(
        `insert into sources (id, person_id, circle, files, coverage, shifts, warnings, parity)
         select $3, p.id, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb
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
        ],
      )
      return rows.length > 0
    },

    async updateSource(
      ownerId: string,
      personId: string,
      sourceId: string,
      update: (source: Source) => Source,
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [row] = await tx.query(
          `select s.id, s.person_id, s.circle, s.files, s.coverage, s.shifts, s.warnings, s.parity
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

    /** Akce, kterou uživatel vidí: vlastní, nebo ve skupině, kde je členem. */
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
      const participants = (await participantsOf([row.id])).get(row.id) ?? []
      const people = await withSchedules(participants)
      return {
        action: toResource(viewerId, row, participants),
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
     * Založí akci. Uživatel se jí účastní sám za sebe. Ve skupině ji může založit každý člen,
     * účastní se jí pak všichni členové. Vrací null, když uživatel ve skupině není.
     */
    async createAction(
      ownerId: string,
      details: ActionDetails,
      groupId: string | null = null,
    ): Promise<ActionResource | null> {
      const id = await db.transaction(async (tx) => {
        if (groupId && !(await isMember(tx, ownerId, groupId))) return null
        const actionId = randomUUID()
        await tx.query(
          `insert into actions (id, owner_id, group_id, name, date_from, date_to, duration_minutes, window_start, window_end)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            actionId,
            ownerId,
            groupId,
            details.name,
            details.from,
            details.to,
            details.durationMinutes,
            details.windowStart,
            details.windowEnd,
          ],
        )
        const [self] = await tx.query<{ id: string }>(
          'select id from people where owner_id = $1 and is_self',
          [ownerId],
        )
        if (self) {
          await tx.query('insert into action_participants (action_id, person_id) values ($1, $2)', [
            actionId,
            self.id,
          ])
        }
        return actionId
      })
      if (!id) return null
      const [action] = await actionsOf(ownerId, id)
      return action ?? null
    },

    async updateAction(
      ownerId: string,
      actionId: string,
      details: ActionDetails,
    ): Promise<boolean> {
      const rows = await db.query(
        `update actions set name = $3, date_from = $4, date_to = $5, duration_minutes = $6,
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
      return db.transaction(async (tx) => {
        const guests = await tx.query<{ person_id: string }>(
          `select ap.person_id from action_participants ap
           join actions a on a.id = ap.action_id join people p on p.id = ap.person_id
           where a.owner_id = $1 and a.id = $2 and not p.is_self`,
          [ownerId, actionId],
        )
        const rows = await tx.query(
          'delete from actions where owner_id = $1 and id = $2 returning id',
          [ownerId, actionId],
        )
        if (rows.length === 0) return false
        await deleteOrphanGuests(
          tx,
          ownerId,
          guests.map((guest) => guest.person_id),
        )
        return true
      })
    },

    /** Přidá do akce nového hosta. */
    async addGuest(ownerId: string, actionId: string, name: string): Promise<OwnedPerson | null> {
      return db.transaction(async (tx) => {
        const [action] = await tx.query('select id from actions where owner_id = $1 and id = $2', [
          ownerId,
          actionId,
        ])
        if (!action) return null
        const id = randomUUID()
        await tx.query(
          'insert into people (id, owner_id, is_self, name) values ($1, $2, false, $3)',
          [id, ownerId, name],
        )
        await tx.query('insert into action_participants (action_id, person_id) values ($1, $2)', [
          actionId,
          id,
        ])
        return { id, name, isSelf: false, sources: [], overrides: [] }
      })
    },

    /** Odebere člověka z akce. Host, který už v žádné akci není, se smaže i s rozpisem. */
    async removeParticipant(ownerId: string, actionId: string, personId: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        const rows = await tx.query(
          `delete from action_participants ap using actions a
           where a.id = ap.action_id and a.owner_id = $1 and ap.action_id = $2 and ap.person_id = $3
           returning ap.person_id`,
          [ownerId, actionId, personId],
        )
        if (rows.length === 0) return false
        await deleteOrphanGuests(tx, ownerId, [personId])
        return true
      })
    },

    // Skupiny a pozvánky

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

    /** Smaže skupinu i s jejími akcemi. Smí jen zakladatel. */
    async deleteGroup(ownerId: string, groupId: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return false
        const guests = await tx.query<{ person_id: string; owner_id: string }>(
          `select ap.person_id, a.owner_id from action_participants ap
           join actions a on a.id = ap.action_id where a.group_id = $1`,
          [groupId],
        )
        await tx.query('delete from groups where id = $1', [groupId])
        for (const owner of new Set(guests.map((guest) => guest.owner_id))) {
          await deleteOrphanGuests(
            tx,
            owner,
            guests.filter((guest) => guest.owner_id === owner).map((guest) => guest.person_id),
          )
        }
        return true
      })
    },

    async leaveGroup(userId: string, groupId: string): Promise<boolean> {
      return db.transaction((tx) => leave(tx, userId, groupId))
    },

    /** Zakladatel odebere člena. Sám sebe odebrat nemůže, na to je odchod. */
    async removeMember(ownerId: string, groupId: string, userId: string): Promise<boolean> {
      if (ownerId === userId) return false
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return false
        return leave(tx, userId, groupId)
      })
    },

    /** Uloží otisk nové pozvánky. Smí jen zakladatel. */
    async createInvite(
      ownerId: string,
      groupId: string,
      tokenHash: string,
      expiresAt: Date,
    ): Promise<GroupInvite | null> {
      return db.transaction(async (tx) => {
        if (!(await isMember(tx, ownerId, groupId, 'owner'))) return null
        const [row] = await tx.query<{
          id: string
          created_at: Date | string
          expires_at: Date | string
        }>(
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

    /** Co pozvaný uvidí před přijetím: název skupiny, zakladatel, počet členů. */
    async invitePreview(
      userId: string,
      tokenHash: string,
      now: Date,
    ): Promise<InvitePreview | null> {
      const [row] = await db.query<{
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
      if (!row) return null
      return {
        groupId: row.group_id,
        groupName: row.group_name,
        ownerName: row.owner_name ?? '',
        memberCount: Number(row.member_count),
        isMember: row.is_member,
      }
    },

    /** Přidá uživatele do skupiny podle platné pozvánky. Vrací id skupiny, nebo důvod odmítnutí. */
    async acceptInvite(
      userId: string,
      tokenHash: string,
      now: Date,
    ): Promise<{ groupId: string } | 'invalid' | 'full'> {
      return db.transaction(async (tx) => {
        const [invite] = await tx.query<{ group_id: string }>(
          `select group_id from invites
           where token_hash = $1 and revoked_at is null and expires_at > $2 for update`,
          [tokenHash, now.toISOString()],
        )
        if (!invite) return 'invalid'
        if (await isMember(tx, userId, invite.group_id)) return { groupId: invite.group_id }
        const [count] = await tx.query<{ count: number | string }>(
          'select count(*) as count from memberships where group_id = $1',
          [invite.group_id],
        )
        if (Number(count?.count ?? 0) >= MAX_GROUP_MEMBERS) return 'full'
        await tx.query(
          "insert into memberships (group_id, user_id, role) values ($1, $2, 'member')",
          [invite.group_id, userId],
        )
        return { groupId: invite.group_id }
      })
    },

    // Převzetí dat z prohlížeče

    /** Založí hosty, jejich zdroje, úpravy a akce. Vše v jedné transakci, nebo nic. */
    async importActions(
      ownerId: string,
      actions: {
        details: ActionDetails
        people: { name: string; sources: Source[]; overrides: DayOverride[] }[]
      }[],
    ): Promise<number> {
      return db.transaction(async (tx) => {
        const [self] = await tx.query<{ id: string }>(
          'select id from people where owner_id = $1 and is_self',
          [ownerId],
        )
        for (const action of actions) {
          const actionId = randomUUID()
          const { details } = action
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
          if (self) {
            await tx.query(
              'insert into action_participants (action_id, person_id) values ($1, $2)',
              [actionId, self.id],
            )
          }
          for (const person of action.people) {
            const personId = randomUUID()
            await tx.query(
              'insert into people (id, owner_id, is_self, name) values ($1, $2, false, $3)',
              [personId, ownerId, person.name],
            )
            await tx.query(
              'insert into action_participants (action_id, person_id) values ($1, $2)',
              [actionId, personId],
            )
            for (const source of person.sources) {
              await tx.query(
                `insert into sources (id, person_id, circle, files, coverage, shifts, warnings, parity)
                 values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)`,
                [
                  randomUUID(),
                  personId,
                  source.circle,
                  json(source.files),
                  json(source.coverage),
                  json(source.shifts),
                  json(source.warnings),
                  json(source.parity),
                ],
              )
            }
            for (const override of person.overrides) {
              await tx.query(
                'insert into day_overrides (person_id, date, shifts) values ($1, $2, $3::jsonb)',
                [personId, override.date, json(override.shifts)],
              )
            }
          }
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

/** Hosté, kteří nejsou v žádné akci, se smažou. Uživatel sám za sebe zůstává vždy. */
async function deleteOrphanGuests(tx: Db, ownerId: string, personIds: string[]) {
  if (personIds.length === 0) return
  await tx.query(
    `delete from people p where p.owner_id = $1 and p.id = any($2) and not p.is_self
     and not exists (select 1 from action_participants ap where ap.person_id = p.id)`,
    [ownerId, personIds],
  )
}

export type Store = ReturnType<typeof createStore>
