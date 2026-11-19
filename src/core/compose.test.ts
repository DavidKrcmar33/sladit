import { describe, expect, it } from 'vitest'
import { composePeople, composeSchedule, findParityQuestions, PARITY_WARNING } from './compose'
import { sampleAction } from './fixtures'
import {
  SCHOOL_CIRCLE,
  WORK_CIRCLE,
  type Action,
  type DayOverride,
  type Shift,
  type Source,
} from './schema'

function shift(date: string, start: string, end: string, extra: Partial<Shift> = {}): Shift {
  return { date, start, end, label: 'R', raw: '', uncertain: false, ...extra }
}

let nextId = 0
function source(
  coverage: [string, string][],
  shifts: Shift[],
  extra: Partial<Source> = {},
): Source {
  return {
    id: `s${++nextId}`,
    circle: WORK_CIRCLE,
    files: [],
    coverage: coverage.map(([from, to]) => ({ from, to })),
    shifts,
    warnings: [],
    parity: { calendar: false, anchors: [] },
    ...extra,
  }
}

function compose(sources: Source[], overrides: DayOverride[] = [], period?: [string, string]) {
  return composeSchedule(
    { sources, overrides },
    period ? { from: period[0], to: period[1] } : undefined,
  )!
}

describe('composeSchedule', () => {
  it('has no schedule without sources and manual edits', () => {
    expect(composeSchedule({ sources: [], overrides: [] })).toBeNull()
  })

  it('adds up two months of the same circle without losing either', () => {
    const november = source([['2026-11-01', '2026-11-30']], [shift('2026-11-24', '06:00', '14:00')])
    const december = source([['2026-12-01', '2026-12-31']], [shift('2026-12-02', '06:00', '14:00')])
    const schedule = compose([november, december])
    expect(schedule.coverage).toEqual([{ from: '2026-11-01', to: '2026-12-31' }])
    expect(schedule.shifts.map((item) => item.date)).toEqual(['2026-11-24', '2026-12-02'])
  })

  it('knows a day only when every circle covers it', () => {
    // Rozvrh do 18. 12., směny jen do 6. 12.: po 6. 12. nevíme, nemá volno.
    const school = source([['2026-09-21', '2026-12-18']], [], { circle: SCHOOL_CIRCLE })
    const work = source([['2026-11-01', '2026-12-06']], [])
    expect(compose([school, work]).coverage).toEqual([{ from: '2026-11-01', to: '2026-12-06' }])
  })

  it('keeps the gap between two separate periods unknown', () => {
    const first = source([['2026-11-01', '2026-11-10']], [])
    const second = source([['2026-11-20', '2026-11-30']], [])
    expect(compose([first, second]).coverage).toHaveLength(2)
  })

  it('keeps shifts from every circle, also on days another circle does not cover', () => {
    const school = source([['2026-09-21', '2026-12-18']], [shift('2026-12-10', '09:00', '11:00')], {
      circle: SCHOOL_CIRCLE,
    })
    const work = source([['2026-11-01', '2026-12-06']], [shift('2026-11-24', '14:00', '22:00')])
    expect(compose([school, work]).shifts.map((item) => item.date)).toEqual([
      '2026-11-24',
      '2026-12-10',
    ])
  })

  it('warns when two sources of one circle cover the same days, and counts both', () => {
    const old = source([['2026-11-01', '2026-11-30']], [shift('2026-11-24', '06:00', '14:00')])
    const updated = source([['2026-11-16', '2026-11-30']], [shift('2026-11-25', '06:00', '14:00')])
    const schedule = compose([old, updated])
    expect(schedule.shifts).toHaveLength(2)
    expect(schedule.warnings.join(' ')).toMatch(
      /okruhu Práce pokrývají stejné dny \(16\. 11\.–30\. 11\.\)/,
    )
  })

  it('counts the same shift from two sources once', () => {
    const one = source([['2026-11-23', '2026-11-29']], [shift('2026-11-24', '06:00', '14:00')])
    const two = source(
      [['2026-11-23', '2026-11-29']],
      [shift('2026-11-24', '06:00', '14:00', { uncertain: true })],
    )
    expect(compose([one, two]).shifts).toEqual([
      shift('2026-11-24', '06:00', '14:00', { uncertain: true }),
    ])
  })

  describe('manual edits', () => {
    const roster = source([['2026-11-23', '2026-11-29']], [shift('2026-11-24', '06:00', '14:00')])

    it('replace the shifts of their day', () => {
      const edit = { date: '2026-11-24', shifts: [shift('2026-11-24', '14:00', '22:00')] }
      expect(compose([roster], [edit]).shifts).toEqual(edit.shifts)
    })

    it('cover exactly their day, the days in between stay unknown', () => {
      const edit = { date: '2026-12-02', shifts: [] }
      expect(compose([roster], [edit]).coverage).toEqual([
        { from: '2026-11-23', to: '2026-11-29' },
        { from: '2026-12-02', to: '2026-12-02' },
      ])
    })

    it('survive a new source for the same days', () => {
      const edit = { date: '2026-11-24', shifts: [] }
      const newer = source([['2026-11-23', '2026-11-29']], [shift('2026-11-24', '06:00', '14:00')])
      expect(compose([roster, newer], [edit]).shifts).toEqual([])
    })

    it('work for a person without any read source', () => {
      const edit = { date: '2026-11-24', shifts: [] }
      expect(compose([], [edit])).toEqual({
        coverage: [{ from: '2026-11-24', to: '2026-11-24' }],
        shifts: [],
        warnings: [],
      })
    })
  })

  describe('odd and even weeks', () => {
    const timetable = source(
      [['2026-11-23', '2026-12-06']],
      [
        shift('2026-11-24', '10:00', '11:30', { weeks: 'even', raw: 'Programování' }),
        shift('2026-11-24', '10:00', '11:30', { weeks: 'odd', raw: 'Databáze' }),
        shift('2026-12-01', '10:00', '11:30', { weeks: 'even', raw: 'Programování' }),
        shift('2026-12-01', '10:00', '11:30', { weeks: 'odd', raw: 'Databáze' }),
      ],
      { circle: SCHOOL_CIRCLE },
    )

    it('keeps both as uncertain and says so until somebody confirms', () => {
      const schedule = compose([timetable])
      expect(schedule.shifts).toHaveLength(4)
      expect(schedule.shifts.every((item) => item.uncertain)).toBe(true)
      expect(schedule.warnings).toEqual([PARITY_WARNING])
    })

    it('keeps only the right block once the week is confirmed', () => {
      const confirmed = {
        ...timetable,
        parity: { calendar: false, anchors: [{ date: '2026-11-24', odd: false }] },
      }
      expect(
        compose([confirmed]).shifts.map((item) => [item.date, item.raw, item.uncertain]),
      ).toEqual([
        ['2026-11-24', 'Programování', false],
        ['2026-12-01', 'Databáze', false],
      ])
      expect(compose([confirmed]).warnings).toEqual([])
    })

    it('follows the calendar when the document says so', () => {
      const calendar = { ...timetable, parity: { calendar: true, anchors: [] } }
      // Týden 48 je sudý, týden 49 lichý.
      expect(compose([calendar]).shifts.map((item) => item.raw)).toEqual([
        'Programování',
        'Databáze',
      ])
    })
  })

  describe('with a period', () => {
    const roster = source(
      [['2026-11-01', '2026-11-30']],
      [
        shift('2026-11-10', '06:00', '14:00'),
        shift('2026-11-22', '22:00', '06:00', { label: 'N' }),
        shift('2026-11-24', '06:00', '14:00'),
      ],
    )

    it('keeps the period and the day before and after it', () => {
      const schedule = compose([roster], [], ['2026-11-23', '2026-11-29'])
      expect(schedule.coverage).toEqual([{ from: '2026-11-22', to: '2026-11-30' }])
      // Noční z předvečera zůstane, ranní z 10. 11. ne.
      expect(schedule.shifts.map((item) => item.date)).toEqual(['2026-11-22', '2026-11-24'])
    })

    it('mentions an unconfirmed odd week only when it falls into the period', () => {
      const timetable = source(
        [['2026-09-21', '2026-12-18']],
        [shift('2026-10-06', '10:00', '11:30', { weeks: 'odd' })],
        {
          circle: SCHOOL_CIRCLE,
        },
      )
      expect(compose([timetable], [], ['2026-11-23', '2026-11-29']).warnings).toEqual([])
    })
  })
})

