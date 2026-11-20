import { mkdirSync } from 'node:fs'
import pg from 'pg'
import init001 from './migrations/001_init.sql?raw'
import groups002 from './migrations/002_groups.sql?raw'
import friends003 from './migrations/003_friends_invitations.sql?raw'
import calendar004 from './migrations/004_calendar.sql?raw'
import review005 from './migrations/005_review.sql?raw'

/**
 * Tenká vrstva nad databází. V produkci Postgres přes `pg`, ve vývoji a testech PGlite
 * (Postgres přímo v procesu, bez instalace). Dotazy jsou vždy s parametry ($1, $2 …).
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Migrace v pořadí. Nová migrace = nový soubor a nový řádek, staré se nemění. */
const MIGRATIONS: { name: string; sql: string }[] = [
  { name: '001_init', sql: init001 },
  { name: '002_groups', sql: groups002 },
  { name: '003_friends_invitations', sql: friends003 },
  { name: '004_calendar', sql: calendar004 },
  { name: '005_review', sql: review005 },
]

export async function migrate(db: Db): Promise<string[]> {
  await db.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  )
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((row) => row.name),
  )
  const done: string[] = []
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue
    await db.transaction(async (tx) => {
      await tx.query(migration.sql)
      await tx.query('insert into schema_migrations (name) values ($1)', [migration.name])
    })
    done.push(migration.name)
  }
  return done
}

/** Postgres přes pool spojení. */
export function postgresDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 5 })
  const run = async <T>(client: pg.Pool | pg.PoolClient, sql: string, params?: unknown[]) =>
    (await client.query(sql, params)).rows as T[]

  return {
    query: (sql, params) => run(pool, sql, params),
    async transaction(work) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const result = await work({
          query: (sql, params) => run(client, sql, params),
          transaction: () => Promise.reject(new Error('Vnořená transakce není podporovaná')),
          close: async () => {},
        })
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/** PGlite pro vývoj a testy. Bez adresáře je databáze jen v paměti. */
export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  // PGlite založí jen poslední složku cesty, nadřazené (třeba .local) musí existovat.
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const lite = new PGlite(dataDir)
  type Executor = Pick<InstanceType<typeof PGlite>, 'query' | 'exec'>
  const run = async <T>(executor: Executor, sql: string, params?: unknown[]): Promise<T[]> => {
    // Více příkazů bez parametrů (migrace) jde přes exec, ostatní přes query.
    if (!params || params.length === 0) {
      const results = await executor.exec(sql)
      return (results.at(-1)?.rows ?? []) as T[]
    }
    return (await executor.query<T>(sql, params)).rows
  }

  return {
    query: (sql, params) => run(lite, sql, params),
    transaction: (work) =>
      lite.transaction((tx) =>
        work({
          query: (sql, params) => run(tx, sql, params),
          transaction: () => Promise.reject(new Error('Vnořená transakce není podporovaná')),
          close: async () => {},
        }),
      ),
    close: () => lite.close(),
  }
}
