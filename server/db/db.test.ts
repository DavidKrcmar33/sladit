import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate, pgliteDb } from './db'
import init001 from './migrations/001_init.sql?raw'
import groups002 from './migrations/002_groups.sql?raw'

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
    expect(await migrate(first)).toEqual([
      '001_init',
      '002_groups',
      '003_friends_invitations',
      '004_calendar',
      '005_review',
      '006_friend_requests',
    ])
    await first.query("insert into users (id, google_sub, email, name) values ('u', 's', 'e', 'n')")
    await first.close()

    const second = await pgliteDb(dataDir)
    expect(await migrate(second)).toEqual([])
    expect(await second.query('select id from users')).toEqual([{ id: 'u' }])
    await second.close()
  })

  it('turns phase 4 group actions into accepted invites for the members who took part', async () => {
    const db = await pgliteDb()
    // Databáze ve stavu po fázi 4: akce ve skupině s Annou (organizátorka) a Evou.
    await db.query(init001)
    await db.query(groups002)
    await db.query(
      `create table schema_migrations (name text primary key, applied_at timestamptz not null default now());
       insert into schema_migrations (name) values ('001_init'), ('002_groups');
       insert into users (id, google_sub, email, name) values ('anna', 'a', 'a@x', 'Anna'), ('eva', 'e', 'e@x', 'Eva');
       insert into groups (id, name) values ('g', 'Parta');
       insert into memberships (group_id, user_id, role) values ('g', 'anna', 'owner'), ('g', 'eva', 'member');
       insert into actions (id, owner_id, group_id, name, date_from, date_to, duration_minutes, window_start, window_end)
         values ('pivo', 'anna', 'g', 'Pivo', '2026-11-23', '2026-11-29', 120, '17:00', '22:00');`,
    )

    expect(await migrate(db)).toEqual([
      '003_friends_invitations',
      '004_calendar',
      '005_review',
      '006_friend_requests',
    ])
    expect(await db.query('select action_id, user_id, status from action_invites')).toEqual([
      { action_id: 'pivo', user_id: 'eva', status: 'accepted' },
    ])
    expect(await db.query('select group_id from actions')).toEqual([{ group_id: null }])
    await db.close()
  })
})
