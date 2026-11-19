import { isCovered, normalizeRanges, rangesOfDates } from './coverage'
import type { ActionParams, DateRange, DateString, PersonSchedule, Proposal } from './schema'
import {
  attendanceInSlot,
  candidateSlots,
  DEFAULT_SCHEDULING_RULES,
  findProposals,
  type Participant,
  type SchedulingRules,
} from './scheduler'
import { addDays, eachDay } from './time'

/**
 * Jistý, nebo křehký termín. Analýza citlivosti nejlepšího návrhu na chybějící a nejistá data.
 *
 * Pro každý možný čas se spočítají dvě meze účasti:
 * - dolní: kdo může jistě, i kdyby se všechna chybějící data a nejistá čtení ukázala nejhůř,
 * - horní: kdo by mohl, kdyby se ukázala nejlíp.
 * Den nejlepšího návrhu je jistý, když žádný jiný den ani v nejlepším případě nepředčí to,
 * co má on v nejhorším. Nepočítá se žádná pravděpodobnost ani hodnota informace, jen meze.
 */

export type PivotReason = 'missing' | 'uncertain'

/** Člověk, jehož data v daný den mohou změnit nejlepší termín. */
export interface Pivot {
  personId: string
  dates: { date: DateString; reason: PivotReason }[]
}

export interface Stability {
  /** Nejlepší návrh podle dnešních dat, null když žádný není. */
  winner: Proposal | null
  /** Den nejlepšího návrhu se nezmění, ať se chybějící a nejistá data ukážou jakkoli. */
  certain: boolean
  /** Na čích datech a ve kterých dnech to stojí. Prázdné, když je termín jistý. */
  pivots: Pivot[]
}

/** Dny, ve kterých je aspoň jedna nejistá směna. */
function uncertainDates(schedule: PersonSchedule): DateString[] {
  return [...new Set(schedule.shifts.filter((shift) => shift.uncertain).map((shift) => shift.date))]
}

function withoutDates(ranges: DateRange[], dates: DateString[]): DateRange[] {
  const removed = new Set(dates)
  const kept: DateString[] = []
  for (const range of normalizeRanges(ranges)) {
    for (const date of eachDay(range.from, range.to)) {
      if (!removed.has(date)) kept.push(date)
    }
  }
  return rangesOfDates(kept)
}

/**
 * Rozpis jen z toho, čemu se dá věřit: dny s nejistou směnou se berou jako neznámé.
 * Nejistá směna znamená hlavně odhadnuté časy, takže o celém dni nevíme jistě nic.
 * Plánovač pak sám zařídí, že neznámý den neudělá „může“ ani ze sousedního rána nebo večera.
 */
export function certainPart(schedule: PersonSchedule | null): PersonSchedule | null {
  if (!schedule) return null
  const doubtful = uncertainDates(schedule)
  if (doubtful.length === 0) return schedule
  return {
    ...schedule,
    coverage: withoutDates(schedule.coverage, doubtful),
    shifts: schedule.shifts.filter((shift) => !shift.uncertain),
  }
}

interface SlotBounds {
  date: DateString
  start: string
  lower: number
  upper: number
  /** Kdo je v tomto čase otevřený: může, nebo nemůže, podle toho, jak se data ukážou. */
  open: string[]
}

function slotBounds(
  action: ActionParams,
  certain: Participant[],
  rules: SchedulingRules,
): SlotBounds[] {
  const bounds: SlotBounds[] = []
  for (const date of eachDay(action.from, action.to)) {
    for (const slot of candidateSlots(action, date, rules)) {
      let lower = 0
      const open: string[] = []
      for (const participant of certain) {
        const attendance = attendanceInSlot(participant.schedule, slot, rules)
        if (attendance === 'available') lower++
        else if (attendance === 'unknown') open.push(participant.id)
      }
      bounds.push({ date, start: slot.start, lower, upper: lower + open.length, open })
    }
  }
  return bounds
}

function maxOf(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0)
}

/** Proč je člověk v ten den otevřený: chybí mu rozpis (i v předchozím dni), nebo je čtení nejisté. */
function reasonFor(schedule: PersonSchedule | null, date: DateString): PivotReason {
  if (!schedule) return 'missing'
  const known =
    isCovered(schedule.coverage, date) && isCovered(schedule.coverage, addDays(date, -1))
  return known ? 'uncertain' : 'missing'
}

export function analyzeStability(
  action: ActionParams,
  participants: Participant[],
  rules: SchedulingRules = DEFAULT_SCHEDULING_RULES,
): Stability {
  const [winner = null] = findProposals(action, participants, rules)
  if (!winner) return { winner: null, certain: false, pivots: [] }

  const certain = participants.map((participant) => ({
    id: participant.id,
    schedule: certainPart(participant.schedule),
  }))
  const bounds = slotBounds(action, certain, rules)
  const winnerLower = maxOf(bounds.filter((slot) => slot.date === winner.date).map((s) => s.lower))

  // Časy jiných dnů, které by vítěze v nejlepším případě předběhly. Až budou data úplná, rozhoduje
  // při rovnosti dřívější den, takže dřívějšímu dni stačí vyrovnat, pozdější musí předčít.
  const rivals = bounds.filter(
    (slot) =>
      slot.date !== winner.date &&
      (slot.date < winner.date ? slot.upper >= winnerLower : slot.upper > winnerLower),
  )
  if (rivals.length === 0) return { winner, certain: true, pivots: [] }

  // Kdo může vítězný den shodit (otevřený v čase vítěze) a kdo může pomoct jinému dni.
  const winnerSlot = bounds.find((slot) => slot.date === winner.date && slot.start === winner.start)
  const datesByPerson = new Map<string, Set<DateString>>()
  for (const slot of [...(winnerSlot ? [winnerSlot] : []), ...rivals]) {
    for (const personId of slot.open) {
      datesByPerson.set(personId, (datesByPerson.get(personId) ?? new Set()).add(slot.date))
    }
  }

  const pivots = participants
    .filter((participant) => datesByPerson.has(participant.id))
    .map((participant) => ({
      personId: participant.id,
      dates: [...datesByPerson.get(participant.id)!].sort().map((date) => ({
        date,
        reason: reasonFor(participant.schedule, date),
      })),
    }))
  return { winner, certain: false, pivots }
}
