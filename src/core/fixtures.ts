import { WORK_CIRCLE, type Action, type Shift } from './schema'

/**
 * Ukázková akce pro vývoj a testy, dokud nefunguje čtení rozpisů.
 * Odpovídá datům na návrhu obrazovek: týden 23.–29. 11. 2026, pět lidí,
 * v pátek 27. 11. večer mohou všichni.
 */

function shift(date: string, start: string, end: string, label: string, uncertain = false): Shift {
  return { date, start, end, label, raw: label, uncertain }
}

export const sampleAction: Action = {
  id: 'vanocni-deskovky',
  name: 'Vánoční deskovky',
  from: '2026-11-23',
  to: '2026-11-29',
  durationMinutes: 180,
  windowStart: '16:00',
  windowEnd: '23:00',
  people: [
    {
      id: 'anna',
      name: 'Anna',
      files: [],
      overrides: [],
      sources: [
        {
          id: 'zdroj-1',
          circle: WORK_CIRCLE,
          files: [{ id: 'f1', name: 'rozpis_listopad.xlsx', kind: 'xlsx' }],
          coverage: [{ from: '2026-11-23', to: '2026-11-28' }],
          shifts: [
            shift('2026-11-23', '14:00', '22:00', 'O'),
            shift('2026-11-24', '14:00', '22:00', 'O'),
            shift('2026-11-25', '06:00', '14:00', 'R'),
            shift('2026-11-28', '14:00', '22:00', 'O'),
          ],
          warnings: [],
          parity: { calendar: false, anchors: [] },
        },
      ],
    },
    {
      id: 'petr',
      name: 'Petr',
      files: [],
      overrides: [],
      sources: [
        {
          id: 'zdroj-2',
          circle: WORK_CIRCLE,
          files: [
            { id: 'f2', name: 'IMG_2041.jpg', kind: 'image' },
            { id: 'f3', name: 'Screenshot_směny.png', kind: 'image' },
          ],
          coverage: [{ from: '2026-11-23', to: '2026-11-28' }],
          shifts: [
            shift('2026-11-24', '22:00', '06:00', 'N'),
            shift('2026-11-25', '22:00', '06:00', 'N', true),
          ],
          warnings: ['Směna 25. 11. je v podkladu špatně čitelná.'],
          parity: { calendar: false, anchors: [] },
        },
      ],
    },
    {
      id: 'jana',
      name: 'Jana',
      files: [],
      overrides: [],
      sources: [
        {
          id: 'zdroj-3',
          circle: WORK_CIRCLE,
          files: [
            { id: 'f4', name: 'Směny 48. týden.pdf', kind: 'pdf' },
            { id: 'f5', name: 'IMG_2044.jpg', kind: 'image' },
          ],
          coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
          shifts: [
            shift('2026-11-23', '13:00', '21:00', 'O'),
            shift('2026-11-25', '06:00', '14:00', 'R'),
            shift('2026-11-26', '13:00', '21:00', 'O'),
          ],
          warnings: [],
          parity: { calendar: false, anchors: [] },
        },
      ],
    },
    {
      id: 'tomas',
      name: 'Tomáš',
      files: [],
      overrides: [],
      sources: [
        {
          id: 'zdroj-4',
          circle: WORK_CIRCLE,
          files: [{ id: 'f6', name: 'rozpis_sklad.pdf', kind: 'pdf' }],
          coverage: [{ from: '2026-11-23', to: '2026-11-28' }],
          shifts: [
            shift('2026-11-24', '06:00', '14:00', 'R'),
            shift('2026-11-25', '14:00', '22:00', 'O'),
            shift('2026-11-26', '14:00', '22:00', 'O'),
            shift('2026-11-28', '22:00', '06:00', 'N'),
          ],
          warnings: [],
          parity: { calendar: false, anchors: [] },
        },
      ],
    },
    {
      id: 'eva',
      name: 'Eva',
      files: [],
      overrides: [],
      sources: [
        {
          id: 'zdroj-5',
          circle: WORK_CIRCLE,
          files: [{ id: 'f7', name: 'vložený text', kind: 'text' }],
          coverage: [{ from: '2026-11-23', to: '2026-11-29' }],
          shifts: [
            shift('2026-11-23', '12:00', '20:00', 'O'),
            shift('2026-11-24', '12:00', '20:00', 'O'),
            shift('2026-11-27', '06:00', '14:00', 'R'),
          ],
          warnings: [],
          parity: { calendar: false, anchors: [] },
        },
      ],
    },
  ],
}
