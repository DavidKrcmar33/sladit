import type { Action, DateString, PersonSchedule, Shift } from './schema'

export type DayStatus =
  { kind: 'unknown' } | { kind: 'free' } | { kind: 'working'; shifts: Shift[] }

export interface CalendarRow {
  personId: string
  personName: string
  days: DayStatus[]
}

export interface CalendarView {
  dates: DateString[]
  rows: CalendarRow[]
}

export interface PersonDay {
  personId: string
  date: DateString
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

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

export function dayStatus(schedule: PersonSchedule | null, date: DateString): DayStatus {
  if (!schedule || date < schedule.coveredFrom || date > schedule.coveredTo) {
    return { kind: 'unknown' }
  }
  const shifts = schedule.shifts.filter((shift) => shift.date === date)
  return shifts.length === 0 ? { kind: 'free' } : { kind: 'working', shifts }
}

export function buildCalendar(action: Action): CalendarView {
  const dates = eachDay(action.from, action.to)
  return {
    dates,
    rows: action.people.map((person) => ({
      personId: person.id,
      personName: person.name,
      days: dates.map((date) => dayStatus(person.schedule, date)),
    })),
  }
}

export function findUncertainDays(action: Action): PersonDay[] {
  const uncertainDays: PersonDay[] = []
  for (const person of action.people) {
    const dates = new Set(
      person.schedule?.shifts.filter((shift) => shift.uncertain).map((shift) => shift.date),
    )
    for (const date of [...dates].sort()) {
      uncertainDays.push({ personId: person.id, date })
    }
  }
  return uncertainDays
}
