import type { ActionResource, ActionView } from '@/contract/api'
import type { Action } from '@/core/schema'
import { sharedView } from '@/core/sharedView'
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
  const foreign = new Set(
    people.filter((person) => person.ownerId !== viewerId).map((person) => person.id),
  )
  return { actionId: action.id, ...sharedView(action, foreign) }
}
