import type { DateString, TimeString } from './schema'

export const MINUTES_PER_DAY = 24 * 60
const MS_PER_DAY = MINUTES_PER_DAY * 60 * 1000

function toUtcMs(date: DateString): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMs(ms: number): DateString {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: DateString, days: number): DateString {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY)
}

export function eachDay(from: DateString, to: DateString): DateString[] {
  const dates: DateString[] = []
  for (let ms = toUtcMs(from); ms <= toUtcMs(to); ms += MS_PER_DAY) {
    dates.push(fromUtcMs(ms))
  }
  return dates
}

export function toMinutes(time: TimeString): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatMinutes(minutesAfterMidnight: number): TimeString {
  const hours = String(Math.floor(minutesAfterMidnight / 60)).padStart(2, '0')
  const minutes = String(minutesAfterMidnight % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Minuty od 1. 1. 1970 v UTC, aby šly porovnávat časy napříč dny. */
export function absoluteMinutes(date: DateString, time: TimeString): number {
  return toUtcMs(date) / 60_000 + toMinutes(time)
}

/** Den v týdnu: 1 = pondělí až 7 = neděle. */
export function weekdayOf(date: DateString): number {
  return new Date(toUtcMs(date)).getUTCDay() || 7
}

/** Pondělí téhož týdne. */
export function mondayOf(date: DateString): DateString {
  return addDays(date, 1 - weekdayOf(date))
}

/** Počet dnů od from do to (záporný, když je to dřív). */
export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

/** Číslo týdne podle ISO 8601 (týden začíná pondělím, první týden obsahuje první čtvrtek roku). */
export function isoWeek(date: DateString): number {
  const thursday = toUtcMs(date) + (4 - weekdayOf(date)) * MS_PER_DAY
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1)
  return Math.floor((thursday - yearStart) / MS_PER_DAY / 7) + 1
}
