import { afterEach, expect, it, vi } from 'vitest'
import { CalendarAuthError, realCalendar } from './api'

const calendar = realCalendar('test-client', 'test-secret')
const start = '2026-11-23T08:00:00Z'
const end = '2026-11-23T10:00:00Z'
afterEach(() => vi.unstubAllGlobals())

it('requests availability from the primary calendar and returns its busy intervals', async () => {
  const busy = [{ start, end }]
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ calendars: { primary: { busy } } }))
  vi.stubGlobal('fetch', fetcher)
  await expect(calendar.freeBusy('access', start, end)).resolves.toEqual(busy)
  const [url, request] = fetcher.mock.calls[0]
  expect(url).toBe('https://www.googleapis.com/calendar/v3/freeBusy')
  expect(request?.method).toBe('POST')
  expect(new Headers(request?.headers).get('authorization')).toBe('Bearer access')
  expect(JSON.parse(String(request?.body))).toEqual({
    timeMin: start,
    timeMax: end,
    timeZone: 'Europe/Prague',
    items: [{ id: 'primary' }],
  })
})

it('reports a revoked grant so the user can reconnect the calendar', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
  await expect(calendar.freeBusy('access', start, end)).rejects.toBeInstanceOf(CalendarAuthError)
})

it('treats an error for the primary calendar as an unsuccessful reading', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        calendars: { primary: { errors: [{ reason: 'notFound' }] } },
      }),
    ),
  )
  await expect(calendar.freeBusy('access', start, end)).rejects.toThrow(/Obsazenost/)
})
