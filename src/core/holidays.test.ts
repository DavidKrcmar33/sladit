import { describe, expect, it } from 'vitest'
import { czechHolidayName } from './holidays'

describe('czechHolidayName', () => {
  it('knows the fixed public holidays', () => {
    expect(czechHolidayName('2026-11-17')).toBe('Den boje za svobodu a demokracii')
    expect(czechHolidayName('2026-10-28')).toBe('Den vzniku samostatného československého státu')
    expect(czechHolidayName('2026-12-24')).toBe('Štědrý den')
  })

  it('computes Good Friday and Easter Monday', () => {
    expect(czechHolidayName('2026-04-03')).toBe('Velký pátek')
    expect(czechHolidayName('2026-04-06')).toBe('Velikonoční pondělí')
    expect(czechHolidayName('2025-04-18')).toBe('Velký pátek')
    expect(czechHolidayName('2025-04-21')).toBe('Velikonoční pondělí')
  })

  it('returns null on an ordinary day', () => {
    expect(czechHolidayName('2026-11-18')).toBeNull()
    expect(czechHolidayName('2026-04-05')).toBeNull()
  })
})