describe('composePeople', () => {
  it('composes everyone in the action for its period', () => {
    const people = composePeople(sampleAction)
    expect(people.map((person) => person.id)).toEqual(['anna', 'petr', 'jana', 'tomas', 'eva'])
    expect(people[0].schedule?.coverage).toEqual([{ from: '2026-11-23', to: '2026-11-28' }])
  })
})

describe('findParityQuestions', () => {
  function actionWithTimetable(extra: Partial<Source> = {}): Action {
    const timetable = source(
      [['2026-09-21', '2027-01-15']],
      [
        shift('2026-11-24', '10:00', '11:30', { weeks: 'odd' }),
        shift('2026-12-01', '10:00', '11:30', { weeks: 'odd' }),
        shift('2027-01-05', '10:00', '11:30', { weeks: 'odd' }),
      ],
      { id: 'rozvrh', circle: SCHOOL_CIRCLE, ...extra },
    )
    return {
      ...sampleAction,
      from: '2026-11-23',
      to: '2027-01-10',
      people: [{ id: 'vendula', name: 'Vendula', files: [], sources: [timetable], overrides: [] }],
    }
  }

  it('asks once for each term the action touches', () => {
    expect(findParityQuestions(actionWithTimetable())).toEqual([
      {
        personId: 'vendula',
        personName: 'Vendula',
        sourceId: 'rozvrh',
        date: '2026-11-24',
        answer: null,
      },
      {
        personId: 'vendula',
        personName: 'Vendula',
        sourceId: 'rozvrh',
        date: '2027-01-05',
        answer: null,
      },
    ])
  })

  it('shows the answer that was given', () => {
    const answered = actionWithTimetable({
      parity: { calendar: false, anchors: [{ date: '2026-11-24', odd: true }] },
    })
    expect(findParityQuestions(answered)[0].answer).toBe('odd')
  })

  it('does not ask when the document says parity is by the calendar', () => {
    expect(
      findParityQuestions(actionWithTimetable({ parity: { calendar: true, anchors: [] } })),
    ).toEqual([])
  })
})
