import { z } from 'zod'
import {
  ActionSchema,
  DateStringSchema,
  ShiftSchema,
  SourceFileSchema,
  TimeStringSchema,
  WORK_CIRCLE,
} from './schema'
import { toMinutes } from './time'

export const STORAGE_KEY = 'sladit.v2'
/** Uložený stav z doby, kdy měl člověk jediný rozpis s jedním rozsahem. Převádí se při načtení. */
export const LEGACY_STORAGE_KEY = 'sladit.v1'

export const StepSchema = z.enum(['intake', 'calendar'])
export type Step = z.infer<typeof StepSchema>

/** Co se ukládá. Obsah souborů, rozpracovaný člověk a vybraný den ne. */
const StoredStateSchema = z.object({
  actions: z.array(ActionSchema),
  selectedActionId: z.string().nullable(),
  stepByActionId: z.record(z.string(), StepSchema),
})

export type StoredState = z.infer<typeof StoredStateSchema>

const LegacyStateSchema = z.object({
  actions: z.array(
    z.looseObject({
      id: z.string(),
      durationMinutes: z.number(),
      windowStart: TimeStringSchema,
      windowEnd: TimeStringSchema,
      people: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          files: z.array(SourceFileSchema),
          schedule: z
            .object({
              coveredFrom: DateStringSchema,
              coveredTo: DateStringSchema,
              shifts: z.array(ShiftSchema),
              warnings: z.array(z.string()).default([]),
            })
            .nullable(),
        }),
      ),
    }),
  ),
  selectedActionId: z.string().nullable(),
  stepByActionId: z.record(z.string(), StepSchema),
})

/**
 * Převod stavu z verze 1: přečtený rozpis se stane jedním zdrojem v okruhu Práce.
 * Akce delší než denní okno se zkrátí, jinak by ji nová kontrola odmítla a s ní celý stav.
 */
function migrateLegacy(raw: unknown): unknown {
  const parsed = LegacyStateSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    actions: parsed.data.actions.map((action) => {
      const windowMinutes = toMinutes(action.windowEnd) - toMinutes(action.windowStart)
      const fitting = Math.max(30, Math.floor(windowMinutes / 30) * 30)
      return {
        ...action,
        durationMinutes: Math.min(action.durationMinutes, fitting),
        people: action.people.map(({ schedule, files, ...person }) =>
          schedule
            ? {
                ...person,
                files: [],
                overrides: [],
                sources: [
                  {
                    id: `${person.id}-v1`,
                    circle: WORK_CIRCLE,
                    files,
                    coverage: [{ from: schedule.coveredFrom, to: schedule.coveredTo }],
                    shifts: schedule.shifts,
                    warnings: schedule.warnings,
                  },
                ],
              }
            : { ...person, files, sources: [], overrides: [] },
        ),
      }
    }),
  }
}

function parseStored(raw: unknown): StoredState | null {
  const parsed = StoredStateSchema.safeParse(raw)
  if (!parsed.success) return null

  const { actions, selectedActionId, stepByActionId } = parsed.data
  const ids = new Set(actions.map((action) => action.id))
  return {
    actions,
    selectedActionId:
      selectedActionId !== null && ids.has(selectedActionId) ? selectedActionId : null,
    stepByActionId: Object.fromEntries(
      Object.entries(stepByActionId).filter(([actionId]) => ids.has(actionId)),
    ),
  }
}

export function loadState(storage: Pick<Storage, 'getItem'>): StoredState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) return parseStored(JSON.parse(raw))
    const legacy = storage.getItem(LEGACY_STORAGE_KEY)
    return legacy === null ? null : parseStored(migrateLegacy(JSON.parse(legacy)))
  } catch {
    return null
  }
}

export function saveState(storage: Pick<Storage, 'setItem'>, state: StoredState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Plné nebo nedostupné úložiště: aplikace funguje dál, jen se nic neuloží.
  }
}
