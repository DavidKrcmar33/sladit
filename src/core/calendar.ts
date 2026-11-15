import type { Action, DateString, PersonSchedule, Shift } from './schema'
import { dayAttendance, type Attendance } from './scheduler'
import { eachDay } from './time'

export type DayStatus =
  { kind: 'unknown' } | { kind: 'free' } | { kind: 'working'; shifts: Shift[] }

export interface CalendarDay {
  status: DayStatus
  attendance: Attendance
}

export interface CalendarRow {
  personId: string
  personName: string
  days: CalendarDay[]
}

export interface CalendarView {
  dates: DateString[]
  rows: CalendarRow[]
}

export interface PersonDay {
  personId: string
  date: DateString
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
      days: dates.map((date) => ({
        status: dayStatus(person.schedule, date),
        attendance: dayAttendance(action, person.schedule, date),
      })),
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
