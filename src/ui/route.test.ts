import { describe, expect, it } from 'vitest'
import { pathFor, routeFromPath } from './route'

describe('stránka v adrese', () => {
  it('reads every page from the address and ignores unknown ones', () => {
    expect(routeFromPath('/')).toEqual({ page: 'schedule' })
    expect(routeFromPath('/akce/abc-123')).toEqual({ page: 'action', actionId: 'abc-123' })
    expect(routeFromPath('/skupina/g1/')).toEqual({ page: 'group', groupId: 'g1' })
    expect(routeFromPath('/pratele')).toEqual({ page: 'friends' })
    expect(routeFromPath('/nastaveni')).toEqual({ page: 'settings' })
    expect(routeFromPath('/pozvanka/abcdefghijklmnop')).toBeNull()
    expect(routeFromPath('/akce/../x')).toBeNull()
  })

  it('writes the page back the same way', () => {
    expect(pathFor('action', 'abc-123', null)).toBe('/akce/abc-123')
    expect(pathFor('group', null, 'g1')).toBe('/skupina/g1')
    expect(pathFor('schedule', 'abc', null)).toBe('/')
    expect(pathFor('action', null, null)).toBe('/')
  })
})
