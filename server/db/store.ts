import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ActionResource, OwnedPerson, User } from '@/contract/api'
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
 */

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
  name: string
  date_from: string
  date_to: string
  duration_minutes: number
  window_start: string
  window_end: string
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

function toSource(row: unknown): Source {
  const { id, circle, files, coverage, shifts, warnings, parity } = SourceRowSchema.parse(row)
  return { id, circle, files, coverage, shifts, warnings, parity }
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
  async function peopleOf(ownerId: string, onlyIds?: string[]): Promise<OwnedPerson[]> {
    const rows = await db.query<PersonRow>(
      onlyIds
        ? 'select id, name, is_self from people where owner_id = $1 and id = any($2) order by is_self desc, position'
        : 'select id, name, is_self from people where owner_id = $1 order by is_self desc, position',
      onlyIds ? [ownerId, onlyIds] : [ownerId],
    )
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
      id: row.id,
      name: row.name,
      isSelf: row.is_self,
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

  async function personOf(ownerId: string, personId: string): Promise<OwnedPerson | null> {
    const [person] = await peopleOf(ownerId, [personId])
    return person ?? null
  }

  async function participantIds(actionIds: string[]): Promise<Map<string, string[]>> {
    const rows = await db.query<{ action_id: string; person_id: string }>(
      'select action_id, person_id from action_participants where action_id = any($1) order by position',
      [actionIds],
    )
    const byAction = new Map<string, string[]>()
    for (const row of rows) {
      byAction.set(row.action_id, [...(byAction.get(row.action_id) ?? []), row.person_id])
    }
    return byAction
  }

  async function actionsOf(ownerId: string, onlyId?: string): Promise<ActionResource[]> {
    const rows = await db.query<ActionRow>(
      onlyId
        ? 'select * from actions where owner_id = $1 and id = $2'
        : 'select * from actions where owner_id = $1 order by position',
      onlyId ? [ownerId, onlyId] : [ownerId],
    )
    const participants = await participantIds(rows.map((row) => row.id))
    return rows.map((row) => ({
      id: row.id,
      details: toDetails(row),
      participantIds: participants.get(row.id) ?? [],
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

    /** Smaže účet a kaskádou všechna jeho data: lidi, zdroje, úpravy, akce, relace. */
    async deleteUser(userId: string) {
      await db.query('delete from users where id = $1', [userId])
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

    async actionOf(ownerId: string, actionId: string): Promise<ActionResource | null> {
      const [action] = await actionsOf(ownerId, actionId)
      return action ?? null
    },

    /** Založí akci. Uživatel se jí účastní sám za sebe. */
    async createAction(ownerId: string, details: ActionDetails): Promise<ActionResource> {
      return db.transaction(async (tx) => {
        const id = randomUUID()
        await tx.query(
          `insert into actions (id, owner_id, name, date_from, date_to, duration_minutes, window_start, window_end)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            ownerId,
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
            id,
            self.id,
          ])
        }
        return { id, details, participantIds: self ? [self.id] : [] }
      })
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
