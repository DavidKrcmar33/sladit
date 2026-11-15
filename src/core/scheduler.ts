import type { Action, DateString, PersonSchedule, Proposal, Shift, TimeString } from './schema'
import { absoluteMinutes, addDays, eachDay, formatMinutes, toMinutes } from './time'

export type Attendance = 'available' | 'busy' | 'unknown'

export interface SchedulingRules {
  slotStepMinutes: number
  /** Volný čas před začátkem a po konci směny (cesta, převlečení). */
  shiftBufferMinutes: number
  /** Po směně přes půlnoc je člověk nedostupný minimálně do tohoto času. */
  sleepAfterNightShiftUntil: TimeString
  proposalCount: number
}

export const DEFAULT_SCHEDULING_RULES: SchedulingRules = {
  slotStepMinutes: 30,
  shiftBufferMinutes: 60,
  sleepAfterNightShiftUntil: '14:00',
  proposalCount: 3,
}

export interface TimeSlot {
  date: DateString
  start: TimeString
  end: TimeString
}

interface Interval {
  start: number
  end: number
}

function blockedInterval(shift: Shift, rules: SchedulingRules): Interval {
  const start = absoluteMinutes(shift.date, shift.start)
  const endsNextDay = shift.end <= shift.start
  const end = absoluteMinutes(endsNextDay ? addDays(shift.date, 1) : shift.date, shift.end)
  const blockedUntil = endsNextDay
    ? Math.max(
        end + rules.shiftBufferMinutes,
        absoluteMinutes(addDays(shift.date, 1), rules.sleepAfterNightShiftUntil),
      )
    : end + rules.shiftBufferMinutes
  return { start: start - rules.shiftBufferMinutes, end: blockedUntil }
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

export function attendanceInSlot(
  schedule: PersonSchedule | null,
  slot: TimeSlot,
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Attendance {
  if (!schedule || slot.date < schedule.coveredFrom || slot.date > schedule.coveredTo) {
    return 'unknown'
  }
  const slotInterval = {
    start: absoluteMinutes(slot.date, slot.start),
    end: absoluteMinutes(slot.date, slot.end),
  }
  const isBusy = schedule.shifts.some((shift) =>
    overlaps(blockedInterval(shift, rules), slotInterval),
  )
  return isBusy ? 'busy' : 'available'
}

function candidateSlots(action: Action, date: DateString, rules: SchedulingRules): TimeSlot[] {
  const slots: TimeSlot[] = []
  const lastStart = toMinutes(action.windowEnd) - action.durationMinutes
  for (
    let start = toMinutes(action.windowStart);
    start <= lastStart;
    start += rules.slotStepMinutes
  ) {
    slots.push({
      date,
      start: formatMinutes(start),
      end: formatMinutes(start + action.durationMinutes),
    })
  }
  return slots
}

/** Zda se člověk ten den vejde aspoň do jednoho možného začátku akce. */
export function dayAttendance(
  action: Action,
  schedule: PersonSchedule | null,
  date: DateString,
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Attendance {
  const attendances = candidateSlots(action, date, rules).map((slot) =>
    attendanceInSlot(schedule, slot, rules),
  )
  if (attendances.includes('available')) return 'available'
  if (attendances.includes('unknown')) return 'unknown'
  return 'busy'
}

const PROPOSAL_GROUP = { available: 'available', busy: 'missing', unknown: 'unknown' } as const

function evaluateSlot(action: Action, slot: TimeSlot, rules: SchedulingRules): Proposal {
  const proposal: Proposal = { ...slot, available: [], missing: [], unknown: [] }
  for (const person of action.people) {
    const attendance = attendanceInSlot(person.schedule, slot, rules)
    proposal[PROPOSAL_GROUP[attendance]].push(person.id)
  }
  return proposal
}

function compareProposals(a: Proposal, b: Proposal): number {
  return (
    b.available.length - a.available.length ||
    a.missing.length - b.missing.length ||
    a.date.localeCompare(b.date) ||
    a.start.localeCompare(b.start)
  )
}

export function findProposals(
  action: Action,
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Proposal[] {
  const bestPerDay: Proposal[] = []
  for (const date of eachDay(action.from, action.to)) {
    const [best] = candidateSlots(action, date, rules)
      .map((slot) => evaluateSlot(action, slot, rules))
      .filter((proposal) => proposal.available.length > 0)
      .sort(compareProposals)
    if (best) bestPerDay.push(best)
  }
  return bestPerDay.sort(compareProposals).slice(0, rules.proposalCount)
}
