import { composePeople } from './compose'
import type { Action, DateString, Proposal } from './schema'
import { bestCountPerDay, dayAttendance, findProposals, type Attendance } from './scheduler'
import { analyzeStability, type Stability } from './sensitivity'
import { eachDay } from './time'

/** Pohled na akci pro jednoho účastníka. U cizích lidí jen stav dne, žádné směny. */
export interface SharedView {
  dates: DateString[]
  /** Stav každého dne období u lidí, jejichž rozpis divák nevidí. */
  others: { personId: string; days: Attendance[] }[]
  proposals: Proposal[]
  stability: Stability
  /** Kolik lidí nejvíc může v nějakém čase každého dne (přehled nad kalendářem). */
  dayBest: number[]
}

/**
 * Návrhy a jejich jistota ze všech rozpisů akce, ale o lidech z `foreignIds` jen
 * „může / nemůže / nevíme“ pro každý den a u křehkého termínu jen den, na kterém záleží,
 * bez důvodu (chybí rozpis, nejisté čtení). Počítá server pro každého diváka zvlášť,
 * ukázka bez přihlášení stejně v prohlížeči.
 */
export function sharedView(
  action: Action,
  foreignIds: ReadonlySet<string>,
  /** Lidé, bez kterých akce není (id osob). */
  requiredIds: ReadonlySet<string> = new Set(),
): SharedView {
  const composed = composePeople(action).map((person) => ({
    ...person,
    required: requiredIds.has(person.id),
  }))
  const dates = eachDay(action.from, action.to)
  const stability = analyzeStability(action, composed)
  return {
    dates,
    others: composed
      .filter((person) => foreignIds.has(person.id))
      .map((person) => ({
        personId: person.id,
        days: dates.map((date) => dayAttendance(action, person.schedule, date)),
      })),
    proposals: findProposals(action, composed),
    dayBest: bestCountPerDay(action, composed),
    stability: {
      ...stability,
      pivots: stability.pivots.map((pivot) =>
        foreignIds.has(pivot.personId)
          ? {
              personId: pivot.personId,
              dates: [...new Set(pivot.dates.map((item) => item.date))].map((date) => ({
                date,
                reason: 'private' as const,
              })),
            }
          : pivot,
      ),
    },
  }
}
