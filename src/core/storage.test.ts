import { describe, expect, it } from 'vitest'
import { sampleAction } from './fixtures'
import { LEGACY_STORAGE_KEY, STORAGE_KEY, loadState, saveState, type StoredState } from './storage'

function fakeStorage(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(STORAGE_KEY, initial)
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const state: StoredState = {
  actions: [sampleAction],
  selectedActionId: sampleAction.id,
  stepByActionId: { [sampleAction.id]: 'calendar' },
}

describe('saveState / loadState', () => {
  it('restores what was saved', () => {
    const storage = fakeStorage()
    saveState(storage, state)
    expect(loadState(storage)).toEqual(state)
  })

  it('returns null when nothing is saved', () => {
    expect(loadState(fakeStorage())).toBeNull()
  })

  it('returns null for broken JSON', () => {
    expect(loadState(fakeStorage('{not json'))).toBeNull()
  })

  it('returns null when an action does not match the schema', () => {
    const broken = { ...state, actions: [{ ...sampleAction, durationMinutes: 45 }] }
    expect(loadState(fakeStorage(JSON.stringify(broken)))).toBeNull()
  })

  it('drops a selection and steps that point to missing actions', () => {
    const stale = {
      actions: [sampleAction],
      selectedActionId: 'deleted',
      stepByActionId: { deleted: 'calendar', [sampleAction.id]: 'intake' },
    }
    expect(loadState(fakeStorage(JSON.stringify(stale)))).toEqual({
      actions: [sampleAction],
      selectedActionId: null,
      stepByActionId: { [sampleAction.id]: 'intake' },
    })
  })

  it('does not throw when the storage is full or unavailable', () => {
    const failing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    }
    expect(() => saveState(failing, state)).not.toThrow()
    expect(loadState(failing)).toBeNull()
  })
})

describe('loadState from version 1', () => {
  const legacy = {
    actions: [
      {
        id: 'a1',
        name: 'Pivo',
        from: '2026-11-23',
        to: '2026-11-29',
        durationMinutes: 300,
        windowStart: '18:00',
        windowEnd: '22:00',
        people: [
          {
            id: 'anna',
            name: 'Anna',
            files: [{ id: 'f1', name: 'rozpis.xlsx', kind: 'xlsx' }],
            schedule: {
              coveredFrom: '2026-11-23',
              coveredTo: '2026-11-28',
              shifts: [
                {
                  date: '2026-11-24',
                  start: '06:00',
                  end: '14:00',
                  label: 'R',
                  raw: 'R',
                  uncertain: false,
                },
              ],
              warnings: ['Časy odhadnuty podle slovníku.'],
            },
          },
          {
            id: 'petr',
            name: 'Petr',
            files: [{ id: 'f2', name: 'foto.jpg', kind: 'image' }],
            schedule: null,
          },
        ],
      },
    ],
    selectedActionId: 'a1',
    stepByActionId: { a1: 'calendar' },
  }

  function legacyStorage() {
    const data = new Map([[LEGACY_STORAGE_KEY, JSON.stringify(legacy)]])
    return { getItem: (key: string) => data.get(key) ?? null }
  }

  it('turns a read schedule into one source and keeps unread files waiting', () => {
    const [action] = loadState(legacyStorage())!.actions
    expect(action.people[0]).toEqual({
      id: 'anna',
      name: 'Anna',
      files: [],
      overrides: [],
      sources: [
        {
          id: 'anna-v1',
          circle: 'Práce',
          files: [{ id: 'f1', name: 'rozpis.xlsx', kind: 'xlsx' }],
          coverage: [{ from: '2026-11-23', to: '2026-11-28' }],
          shifts: legacy.actions[0].people[0].schedule!.shifts,
          warnings: ['Časy odhadnuty podle slovníku.'],
          parity: { calendar: false, anchors: [] },
        },
      ],
    })
    expect(action.people[1]).toMatchObject({ files: [{ id: 'f2' }], sources: [] })
  })

  it('shortens an action that no longer fits its window instead of dropping everything', () => {
    const restored = loadState(legacyStorage())!
    expect(restored.actions[0].durationMinutes).toBe(240)
    expect(restored.selectedActionId).toBe('a1')
  })

  it('prefers the new format when both are stored', () => {
    const data = new Map([
      [LEGACY_STORAGE_KEY, JSON.stringify(legacy)],
      [STORAGE_KEY, JSON.stringify(state)],
    ])
    expect(loadState({ getItem: (key) => data.get(key) ?? null })).toEqual(state)
  })
})
