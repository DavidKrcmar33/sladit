import type { ActionResource, ActionView } from '@/contract/api'
import { composePeople } from '@/core/compose'
import type { Action } from '@/core/schema'
import { dayAttendance, findProposals } from '@/core/scheduler'
import { analyzeStability } from '@/core/sensitivity'
import { eachDay } from '@/core/time'
import type { ViewPerson } from './db/store'

/**
 * Pohled na akci pro jednoho uživatele. Návrhy a jejich jistota se počítají ze všech rozpisů,
 * ale o lidech, které uživatel nevlastní, vrací jen „může / nemůže / nevíme“ pro každý den
 * a u křehkého termínu jen den, na kterém záleží. Směny, časy, označení, text z podkladu,
 * poznámky ke čtení ani důvod (chybí rozpis, nejisté čtení) ven nejdou.
 */
export function actionView(
  viewerId: string,
  resource: ActionResource,
  people: ViewPerson[],
): ActionView {
  const action: Action = {
    id: resource.id,
    ...resource.details,
    people: people.map(({ id, name, sources, overrides }) => ({
      id,
      name,
      files: [],
      sources,
      overrides,
    })),
  }
  const composed = composePeople(action)
  const foreign = new Set(
    people.filter((person) => person.ownerId !== viewerId).map((person) => person.id),
  )
  const dates = eachDay(action.from, action.to)
  const stability = analyzeStability(action, composed)

  return {
    actionId: action.id,
    dates,
    others: composed
      .filter((person) => foreign.has(person.id))
      .map((person) => ({
        personId: person.id,
        days: dates.map((date) => dayAttendance(action, person.schedule, date)),
      })),
    proposals: findProposals(action, composed),
    stability: {
      winner: stability.winner,
      certain: stability.certain,
      pivots: stability.pivots.map((pivot) =>
        foreign.has(pivot.personId)
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
