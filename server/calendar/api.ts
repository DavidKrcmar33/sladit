import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { BusyInterval } from '@/core/calendarBusy'
import { TIME_ZONE } from '@/core/calendarBusy'
import type { DateString, TimeString } from '@/core/schema'
import { addDays } from '@/core/time'

/**
 * Google Kalendář: souhlas, obsazenost (freeBusy, jen časy bez názvů) a zápis potvrzené akce
 * do kalendáře „Sladit“, který si aplikace sama založí. Za rozhraním je skutečný Google
 * a falešný pro vývoj a testy.
 */

export const CALENDAR_SCOPES = {
  freeBusy: 'https://www.googleapis.com/auth/calendar.freebusy',
  appCreated: 'https://www.googleapis.com/auth/calendar.app.created',
} as const

/** Token vypršel nebo ho uživatel odvolal. Je potřeba kalendář připojit znovu. */
export class CalendarAuthError extends Error {
  override name = 'CalendarAuthError'
}

export interface CalendarGrant {
  refreshToken: string
  /** Uživatel může na obrazovce souhlasu jednotlivá oprávnění odškrtnout. */
  canReadBusy: boolean
  canWrite: boolean
}

export interface CalendarEvent {
  title: string
  date: DateString
  start: TimeString
  end: TimeString
  description: string
}

export interface CalendarApi {
  authorizationUrl(request: {
    state: string
    codeChallenge: string
    redirectUri: string
    loginHint?: string
  }): string
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<CalendarGrant>
  accessToken(refreshToken: string): Promise<string>
  freeBusy(accessToken: string, timeMin: string, timeMax: string): Promise<BusyInterval[]>
  createCalendar(accessToken: string, name: string): Promise<string>
  /** Založí událost, nebo změní existující. Když existující mezitím zmizela, založí novou. */
  upsertEvent(
    accessToken: string,
    calendarId: string,
    eventId: string | null,
    event: CalendarEvent,
  ): Promise<string>
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>
  revoke(refreshToken: string): Promise<void>
}

function eventBody(event: CalendarEvent) {
  const endDate = event.end <= event.start ? addDays(event.date, 1) : event.date
  return {
    summary: event.title,
    description: event.description,
    start: { dateTime: `${event.date}T${event.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${endDate}T${event.end}:00`, timeZone: TIME_ZONE },
  }
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'

const TokenSchema = z.object({
  refresh_token: z.string().optional(),
  scope: z.string().default(''),
})
const AccessSchema = z.object({ access_token: z.string() })
const FreeBusySchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
      errors: z.array(z.object({ reason: z.string() })).optional(),
    }),
  ),
})
const IdSchema = z.object({ id: z.string() })

export function realCalendar(clientId: string, clientSecret: string): CalendarApi {
  async function call(accessToken: string, method: string, path: string, body?: unknown) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status === 401 || response.status === 403) {
      throw new CalendarAuthError(`Google Kalendář odmítl přístup (${response.status})`)
    }
    return response
  }

  return {
    authorizationUrl({ state, codeChallenge, redirectUri, loginHint }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: `${CALENDAR_SCOPES.freeBusy} ${CALENDAR_SCOPES.appCreated}`,
        include_granted_scopes: 'true',
        access_type: 'offline',
        // Bez souhlasu znovu by Google obnovovací token podruhé nevydal.
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(loginHint ? { login_hint: loginHint } : {}),
      })
      return `${AUTH_URL}?${params}`
    },
    async exchangeCode(code, codeVerifier, redirectUri) {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      })
      if (!response.ok) throw new Error(`Google odmítl kód (${response.status})`)
      const token = TokenSchema.parse(await response.json())
      if (!token.refresh_token) throw new Error('Google nevydal obnovovací token')
      const scopes = token.scope.split(' ')
      return {
        refreshToken: token.refresh_token,
        canReadBusy: scopes.includes(CALENDAR_SCOPES.freeBusy),
        canWrite: scopes.includes(CALENDAR_SCOPES.appCreated),
      }
    },
    async accessToken(refreshToken) {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })
      if (response.status === 400 || response.status === 401) {
        throw new CalendarAuthError('Přístup ke kalendáři vypršel nebo byl odvolán')
      }
      if (!response.ok) throw new Error(`Google nevydal přístupový token (${response.status})`)
      return AccessSchema.parse(await response.json()).access_token
    },
    async freeBusy(accessToken, timeMin, timeMax) {
      const response = await call(accessToken, 'POST', '/freeBusy', {
        timeMin,
        timeMax,
        timeZone: TIME_ZONE,
        items: [{ id: 'primary' }],
      })
      if (!response.ok) throw new Error(`Obsazenost z kalendáře se nenačetla (${response.status})`)
      const primary = FreeBusySchema.parse(await response.json()).calendars.primary
      if (!primary || primary.errors?.length) throw new Error('Obsazenost z kalendáře se nenačetla')
      return primary.busy
    },
    async createCalendar(accessToken, name) {
      const response = await call(accessToken, 'POST', '/calendars', {
        summary: name,
        timeZone: TIME_ZONE,
      })
      if (!response.ok) throw new Error(`Kalendář se nepodařilo založit (${response.status})`)
      return IdSchema.parse(await response.json()).id
    },
    async upsertEvent(accessToken, calendarId, eventId, event) {
      const base = `/calendars/${encodeURIComponent(calendarId)}/events`
      if (eventId) {
        const response = await call(
          accessToken,
          'PATCH',
          `${base}/${encodeURIComponent(eventId)}`,
          eventBody(event),
        )
        if (response.ok) return IdSchema.parse(await response.json()).id
        if (response.status !== 404 && response.status !== 410) {
          throw new Error(`Událost se nepodařilo změnit (${response.status})`)
        }
      }
      const response = await call(accessToken, 'POST', base, eventBody(event))
      if (response.status === 404) throw new CalendarGoneError('Kalendář Sladit už neexistuje')
      if (!response.ok) throw new Error(`Událost se nepodařilo zapsat (${response.status})`)
      return IdSchema.parse(await response.json()).id
    },
    async deleteEvent(accessToken, calendarId, eventId) {
      const response = await call(
        accessToken,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      )
      if (!response.ok && response.status !== 404 && response.status !== 410) {
        throw new Error(`Událost se nepodařilo smazat (${response.status})`)
      }
    },
    async revoke(refreshToken) {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      })
    },
  }
}

