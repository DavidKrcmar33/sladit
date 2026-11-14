import { describe, expect, it } from 'vitest'
import { ActionSchema, PersonScheduleSchema, ProposalSchema, ShiftSchema } from './schema'
import { sampleAction } from './fixtures'

const validShift = { date: '2026-11-24', start: '06:00', end: '14:00', label: 'R' }

describe('ShiftSchema', () => {
  it('accepts a day shift and fills in defaults', () => {
    const shift = ShiftSchema.parse(validShift)
    expect(shift.uncertain).toBe(false)
    expect(shift.raw).toBe('')
  })

  it('accepts a night shift that ends the next day', () => {
    const result = ShiftSchema.safeParse({ ...validShift, start: '22:00', end: '06:00' })
    expect(result.success).toBe(true)
  })

  it('rejects a time outside the 24-hour clock', () => {
    const result = ShiftSchema.safeParse({ ...validShift, end: '25:00' })
    expect(result.success).toBe(false)
  })

  it('rejects a shift without a date', () => {
    const result = ShiftSchema.safeParse({ start: '06:00', end: '14:00', label: 'R' })
    expect(result.success).toBe(false)
  })

  it('rejects a date that does not exist in the calendar', () => {
    const result = ShiftSchema.safeParse({ ...validShift, date: '2026-02-30' })
    expect(result.success).toBe(false)
  })

  it('rejects a shift with zero length', () => {
    const result = ShiftSchema.safeParse({ ...validShift, start: '08:00', end: '08:00' })
    expect(result.success).toBe(false)
  })
})

describe('PersonScheduleSchema', () => {
  it('rejects coverage that ends before it starts', () => {
    const result = PersonScheduleSchema.safeParse({
      coveredFrom: '2026-11-29',
      coveredTo: '2026-11-23',
      shifts: [],
    })
    expect(result.success).toBe(false)
  })

  it('defaults warnings to an empty list', () => {
    const schedule = PersonScheduleSchema.parse({
      coveredFrom: '2026-11-23',
      coveredTo: '2026-11-29',
      shifts: [validShift],
    })
    expect(schedule.warnings).toEqual([])
  })
})

describe('ActionSchema', () => {
  it('accepts the sample action used across the app', () => {
    const result = ActionSchema.safeParse(sampleAction)
    expect(result.success).toBe(true)
  })

  it('rejects a daily window that ends before it starts', () => {
    const result = ActionSchema.safeParse({
      ...sampleAction,
      windowStart: '23:00',
      windowEnd: '16:00',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a duration that is not a multiple of 30 minutes', () => {
    const result = ActionSchema.safeParse({ ...sampleAction, durationMinutes: 45 })
    expect(result.success).toBe(false)
  })

  it('rejects a person without a name', () => {
    const [first, ...rest] = sampleAction.people
    const result = ActionSchema.safeParse({
      ...sampleAction,
      people: [{ ...first, name: '' }, ...rest],
    })
    expect(result.success).toBe(false)
  })
})

describe('ProposalSchema', () => {
  it('accepts a proposal listing who can come and who is missing', () => {
    const result = ProposalSchema.safeParse({
      date: '2026-11-27',
      start: '18:00',
      end: '21:00',
      available: ['anna', 'petr'],
      missing: ['jana'],
      unknown: [],
    })
    expect(result.success).toBe(true)
  })
})
