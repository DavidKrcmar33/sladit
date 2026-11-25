import type { Page } from '@/session'

/**
 * Otevřená stránka v adrese: po obnovení stránky se otevře totéž a funguje tlačítko Zpět.
 * `/` je Můj rozvrh, dál `/akce/<id>`, `/skupina/<id>`, `/pratele` a `/nastaveni`.
 */
export type Route =
  | { page: 'schedule' }
  | { page: 'friends' }
  | { page: 'settings' }
  | { page: 'action'; actionId: string }
  | { page: 'group'; groupId: string }

const ID = '([\\w-]{1,100})'

export function routeFromPath(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { page: 'schedule' }
  if (path === '/pratele') return { page: 'friends' }
  if (path === '/nastaveni') return { page: 'settings' }
  const action = new RegExp(`^/akce/${ID}$`).exec(path)
  if (action) return { page: 'action', actionId: action[1] }
  const group = new RegExp(`^/skupina/${ID}$`).exec(path)
  if (group) return { page: 'group', groupId: group[1] }
  return null
}

export function pathFor(page: Page, actionId: string | null, groupId: string | null): string {
  if (page === 'action' && actionId) return `/akce/${encodeURIComponent(actionId)}`
  if (page === 'group' && groupId) return `/skupina/${encodeURIComponent(groupId)}`
  if (page === 'friends') return '/pratele'
  if (page === 'settings') return '/nastaveni'
  return '/'
}
