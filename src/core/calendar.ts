import type { ComposedPerson } from './compose'
import { isCovered } from './coverage'
import type { ActionParams, DateString, PersonSchedule, Shift } from './schema'
import { dayAvailability, type Attendance, type TimeRange } from './scheduler'
import { eachDay } from './time'

/**
 * Stav dne podle rozpisu. U neznámého dne jsou směny to, co o něm přesto víme,
 * třeba výuka z rozvrhu, když chybí rozpis z práce. `private` je den člověka, jehož rozpis
 * přihlášený nevidí: víme jen, zda může, nemůže, nebo nevíme (attendance).
 */
export type DayStatus =
  | { kind: 'unknown'; shifts: Shift[] }
  | { kind: 'free' }
  | { kind: 'working'; shifts: Shift[] }
  | { kind: 'private' }

export interface CalendarDay {
  status: DayStatus
  attendance: Attendance
  /** Časy, ve kterých se akce ten den vejde. */
  windows: TimeRange[]
  /** Člověk může, ale ne v celém denním okně akce. */
  isPartial: boolean
}

export interface CalendarRow {
  personId: string
  personName: string
  days: CalendarDay[]
  /** Rozpis vidí jen jeho vlastník, řádek nejde upravit. */
  isPrivate?: boolean
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
  const shifts = schedule?.shifts.filter((shift) => shift.date === date) ?? []
  if (!schedule || !isCovered(schedule.coverage, date)) return { kind: 'unknown', shifts }
  return shifts.length === 0 ? { kind: 'free' } : { kind: 'working', shifts }
}

export function buildCalendar(action: ActionParams, people: ComposedPerson[]): CalendarView {
  const dates = eachDay(action.from, action.to)
  return {
    dates,
    rows: people.map((person) => ({
      personId: person.id,
      personName: person.name,
      days: dates.map((date) => ({
        status: dayStatus(person.schedule, date),
        ...dayAvailability(action, person.schedule, date),
      })),
    })),
  }
}

/**
 * Řádek člověka, jehož rozpis přihlášený nevidí. Stav dne spočítal server, dokud nedorazí,
 * je každý den „nevíme“.
 */
export function privateRow(
  personId: string,
  personName: string,
  dates: DateString[],
  attendances: Attendance[] | undefined,
): CalendarRow {
  return {
    personId,
    personName,
    isPrivate: true,
    days: dates.map((_, index) => ({
      status: { kind: 'private' },
      attendance: attendances?.[index] ?? 'unknown',
      windows: [],
      isPartial: false,
    })),
  }
}

/** Dny v období akce, kde je aspoň jedna nejistá směna. */
export function findUncertainDays(action: ActionParams, people: ComposedPerson[]): PersonDay[] {
  const uncertainDays: PersonDay[] = []
  for (const person of people) {
    const dates = new Set(
      person.schedule?.shifts
        .filter((shift) => shift.uncertain && action.from <= shift.date && shift.date <= action.to)
        .map((shift) => shift.date),
    )
    for (const date of [...dates].sort()) {
      uncertainDays.push({ personId: person.id, date })
    }
  }
  return uncertainDays
}

export interface PersonWarnings {
  personId: string
  personName: string
  warnings: string[]
}

/** Poznámky ke čtení a ke skládání rozpisu, třeba že podklad nepokrývá hledané období. */
export function findReadingWarnings(people: ComposedPerson[]): PersonWarnings[] {
  return people.flatMap((person) =>
    person.schedule && person.schedule.warnings.length > 0
      ? [{ personId: person.id, personName: person.name, warnings: person.schedule.warnings }]
      : [],
  )
}
