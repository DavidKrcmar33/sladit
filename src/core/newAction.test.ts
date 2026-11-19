import { describe, expect, it } from 'vitest'
import { sampleAction } from './fixtures'
import { actionDetails, createAction, updateActionDetails, type NewActionInput } from './newAction'

const input: NewActionInput = {
  name: 'Deskovky',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 180,
  windowStart: '16:00',
  windowEnd: '23:00',
}

describe('createAction', () => {
  it('creates an action without people', () => {
    const result = createAction('a1', input)
    expect(result).toEqual({ ok: true, action: { id: 'a1', ...input, people: [] } })
  })

  it('trims the name', () => {
    const result = createAction('a1', { ...input, name: '  Deskovky  ' })
    expect(result.ok && result.action.name).toBe('Deskovky')
  })

  it('reports an error per invalid field', () => {
    const result = createAction('a1', { ...input, name: ' ', to: '2026-11-01' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'to'])
  })
})

describe('updateActionDetails', () => {
  it('changes the details and keeps the people with their schedules', () => {
    const result = updateActionDetails(sampleAction, {
      ...actionDetails(sampleAction),
      to: '2026-12-06',
      durationMinutes: 120,
    })
    expect(result.ok && result.action).toMatchObject({
      id: sampleAction.id,
      to: '2026-12-06',
      durationMinutes: 120,
      people: sampleAction.people,
    })
  })

  it('refuses an action that does not fit into its daily window', () => {
    const result = updateActionDetails(sampleAction, {
      ...actionDetails(sampleAction),
      durationMinutes: 300,
      windowStart: '18:00',
      windowEnd: '22:00',
    })
    expect(result).toEqual({
      ok: false,
      errors: { durationMinutes: 'Akce se do denního okna nevejde' },
    })
  })
})
