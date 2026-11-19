import { isCovered } from './coverage'
import type {
  ActionParams,
  DateString,
  PersonSchedule,
  Proposal,
  Shift,
  TimeString,
} from './schema'
import { absoluteMinutes, addDays, eachDay, formatMinutes, toMinutes } from './time'

export type Attendance = 'available' | 'busy' | 'unknown'

export interface SchedulingRules {
  slotStepMinutes: number
  /** Volný čas před začátkem a po konci směny (cesta, převlečení). */
  shiftBufferMinutes: number
  /** Po směně přes půlnoc je člověk nedostupný minimálně do tohoto času. */
  sleepAfterNightShiftUntil: TimeString
  /**
   * Nejdelší možná směna. Určuje, jak daleko může zasáhnout směna ze dne, o kterém nic nevíme.
   * Delší směnu zákoník práce nedovoluje (§ 83).
   */
  maxShiftMinutes: number
  proposalCount: number
}

export const DEFAULT_SCHEDULING_RULES: SchedulingRules = {
  slotStepMinutes: 30,
  shiftBufferMinutes: 60,
  sleepAfterNightShiftUntil: '14:00',
  maxShiftMinutes: 12 * 60,
  proposalCount: 3,
}

export interface TimeSlot {
  date: DateString
  start: TimeString
  end: TimeString
}

/** Člověk, jak ho vidí plánovač: jen id a hotový rozpis (compose.ts). */
export interface Participant {
  id: string
  schedule: PersonSchedule | null
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

/**
 * Jak daleko do dne může zasáhnout směna z předchozího dne: nejdelší směna začínající těsně
 * před půlnocí i s rezervou, nebo spánek po noční, podle toho, co je později.
 */
function reachFromPreviousDay(rules: SchedulingRules): number {
  return Math.max(
    toMinutes(rules.sleepAfterNightShiftUntil),
    rules.maxShiftMinutes - 1 + rules.shiftBufferMinutes,
  )
}

/**
 * Může člověk v daném čase? „Nemůže“ platí, kdykoli do času zasahuje známá směna.
 * „Může“ jen tehdy, když nic neznámého nemůže zasáhnout: den musí být známý a kolem okrajů dne
 * i sousední dny, ze kterých by mohla dosáhnout noční nebo směna po půlnoci.
 */
export function attendanceInSlot(
  schedule: PersonSchedule | null,
  slot: TimeSlot,
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Attendance {
  if (!schedule) return 'unknown'
  const dayStart = absoluteMinutes(slot.date, '00:00')
  const slotInterval = {
    start: absoluteMinutes(slot.date, slot.start),
    end: absoluteMinutes(slot.date, slot.end),
  }
  const isBusy = schedule.shifts.some((shift) =>
    overlaps(blockedInterval(shift, rules), slotInterval),
  )
  if (isBusy) return 'busy'
  if (!isCovered(schedule.coverage, slot.date)) return 'unknown'

  const previousDayReach = dayStart + reachFromPreviousDay(rules)
  if (
    slotInterval.start < previousDayReach &&
    !isCovered(schedule.coverage, addDays(slot.date, -1))
  ) {
    return 'unknown'
  }
  const nextDayReach = dayStart + 24 * 60 - rules.shiftBufferMinutes
  if (slotInterval.end > nextDayReach && !isCovered(schedule.coverage, addDays(slot.date, 1))) {
    return 'unknown'
  }
  return 'available'
}

/** Možné začátky akce v jednom dni, po krocích z pravidel. */
export function candidateSlots(
  action: ActionParams,
  date: DateString,
  rules: SchedulingRules,
): TimeSlot[] {
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

export interface TimeRange {
  start: TimeString
  end: TimeString
}

export interface DayAvailability {
  attendance: Attendance
  /** Časy, ve kterých se akce ten den vejde, souvislé úseky. Prázdné, když člověk nemůže nebo nevíme. */
  windows: TimeRange[]
  /** Člověk může, ale ne v celém denním okně akce. */
  isPartial: boolean
}

/** Zda se člověk ten den vejde aspoň do jednoho možného začátku akce a ve kterých časech. */
export function dayAvailability(
  action: ActionParams,
  schedule: PersonSchedule | null,
  date: DateString,
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): DayAvailability {
  const slots = candidateSlots(action, date, rules)
  const attendances = slots.map((slot) => attendanceInSlot(schedule, slot, rules))

  const windows: TimeRange[] = []
  slots.forEach((slot, index) => {
    if (attendances[index] !== 'available') return
    const previous = windows.at(-1)
    // Sousední možné začátky se spojí do jednoho úseku.
    if (previous && attendances[index - 1] === 'available') previous.end = slot.end
    else windows.push({ start: slot.start, end: slot.end })
  })

  if (windows.length > 0) {
    return {
      attendance: 'available',
      windows,
      isPartial: attendances.some((a) => a !== 'available'),
    }
  }
  const attendance = attendances.includes('unknown') ? 'unknown' : 'busy'
  return { attendance, windows: [], isPartial: false }
}

/** Zda se člověk ten den vejde aspoň do jednoho možného začátku akce. */
export function dayAttendance(
  action: ActionParams,
  schedule: PersonSchedule | null,
  date: DateString,
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Attendance {
  return dayAvailability(action, schedule, date, rules).attendance
}

const PROPOSAL_GROUP = { available: 'available', busy: 'missing', unknown: 'unknown' } as const

function evaluateSlot(
  participants: Participant[],
  slot: TimeSlot,
  rules: SchedulingRules,
): Proposal {
  const proposal: Proposal = { ...slot, available: [], missing: [], unknown: [] }
  for (const participant of participants) {
    const attendance = attendanceInSlot(participant.schedule, slot, rules)
    proposal[PROPOSAL_GROUP[attendance]].push(participant.id)
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
  action: ActionParams,
  participants: Participant[],
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Proposal[] {
  const bestPerDay: Proposal[] = []
  for (const date of eachDay(action.from, action.to)) {
    const [best] = candidateSlots(action, date, rules)
      .map((slot) => evaluateSlot(participants, slot, rules))
      .filter((proposal) => proposal.available.length > 0)
      .sort(compareProposals)
    if (best) bestPerDay.push(best)
  }
  return bestPerDay.sort(compareProposals).slice(0, rules.proposalCount)
}
