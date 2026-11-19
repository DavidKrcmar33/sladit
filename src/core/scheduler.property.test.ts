import { describe, expect, it } from 'vitest'
import { rangesOfDates } from './coverage'
import { attendanceInSlot, DEFAULT_SCHEDULING_RULES, type TimeSlot } from './scheduler'
import type { DateString, PersonSchedule, Shift } from './schema'
import { absoluteMinutes, addDays, eachDay, formatMinutes, toMinutes } from './time'

/**
 * Náhodný test proti hrubé síle: „nevíme“ se nikdy nesmí změnit na „může“.
 *
 * Pro náhodné rozpisy s mezerami v pokrytí se zkouší každé možné doplnění neznámých dnů
 * (směna po půlhodinách, dlouhá až 12 hodin). Plánovač musí odpovědět přesně:
 * - „nemůže“, právě když blokuje známá směna,
 * - „může“, právě když neblokuje známá směna a nemůže blokovat žádná doplněná,
 * - „nevíme“ ve zbytku.
 */

const RULES = DEFAULT_SCHEDULING_RULES
const DAYS = eachDay('2026-11-20', '2026-11-30')
const STEP = 30

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shiftAt(date: DateString, startMinutes: number, durationMinutes: number): Shift {
  return {
    date,
    start: formatMinutes(startMinutes),
    end: formatMinutes((startMinutes + durationMinutes) % (24 * 60)),
    label: '',
    raw: '',
    uncertain: false,
  }
}

/** Pravidla blokování napsaná znovu a nezávisle na plánovači: rezerva kolem směny, spánek po noční. */
function blocks(shift: Shift, slot: TimeSlot): boolean {
  const start = absoluteMinutes(shift.date, shift.start)
  const crossesMidnight = toMinutes(shift.end) <= toMinutes(shift.start)
  const duration = (toMinutes(shift.end) - toMinutes(shift.start) + 24 * 60) % (24 * 60)
  const end = start + duration
  const blockedFrom = start - RULES.shiftBufferMinutes
  const blockedUntil = crossesMidnight
    ? Math.max(
        end + RULES.shiftBufferMinutes,
        absoluteMinutes(addDays(shift.date, 1), RULES.sleepAfterNightShiftUntil),
      )
    : end + RULES.shiftBufferMinutes
  const slotStart = absoluteMinutes(slot.date, slot.start)
  const slotEnd = absoluteMinutes(slot.date, slot.end)
  return blockedFrom < slotEnd && slotStart < blockedUntil
}

/** Existuje směna v neznámém dni, která by čas zablokovala? */
function someHiddenShiftBlocks(unknownDays: Set<DateString>, slot: TimeSlot): boolean {
  for (const date of [addDays(slot.date, -1), slot.date, addDays(slot.date, 1)]) {
    if (!unknownDays.has(date)) continue
    for (let start = 0; start < 24 * 60; start += STEP) {
      for (let duration = STEP; duration <= RULES.maxShiftMinutes; duration += STEP) {
        if (blocks(shiftAt(date, start, duration), slot)) return true
      }
    }
  }
  return false
}

function randomCase(random: () => number) {
  const coveredDays = DAYS.filter(() => random() < 0.6)
  const shifts: Shift[] = []
  for (const date of DAYS) {
    // I v nepokrytém dni může být známá směna (z jiného okruhu, třeba rozvrh).
    const count = coveredDays.includes(date) ? Math.floor(random() * 3) : random() < 0.2 ? 1 : 0
    for (let index = 0; index < count; index++) {
      const start = Math.floor(random() * 48) * STEP
      const duration = (1 + Math.floor(random() * 24)) * STEP
      shifts.push(shiftAt(date, start, duration))
    }
  }
  const schedule: PersonSchedule = { coverage: rangesOfDates(coveredDays), shifts, warnings: [] }

  const date = DAYS[2 + Math.floor(random() * (DAYS.length - 4))]
  const start = Math.floor(random() * 44) * STEP
  const duration = Math.min((1 + Math.floor(random() * 8)) * STEP, 23 * 60 + 30 - start)
  const slot = { date, start: formatMinutes(start), end: formatMinutes(start + duration) }
  const unknownDays = new Set(DAYS.filter((day) => !coveredDays.includes(day)))
  return { schedule, slot, unknownDays }
}

describe('attendanceInSlot proti hrubé síle', () => {
  it('never says “available” when an unknown day could still block the slot', () => {
    const random = seededRandom(20261119)
    const counts = { available: 0, busy: 0, unknown: 0 }
    for (let round = 0; round < 1500; round++) {
      const { schedule, slot, unknownDays } = randomCase(random)
      const attendance = attendanceInSlot(schedule, slot)
      counts[attendance]++

      const knownBlocks = schedule.shifts.some((shift) => blocks(shift, slot))
      const context = JSON.stringify({ slot, schedule })
      if (knownBlocks) {
        expect(attendance, context).toBe('busy')
      } else {
        const expected = someHiddenShiftBlocks(unknownDays, slot) ? 'unknown' : 'available'
        expect(attendance, context).toBe(expected)
      }
    }
    // Všechny tři odpovědi se v náhodných případech musí opravdu objevit.
    expect(counts.available).toBeGreaterThan(100)
    expect(counts.busy).toBeGreaterThan(100)
    expect(counts.unknown).toBeGreaterThan(100)
  })
})
