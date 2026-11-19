import { z } from 'zod'
import { ActionSchema, type Action } from './schema'

export type NewActionInput = Omit<Action, 'id' | 'people'>

export type NewActionErrors = Partial<Record<keyof NewActionInput, string>>

export type CreateActionResult =
  { ok: true; action: Action } | { ok: false; errors: NewActionErrors }

function validate(candidate: unknown, input: NewActionInput): CreateActionResult {
  const result = ActionSchema.safeParse(candidate)
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

export function createAction(id: string, input: NewActionInput): CreateActionResult {
  return validate({ ...input, id, people: [] }, input)
}

/** Nové parametry akce. Lidé a jejich rozpisy zůstanou, termíny se jen přepočítají. */
export function updateActionDetails(action: Action, input: NewActionInput): CreateActionResult {
  return validate({ ...action, ...input }, input)
}

/** Parametry akce, jak je ukazuje formulář. */
export function actionDetails(action: Action): NewActionInput {
  const { name, from, to, durationMinutes, windowStart, windowEnd } = action
  return { name, from, to, durationMinutes, windowStart, windowEnd }
}
