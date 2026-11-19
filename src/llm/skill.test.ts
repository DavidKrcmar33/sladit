import { describe, expect, it } from 'vitest'
import { composeSchedule } from '@/core/compose'
import { expandReading } from './expand'
import { ReadingSchema } from './reading'
import { buildSystemInstruction, examples, systemInstruction } from './skill'

describe('buildSystemInstruction', () => {
  it('puts the skill first, then the glossary, then the examples', () => {
    const text = buildSystemInstruction('SKILL', 'GLOSSARY', [
      { name: 'a', input: 'vstup A', output: '{"a":1}' },
      { name: 'b', input: 'vstup B', output: '{"b":2}' },
    ])

    expect(text.indexOf('SKILL')).toBeLessThan(text.indexOf('GLOSSARY'))
    expect(text.indexOf('GLOSSARY')).toBeLessThan(text.indexOf('vstup A'))
    expect(text.indexOf('vstup A')).toBeLessThan(text.indexOf('{"b":2}'))
  })

  it('omits the examples section when there are none', () => {
    expect(buildSystemInstruction('SKILL', 'GLOSSARY', [])).not.toMatch(/příklad/i)
  })
})

describe('systemInstruction', () => {
  it('is built from the bundled skill files and examples', () => {
    expect(systemInstruction).toContain('Čteš rozpis směn jedné osoby')
    expect(systemInstruction).toContain('Slovník zkratek')
    expect(systemInstruction).toContain('Rozpis kavárna Rynek')
    expect(systemInstruction).toContain('"from": "2026-03-02"')
    expect(systemInstruction).toContain('Týdenní rozvrh')
    expect(systemInstruction).toContain('Jména v podkladech')
    expect(systemInstruction).toContain('Lichý týden (dle kalendáře)')
  })
})

describe('examples', () => {
  it.each(examples.map((example) => [example.name, example] as const))(
    '%s matches the reading schema',
    (_name, example) => {
      expect(ReadingSchema.safeParse(JSON.parse(example.output)).error?.issues).toBeUndefined()
    },
  )

  it('the timetable example expands to the lessons of an even week', () => {
    const timetable = examples.find((example) => example.name === 'tydenni-rozvrh')!
    const reading = ReadingSchema.parse(JSON.parse(timetable.output))

    const expansion = expandReading(reading, '2026-10-12', '2026-10-18')
    const schedule = composeSchedule(
      {
        sources: [
          {
            id: 'rozvrh',
            circle: 'Škola',
            files: [],
            coverage: expansion.coverage,
            shifts: expansion.shifts,
            warnings: [],
            parity: { calendar: reading.weekParity === 'calendar', anchors: [] },
          },
        ],
        overrides: [],
      },
      { from: '2026-10-12', to: '2026-10-18' },
    )!
    const inWeek = schedule.shifts.filter(
      (shift) => shift.date >= '2026-10-12' && shift.date <= '2026-10-18',
    )

    // 12. 10. a 15. 10. jsou volné dny, čtvrteční ranní předmět je jen v lichém týdnu (dle kalendáře).
    expect(inWeek.map((shift) => `${shift.date} ${shift.start}`)).toEqual([
      '2026-10-14 09:00',
      '2026-10-14 13:00',
      '2026-10-14 15:00',
      '2026-10-14 17:00',
    ])
  })
})
