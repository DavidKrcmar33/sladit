import { describe, expect, it } from 'vitest'
import { createAction, type NewActionInput } from './newAction'

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
