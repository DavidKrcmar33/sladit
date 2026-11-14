import { z } from 'zod'
import { ActionSchema, type Action } from './schema'

export type NewActionInput = Omit<Action, 'id' | 'people'>

export type NewActionErrors = Partial<Record<keyof NewActionInput, string>>

export type CreateActionResult =
  { ok: true; action: Action } | { ok: false; errors: NewActionErrors }

export function createAction(id: string, input: NewActionInput): CreateActionResult {
  const result = ActionSchema.safeParse({ ...input, id, people: [] })
  if (result.success) return { ok: true, action: result.data }

  const { fieldErrors } = z.flattenError(result.error)
  const errors: NewActionErrors = {}
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (field in input && messages?.length) {
      errors[field as keyof NewActionInput] = messages[0]
    }
  }
  return { ok: false, errors }
}
