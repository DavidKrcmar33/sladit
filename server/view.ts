import type { ActionResource, ActionView } from '@/contract/api'
import type { Action } from '@/core/schema'
import { composePeople } from '@/core/compose'
import type { Proposal } from '@/core/schema'
import { daySlots } from '@/core/scheduler'
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
  // Nezbytní: organizátor (první účastník) a ti, koho tak organizátor označil.
  const requiredUsers = new Set(
    resource.invites.filter((invite) => invite.required).map((invite) => invite.userId),
  )
  const required = new Set([
    ...resource.participantIds.slice(0, 1),
    ...people.filter((person) => requiredUsers.has(person.ownerId)).map((person) => person.id),
  ])
  return { actionId: action.id, ...sharedView(action, foreign, required) }
}

/**
 * Všechny možné začátky jednoho dne a kdo v nich může (výběr vlastního času v akci).
 * O ostatních jde ven jen může / nemůže / nevíme pro každý čas v okně akce, směny ne.
 */
export function actionDaySlots(
  resource: ActionResource,
  people: ViewPerson[],
  date: string,
): Proposal[] {
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
  return daySlots(action, composePeople(action), date)
}
