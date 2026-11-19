import type { DateString, Shift, TimeString } from './schema'
import { addDays } from './time'

/** Časové pásmo, ve kterém aplikace počítá dny a časy. */
export const TIME_ZONE = 'Europe/Prague'

/** Obsazený úsek z Google Kalendáře: jen začátek a konec, žádný název. */
export interface BusyInterval {
  start: string
  end: string
}

/** Označení úseku z kalendáře v rozpisu. */
export const CALENDAR_LABEL = 'Kalendář'

function localParts(ms: number, timeZone: string): { date: DateString; time: TimeString } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

/** Okamžik (ms UTC), kdy je v daném pásmu dané datum a čas. */
export function zonedTime(date: DateString, time: TimeString, timeZone = TIME_ZONE): number {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  let result = asUtc
  // Dvě iterace stačí i na přechod letního času.
  for (let i = 0; i < 2; i++) {
    const local = localParts(result, timeZone)
    const [ly, lm, ld] = local.date.split('-').map(Number)
    const [lh, lmin] = local.time.split(':').map(Number)
    const shownAsUtc = Date.UTC(ly, lm - 1, ld, lh, lmin)
    result += asUtc - shownAsUtc
  }
  return result
}

/**
 * Obsazené úseky z kalendáře jako směny po dnech v daném pásmu. Úsek přes půlnoc se rozdělí,
 * aby se na něj nevztahovalo pravidlo spánku po noční směně: večerní akce do půlnoci
 * neblokuje celé další dopoledne.
 */
export function busyToShifts(intervals: BusyInterval[], timeZone = TIME_ZONE): Shift[] {
  const shifts: Shift[] = []
  for (const interval of intervals) {
    const end = new Date(interval.end).getTime()
    let cursor = new Date(interval.start).getTime()
    if (!(cursor < end)) continue
    while (cursor < end) {
      const { date, time } = localParts(cursor, timeZone)
      const nextMidnight = zonedTime(addDays(date, 1), '00:00', timeZone)
      const segmentEnd = Math.min(end, nextMidnight)
      const endTime = segmentEnd === nextMidnight ? '23:59' : localParts(segmentEnd, timeZone).time
      if (endTime > time) {
        shifts.push({
          date,
          start: time,
          end: endTime,
          label: CALENDAR_LABEL,
          raw: '',
          uncertain: false,
        })
      }
      cursor = segmentEnd
    }
  }
  return shifts.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
}