/** Kalendář Sladit uživatel mezitím smazal. Založí se nový. */
export class CalendarGoneError extends Error {
  override name = 'CalendarGoneError'
}

/** Falešný Google Kalendář pro vývoj a testy. Obsazenost a zapsané události drží v paměti. */
export interface FakeCalendar extends CalendarApi {
  /** Obsazenost podle e-mailu účtu. */
  busy: Map<string, BusyInterval[]>
  /** Zapsané události podle e-mailu účtu. */
  events: Map<string, Map<string, CalendarEvent & { calendarId: string }>>
  calendars: Map<string, string[]>
  revoked: string[]
  /** Odvolá přístup, jako by vypršel nebo ho uživatel zrušil v účtu Google. */
  expire(email: string): void
  /** Uživatel v souhlasu odškrtne zápis. */
  denyWrite: Set<string>
}

export function fakeCalendarCode(email: string): string {
  return Buffer.from(JSON.stringify({ email, calendar: true })).toString('base64url')
}

export function fakeCalendar(appOrigin: string): FakeCalendar {
  const expired = new Set<string>()
  const fake: FakeCalendar = {
    busy: new Map(),
    events: new Map(),
    calendars: new Map(),
    revoked: [],
    denyWrite: new Set(),
    expire(email) {
      expired.add(email)
    },
    authorizationUrl({ state, redirectUri, loginHint }) {
      const params = new URLSearchParams({
        state,
        redirect_uri: redirectUri,
        login_hint: loginHint ?? '',
      })
      return `${appOrigin}/api/auth/fake-google/calendar?${params}`
    },
    async exchangeCode(code) {
      const { email } = z
        .object({ email: z.string(), calendar: z.literal(true) })
        .parse(JSON.parse(Buffer.from(code, 'base64url').toString('utf8')))
      expired.delete(email)
      return {
        refreshToken: `fake-refresh:${email}:${randomUUID()}`,
        canReadBusy: true,
        canWrite: !fake.denyWrite.has(email),
      }
    },
    async accessToken(refreshToken) {
      const email = refreshToken.split(':')[1]
      if (!email || expired.has(email) || fake.revoked.includes(refreshToken)) {
        throw new CalendarAuthError('Přístup ke kalendáři vypršel nebo byl odvolán')
      }
      return `fake-access:${email}`
    },
    async freeBusy(accessToken, timeMin, timeMax) {
      const email = accessToken.split(':')[1]
      return (fake.busy.get(email) ?? []).filter(
        (interval) =>
          new Date(interval.end) > new Date(timeMin) &&
          new Date(interval.start) < new Date(timeMax),
      )
    },
    async createCalendar(accessToken, name) {
      const email = accessToken.split(':')[1]
      const id = `${name}-${randomUUID()}`
      fake.calendars.set(email, [...(fake.calendars.get(email) ?? []), id])
      return id
    },
    async upsertEvent(accessToken, calendarId, eventId, event) {
      const email = accessToken.split(':')[1]
      if (!fake.calendars.get(email)?.includes(calendarId)) {
        throw new CalendarGoneError('Kalendář Sladit už neexistuje')
      }
      const events = fake.events.get(email) ?? new Map()
      const id = eventId && events.has(eventId) ? eventId : randomUUID()
      events.set(id, { ...event, calendarId })
      fake.events.set(email, events)
      return id
    },
    async deleteEvent(accessToken, _calendarId, eventId) {
      fake.events.get(accessToken.split(':')[1])?.delete(eventId)
    },
    async revoke(refreshToken) {
      fake.revoked.push(refreshToken)
    },
  }
  return fake
}
