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
