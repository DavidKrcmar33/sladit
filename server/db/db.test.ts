import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate, pgliteDb } from './db'

const created: string[] = []

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('pgliteDb', () => {
  it('creates missing parent folders and keeps the data for the next start', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sladit-db-'))
    created.push(root)
    const dataDir = join(root, '.local', 'pglite')

    const first = await pgliteDb(dataDir)
    expect(await migrate(first)).toEqual(['001_init'])
    await first.query("insert into users (id, google_sub, email, name) values ('u', 's', 'e', 'n')")
    await first.close()

    const second = await pgliteDb(dataDir)
    expect(await migrate(second)).toEqual([])
    expect(await second.query('select id from users')).toEqual([{ id: 'u' }])
    await second.close()
  })
})
