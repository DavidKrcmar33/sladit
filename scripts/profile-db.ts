import { afterAll, afterEach, beforeEach, vi } from 'vitest'

const elapsed = { open: 0, migrations: 0, tests: 0 }
let started = 0
let opens = 0

vi.mock(import('../server/db/db'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    async pgliteDb(dir) {
      const start = performance.now()
      const db = await original.pgliteDb(dir)
      // První dotaz počká na připravenost PGlite ještě před měřením migrací.
      await db.query('select 1')
      elapsed.open += performance.now() - start
      opens++
      return db
    },
    async migrate(db) {
      const start = performance.now()
      const applied = await original.migrate(db)
      elapsed.migrations += performance.now() - start
      return applied
    },
  }
})

beforeEach(() => {
  started = performance.now()
})
afterEach(() => {
  elapsed.tests += performance.now() - started
})
afterAll(() => {
  const scenario = elapsed.tests - elapsed.open - elapsed.migrations
  console.log(
    `PGlite (ms): opens=${opens} open=${elapsed.open.toFixed(0)} migrations=${elapsed.migrations.toFixed(0)} scenario=${scenario.toFixed(0)}`,
  )
})
