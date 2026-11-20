import type { ActionResource, CalendarStatus } from '@/contract/api'
import { busyToShifts, zonedTime } from '@/core/calendarBusy'
import { addDays, mondayOf } from '@/core/time'
import type { TokenCipher } from '../crypto'
import type { CalendarConnection, Store } from '../db/store'
import { pragueDay } from '../reading'
import {
  CalendarAuthError,
  CalendarGoneError,
  type CalendarApi,
  type CalendarEvent,
  type CalendarGrant,
} from './api'

/** Jak dlouho platí načtená obsazenost, než se načte znovu. */
const BUSY_MAX_AGE_MS = 10 * 60 * 1000
/** Obsazenost se čte od pondělí minulého týdne na 12 týdnů dopředu, stejně jako podklady. */
const BUSY_WEEKS = 13
const APP_CALENDAR_NAME = 'Sladit'

/**
 * Google Kalendář na serveru. Chyby kalendáře nikdy neshodí hlavní akci (potvrzení termínu,
 * smazání akce): kalendář je doplněk, zápis se dá zopakovat.
 */
export function createCalendarService(deps: {
  store: Store
  api: CalendarApi | null
  cipher: TokenCipher | null
  now: () => Date
}) {
  const { store, api, cipher, now } = deps
  const available = api !== null && cipher !== null

  async function status(userId: string): Promise<CalendarStatus> {
    if (!available)
      return { state: 'unavailable', autoWrite: false, canWrite: false, syncedAt: null }
    const connection = await store.calendarConnection(userId)
    if (!connection) return { state: 'off', autoWrite: false, canWrite: false, syncedAt: null }
    return {
      state: connection.status === 'ok' ? 'connected' : 'expired',
      autoWrite: connection.autoWrite,
      canWrite: connection.canWrite,
      syncedAt: connection.syncedAt,
    }
  }

  /**
   * Práce s přístupovým tokenem. Když Google přístup odmítne, připojení se označí jako
   * vypršelé a obsazenost se smaže, aby se nepočítalo se zastaralými časy.
   */
  async function withAccess<T>(
    connection: CalendarConnection,
    work: (accessToken: string) => Promise<T>,
  ): Promise<T | null> {
    if (!api || !cipher || connection.status !== 'ok') return null
    try {
      const accessToken = await api.accessToken(cipher.decrypt(connection.refreshToken))
      return await work(accessToken)
    } catch (error) {
      if (error instanceof CalendarAuthError) {
        await store.updateCalendar(connection.userId, { status: 'expired', busy: [] })
        return null
      }
      console.error('Google Kalendář:', error instanceof Error ? error.message : error)
      return null
    }
  }

  async function connect(userId: string, grant: CalendarGrant) {
    if (!cipher) throw new Error('Kalendář není na serveru nastavený')
    if (!grant.canReadBusy) throw new Error('Bez povolení číst obsazenost kalendář připojit nejde')
    await store.saveCalendarConnection(userId, cipher.encrypt(grant.refreshToken), grant.canWrite)
    await sync(userId, true)
  }

  /** Odpojí kalendář a odvolá přístup u Googlu. Zapsané události v kalendáři zůstanou. */
  async function disconnect(userId: string) {
    const connection = await store.calendarConnection(userId)
    if (!connection) return
    if (api && cipher) {
      await api.revoke(cipher.decrypt(connection.refreshToken)).catch(() => {})
    }
    await store.deleteCalendarConnection(userId)
  }

  async function setAutoWrite(userId: string, autoWrite: boolean) {
    await store.updateCalendar(userId, { autoWrite })
  }

  /** Načte obsazenost, když je starší než 10 minut (nebo vždy s `force`). */
  async function syncConnection(connection: CalendarConnection, force: boolean) {
    const fresh =
      connection.syncedAt !== null &&
      now().getTime() - new Date(connection.syncedAt).getTime() < BUSY_MAX_AGE_MS
    if (fresh && !force) return
    const from = addDays(mondayOf(pragueDay(now())), -7)
    const to = addDays(from, BUSY_WEEKS * 7)
    await withAccess(connection, async (accessToken) => {
      const intervals = await api!.freeBusy(
        accessToken,
        new Date(zonedTime(from, '00:00')).toISOString(),
        new Date(zonedTime(to, '00:00')).toISOString(),
      )
      await store.updateCalendar(connection.userId, {
        busy: busyToShifts(intervals),
        syncedAt: now(),
      })
    })
  }

  async function sync(userId: string, force = false) {
    if (!available) return
    const connection = await store.calendarConnection(userId)
    if (connection) await syncConnection(connection, force)
  }

  async function syncMany(userIds: string[]) {
    if (!available || userIds.length === 0) return
    const connections = await store.calendarConnections(userIds)
    await Promise.all(connections.map((connection) => syncConnection(connection, false)))
  }

  function eventOf(action: ActionResource): CalendarEvent | null {
    if (!action.confirmed) return null
    return {
      title: action.details.name,
      ...action.confirmed,
      description: `Termín potvrzený v aplikaci Sladit. Pořádá ${action.organizerName}.`,
    }
  }

  /**
   * Zápisy do kalendáře jednoho uživatele běží postupně. Dva souběžné zápisy (dvojklik,
   * potvrzení a přidání naráz) by jinak oba založily kalendář Sladit a událost by byla dvakrát.
   * Server běží v jedné instanci, takže stačí fronta v paměti.
   */
  const queues = new Map<string, Promise<unknown>>()

  function oneAtATime<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const result = (queues.get(userId) ?? Promise.resolve()).then(work)
    const tail = result.catch(() => {})
    queues.set(userId, tail)
    void tail.then(() => {
      if (queues.get(userId) === tail) queues.delete(userId)
    })
    return result
  }

  /** Zapíše potvrzený termín do kalendáře Sladit jednoho uživatele, nebo ho tam změní. */
  function writeEvent(userId: string, action: ActionResource): Promise<boolean> {
    return oneAtATime(userId, () => writeEventNow(userId, action))
  }

  async function writeEventNow(userId: string, action: ActionResource): Promise<boolean> {
    const event = eventOf(action)
    const connection = available ? await store.calendarConnection(userId) : null
    if (!event || !connection || !connection.canWrite) return false
    const existing = (await store.calendarEvents(action.id)).find((item) => item.userId === userId)
    const written = await withAccess(connection, async (accessToken) => {
      let calendarId = connection.appCalendarId
      if (!calendarId) {
        calendarId = await api!.createCalendar(accessToken, APP_CALENDAR_NAME)
        await store.updateCalendar(userId, { appCalendarId: calendarId })
      }
      try {
        const eventId = await api!.upsertEvent(
          accessToken,
          calendarId,
          existing?.calendarId === calendarId ? existing.eventId : null,
          event,
        )
        return { calendarId, eventId }
      } catch (error) {
        if (!(error instanceof CalendarGoneError)) throw error
        // Kalendář Sladit uživatel smazal: založí se nový.
        const created = await api!.createCalendar(accessToken, APP_CALENDAR_NAME)
        await store.updateCalendar(userId, { appCalendarId: created })
        return {
          calendarId: created,
          eventId: await api!.upsertEvent(accessToken, created, null, event),
        }
      }
    })
    if (!written) return false
    await store.saveCalendarEvent(userId, action.id, written.calendarId, written.eventId)
    return true
  }

  function removeEvent(userId: string, actionId: string): Promise<void> {
    return oneAtATime(userId, () => removeEventNow(userId, actionId))
  }

  async function removeEventNow(userId: string, actionId: string) {
    const existing = (await store.calendarEvents(actionId)).find((item) => item.userId === userId)
    if (!existing) return
    const connection = available ? await store.calendarConnection(userId) : null
    if (connection) {
      await withAccess(connection, (accessToken) =>
        api!.deleteEvent(accessToken, existing.calendarId, existing.eventId),
      )
    }
    await store.deleteCalendarEvent(userId, actionId)
  }

  async function removeEvents(actionId: string) {
    const events = await store.calendarEvents(actionId)
    await Promise.all(events.map((event) => removeEvent(event.userId, actionId)))
  }

  /**
   * Po návrhu termínu, odpovědi účastníka nebo změně akce. Týká se jen těch, kdo jdou
   * (organizátor a kdo odpověděl „jdu“): kdo událost má, tomu se změní, kdo má automatický
   * zápis, tomu se zapíše. Ostatních se aplikace zeptá. Kdo už nejde (odpověděl „nejdu“,
   * nebo se termín změnil a ještě neodpověděl), tomu se událost smaže.
   */
  async function afterConfirm(actionId: string) {
    if (!available) return
    const going = new Set(await store.goingUserIds(actionId))
    const events = await store.calendarEvents(actionId)
    await Promise.all(
      events
        .filter((event) => !going.has(event.userId))
        .map((event) => removeEvent(event.userId, actionId)),
    )
    const existing = new Set(events.map((event) => event.userId))
    const connections = await store.calendarConnections([...going])
    await Promise.all(
      connections
        .filter((connection) => existing.has(connection.userId) || connection.autoWrite)
        .map(async (connection) => {
          // Každý vidí akci po svém (jméno organizátora je pro všechny stejné).
          const action = await store.actionOf(connection.userId, actionId)
          if (action) await writeEvent(connection.userId, action)
        }),
    )
  }

  return {
    available,
    status,
    connect,
    disconnect,
    setAutoWrite,
    sync,
    syncMany,
    writeEvent,
    removeEvent,
    removeEvents,
    afterConfirm,
  }
}

export type CalendarService = ReturnType<typeof createCalendarService>
