/**
 * Vyrobí fiktivní testovací data do eval/data: 20 rozpisů, 5 týdenních rozvrhů a skupiny.
 * Správné směny jsou zdroj pravdy, z nich se vykreslí podklad (xlsx, text, PDF, PNG)
 * i expected.json, takže si vždy odpovídají. Spouští se `npm run eval:data`, běží jen na macOS (cupsfilter, sips).
 *
 * Už vykreslené podklady se nepřepisují: nové vykreslení PDF a snímků změní bajty a s nimi
 * i dotazy na model, takže by se cache měření zahodila. `npm run eval:data -- --force` vykreslí vše znovu.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { findProposals } from '../src/core/scheduler'
import type { ActionParams, PersonSchedule, Shift } from '../src/core/schema'
import { addDays, eachDay } from '../src/core/time'

const FORCE = process.argv.includes('--force')

/** Zapíše podklad, jen když ještě neexistuje (nebo s --force). */
function writeDocument(path: string, render: () => Buffer | string | Promise<Buffer | string>) {
  if (existsSync(path) && !FORCE) return
  return Promise.resolve(render()).then((content) => writeFileSync(path, content))
}

const DATA_DIR = join(import.meta.dirname, 'data')
const WEEKDAYS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']
const WEEKDAY_NAMES = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']

type Times = [string, string] | null
type Format = 'xlsx' | 'text' | 'pdf' | 'screenshot'
type Style = 'grid' | 'colors' | 'vertical' | 'times-list' | 'words' | 'chat'

interface Notation {
  name: string
  times: Record<string, Times>
  /** Značky, ze kterých se losují rozpisy ostatních lidí. */
  pool: string[]
  legend: string
}

const RON: Notation = {
  name: 'R/O/N',
  times: {
    R: ['06:00', '14:00'],
    O: ['14:00', '22:00'],
    N: ['22:00', '06:00'],
    V: null,
    DOV: null,
    NEM: null,
  },
  pool: ['R', 'R', 'O', 'O', 'N', 'V', 'V'],
  legend: 'R = 6-14, O = 14-22, N = 22-6, V = volno, DOV = dovolená, NEM = nemoc',
}
const RON_CUSTOM: Notation = {
  name: 'R/O/N (vlastní časy)',
  times: { R: ['07:00', '15:00'], O: ['15:00', '23:00'], N: ['23:00', '07:00'], V: null },
  pool: ['R', 'R', 'O', 'O', 'N', 'V', 'V'],
  legend: 'R = 7-15, O = 15-23, N = 23-7, V = volno',
}
const DN12: Notation = {
  name: 'D/N 12h',
  times: { D: ['06:00', '18:00'], N: ['18:00', '06:00'], V: null },
  pool: ['D', 'D', 'N', 'N', 'V', 'V', 'V'],
  legend: 'D = denní 6-18, N = noční 18-6, V = volno',
}
const TIMES: Notation = {
  name: 'časy (6-14)',
  times: {
    '6-14': ['06:00', '14:00'],
    '14-22': ['14:00', '22:00'],
    '22-6': ['22:00', '06:00'],
    '-': null,
  },
  pool: ['6-14', '6-14', '14-22', '14-22', '22-6', '-', '-'],
  legend: '',
}

interface Spec {
  format: Format
  style: Style
  notation: Notation
  /** Zda podklad obsahuje legendu. */
  legend: boolean
  person: string
  nameInSchedule: string
  others: string[]
  weeks: 1 | 2
  /** Značky osoby po dnech, oddělené mezerou. */
  codes: string
}

const WEEK_FROM = '2026-11-23'

const SPECS: Spec[] = [
  {
    format: 'xlsx',
    style: 'grid',
    notation: RON,
    legend: true,
    person: 'Petr',
    nameInSchedule: 'Petr N.',
    others: [],
    weeks: 1,
    codes: 'O O R V N N V',
  },
  {
    format: 'xlsx',
    style: 'grid',
    notation: TIMES,
    legend: false,
    person: 'Lucie',
    nameInSchedule: 'Marie Nováková',
    others: [],
    weeks: 1,
    codes: '6-14 6-14 - 14-22 14-22 22-6 -',
  },
  {
    format: 'xlsx',
    style: 'colors',
    notation: RON,
    legend: true,
    person: 'David',
    nameInSchedule: 'David',
    others: [],
    weeks: 1,
    codes: 'V R R O O V N',
  },
  {
    format: 'xlsx',
    style: 'vertical',
    notation: RON,
    legend: true,
    person: 'Tereza',
    nameInSchedule: 'Tereza',
    others: [],
    weeks: 1,
    codes: 'R DOV DOV O N V V',
  },
  {
    format: 'xlsx',
    style: 'grid',
    notation: DN12,
    legend: true,
    person: 'Martin',
    nameInSchedule: 'Novák Martin',
    others: [],
    weeks: 2,
    codes: 'D D V V N N V V D D D V V N',
  },
  {
    format: 'xlsx',
    style: 'grid',
    notation: RON_CUSTOM,
    legend: true,
    person: 'Barbora',
    nameInSchedule: 'Bára',
    others: [],
    weeks: 1,
    codes: 'R R R V V O O',
  },
  {
    format: 'xlsx',
    style: 'grid',
    notation: RON,
    legend: false,
    person: 'Hana',
    nameInSchedule: 'Zaměstnanec č. 17',
    others: [],
    weeks: 1,
    codes: 'N V V R O O V',
  },
  {
    format: 'text',
    style: 'vertical',
    notation: RON,
    legend: true,
    person: 'Karel',
    nameInSchedule: 'Karel',
    others: [],
    weeks: 1,
    codes: 'O O V R R V N',
  },
  {
    format: 'text',
    style: 'times-list',
    notation: TIMES,
    legend: false,
    person: 'Lenka',
    nameInSchedule: 'Lenka',
    others: [],
    weeks: 1,
    codes: '- 14-22 14-22 6-14 - 22-6 -',
  },
  {
    format: 'text',
    style: 'words',
    notation: RON,
    legend: false,
    person: 'Michal',
    nameInSchedule: 'Michal',
    others: [],
    weeks: 1,
    codes: 'R R V V O O O',
  },
  {
    format: 'text',
    style: 'grid',
    notation: RON,
    legend: true,
    person: 'Nela',
    nameInSchedule: 'Nela B.',
    others: [],
    weeks: 1,
    codes: 'V N N V R R O',
  },
  {
    format: 'text',
    style: 'chat',
    notation: RON,
    legend: false,
    person: 'Sára',
    nameInSchedule: 'Sára',
    others: [],
    weeks: 1,
    codes: 'O O V N N V R',
  },
  {
    format: 'pdf',
    style: 'grid',
    notation: RON,
    legend: true,
    person: 'Tomáš',
    nameInSchedule: 'Tomáš H.',
    others: [],
    weeks: 1,
    codes: 'R V O O V N N',
  },
  {
    format: 'pdf',
    style: 'grid',
    notation: TIMES,
    legend: false,
    person: 'Yvona',
    nameInSchedule: 'Yvona',
    others: [],
    weeks: 1,
    codes: '14-22 14-22 14-22 - - 6-14 6-14',
  },
  {
    format: 'pdf',
    style: 'times-list',
    notation: TIMES,
    legend: false,
    person: 'Cyril',
    nameInSchedule: 'Cyril',
    others: [],
    weeks: 1,
    codes: '22-6 22-6 - - 6-14 - 14-22',
  },
  {
    format: 'pdf',
    style: 'grid',
    notation: DN12,
    legend: true,
    person: 'Dita',
    nameInSchedule: 'Dita Malá',
    others: [],
    weeks: 2,
    codes: 'N N V V V D D V N N V V D D',
  },
  {
    format: 'pdf',
    style: 'grid',
    notation: RON_CUSTOM,
    legend: true,
    person: 'Honza',
    nameInSchedule: 'Honza',
    others: [],
    weeks: 1,
    codes: 'V V O O O R R',
  },
  {
    format: 'screenshot',
    style: 'grid',
    notation: RON,
    legend: true,
    person: 'Libor',
    nameInSchedule: 'Libor',
    others: [],
    weeks: 1,
    codes: 'R O V V N R V',
  },
  {
    format: 'screenshot',
    style: 'times-list',
    notation: TIMES,
    legend: false,
    person: 'Pepa',
    nameInSchedule: 'Pepa',
    others: [],
    weeks: 1,
    codes: '14-22 - 6-14 6-14 - 22-6 22-6',
  },
  {
    format: 'screenshot',
    style: 'grid',
    notation: TIMES,
    legend: false,
    person: 'Radim',
    nameInSchedule: 'Radim T.',
    others: [],
    weeks: 1,
    codes: '- 6-14 14-22 22-6 - - 14-22',
  },
]

const COLORS: Record<string, string> = {
  R: 'FFFFE699',
  O: 'FFF4B183',
  N: 'FF8EA9DB',
  DOV: 'FFC6E0B4',
  NEM: 'FFD9D9D9',
}
const COLOR_NAMES: Record<string, string> = {
  R: 'žlutá',
  O: 'oranžová',
  N: 'modrá',
  DOV: 'zelená',
  NEM: 'šedá',
}

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day}.${month}.`
}

function dayNumber(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day}.${month}.`
}

function weekdayName(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

function pad(text: string, width: number): string {
  return text.padEnd(width)
}

function shiftTimeText(code: string, notation: Notation): string {
  const times = notation.times[code]
  return times ? `${times[0]}-${times[1]}` : 'volno'
}

interface Rendered {
  id: string
  spec: Spec
  dates: string[]
  tokens: string[]
  roster: { name: string; tokens: string[] }[]
}

function prepare(spec: Spec, index: number): Rendered {
  const id = `s${String(index + 1).padStart(2, '0')}-${spec.format}-${spec.style}`
  const from = WEEK_FROM
  const to = addDays(from, spec.weeks * 7 - 1)
  const dates = eachDay(from, to)
  const tokens = spec.codes.split(' ')
  if (tokens.length !== dates.length)
    throw new Error(`${id}: ${tokens.length} značek na ${dates.length} dnů`)
  for (const token of tokens) {
    if (!(token in spec.notation.times)) throw new Error(`${id}: neznámá značka ${token}`)
  }

  const random = seededRandom(index + 7)
  const others = spec.others.map((name) => ({
    name,
    tokens: dates.map(() => spec.notation.pool[Math.floor(random() * spec.notation.pool.length)]),
  }))
  const position = index % (others.length + 1)
  const roster = [...others]
  roster.splice(position, 0, { name: spec.nameInSchedule, tokens })
  return { id, spec, dates, tokens, roster }
}

function expectedSchedule(rendered: Rendered): PersonSchedule {
  const { spec, dates, tokens } = rendered
  const shifts: Shift[] = []
  dates.forEach((date, i) => {
    const times = spec.notation.times[tokens[i]]
    if (times) {
      shifts.push({
        date,
        start: times[0],
        end: times[1],
        label: tokens[i],
        raw: tokens[i],
        uncertain: false,
      })
    }
  })
  return { coverage: [{ from: dates[0], to: dates[dates.length - 1] }], shifts, warnings: [] }
}

const TITLE = 'Rozpis směn – provozovna Sklad Jih'

function renderGridText(rendered: Rendered): string {
  const { spec, dates, roster } = rendered
  const headers = dates.map(dayLabel)
  const cell =
    Math.max(
      ...headers.map((header) => header.length),
      ...roster.flatMap((row) => row.tokens.map((token) => token.length)),
    ) + 2
  const nameWidth = Math.max(...roster.map((row) => row.name.length), 'Jméno'.length) + 2
  const lines = [
    TITLE,
    '',
    pad('Jméno', nameWidth) +
      headers
        .map((header) => pad(header, cell))
        .join('')
        .trimEnd(),
  ]
  for (const row of roster) {
    lines.push(
      (pad(row.name, nameWidth) + row.tokens.map((token) => pad(token, cell)).join('')).trimEnd(),
    )
  }
  if (spec.legend) lines.push('', `Legenda: ${spec.notation.legend}`)
  return lines.join('\n')
}

function renderTimesList(rendered: Rendered): string {
  const { spec, dates, tokens } = rendered
  const lines = [`Moje směny, ${spec.nameInSchedule}`, '']
  dates.forEach((date, i) => {
    const code = tokens[i]
    const times = spec.notation.times[code]
    const text = times ? `${times[0].replace(/^0/, '')}-${times[1].replace(/^0/, '')}` : 'volno'
    lines.push(`${weekdayName(date)} ${dayNumber(date)}  ${text}`)
  })
  return lines.join('\n')
}

function renderVertical(rendered: Rendered): string {
  const { spec, dates, tokens } = rendered
  const lines = [
    `Směny ${spec.nameInSchedule}`,
    spec.legend ? `Legenda: ${spec.notation.legend}` : '',
    '',
  ]
  dates.forEach((date, i) => lines.push(`${dayNumber(date)} ${tokens[i]}`))
  return lines.filter((line, i) => line !== '' || i !== 1).join('\n')
}

const WORDS: Record<string, string> = {
  R: 'ranní',
  O: 'odpolední',
  N: 'noční',
  V: 'volno',
  DOV: 'dovolená',
  NEM: 'nemoc',
}

function renderWords(rendered: Rendered): string {
  const { spec, dates, tokens } = rendered
  const lines = [`Rozpis na týden – ${spec.nameInSchedule}`, '']
  dates.forEach((date, i) => lines.push(`${weekdayName(date)}: ${WORDS[tokens[i]]}`))
  return lines.join('\n')
}

function renderChat(rendered: Rendered): string {
  const { dates, tokens } = rendered
  const parts = dates.map((date, i) => {
    const code = tokens[i]
    const phrase =
      code === 'V'
        ? 'volno'
        : code === 'R'
          ? 'ranní'
          : code === 'O'
            ? 'odpolední'
            : 'noční (od 22 do 6)'
    return `${weekdayName(date)} ${phrase}`
  })
  return `Čau, tenhle týden (${dayNumber(dates[0])}–${dayNumber(dates[dates.length - 1])}2026) mám směny takhle: ${parts.join(', ')}. Dej vědět, kdy se sejdeme!`
}

function renderText(rendered: Rendered): string {
  switch (rendered.spec.style) {
    case 'grid':
      return renderGridText(rendered)
    case 'times-list':
      return renderTimesList(rendered)
    case 'vertical':
      return renderVertical(rendered)
    case 'words':
      return renderWords(rendered)
    case 'chat':
      return renderChat(rendered)
    default:
      throw new Error(`Styl ${rendered.spec.style} nejde vykreslit jako text`)
  }
}

async function renderXlsx(rendered: Rendered): Promise<Buffer> {
  const { spec, dates, roster, tokens } = rendered
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Rozpis')

  if (spec.style === 'vertical') {
    sheet.addRow([`Směny ${spec.nameInSchedule}`])
    sheet.addRow(['Datum', 'Směna'])
    dates.forEach((date, i) => sheet.addRow([dayNumber(date), tokens[i]]))
  } else {
    sheet.addRow([TITLE])
    sheet.addRow([])
    sheet.addRow(['Jméno', ...dates.map(dayLabel)])
    for (const row of roster) {
      const added = sheet.addRow([
        row.name,
        ...row.tokens.map((t) => (spec.style === 'colors' ? '' : t)),
      ])
      if (spec.style === 'colors') {
        row.tokens.forEach((token, i) => {
          const argb = COLORS[token]
          if (argb)
            added.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
        })
      }
    }
  }

  if (spec.legend) {
    sheet.addRow([])
    if (spec.style === 'colors') {
      sheet.addRow(['Legenda'])
      for (const code of Object.keys(COLORS)) {
        const row = sheet.addRow([
          '',
          `${COLOR_NAMES[code]} = ${WORDS[code]}${spec.notation.times[code] ? ` ${shiftTimeText(code, spec.notation)}` : ''}`,
        ])
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS[code] } }
      }
      sheet.addRow(['', 'bílá = volno'])
    } else {
      sheet.addRow([`Legenda: ${spec.notation.legend}`])
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function renderPdf(text: string, scratch: string, name: string, large: boolean): Buffer {
  const input = join(scratch, `${name}.txt`)
  writeFileSync(input, text)
  const options = large ? ['-o', 'cpi=7', '-o', 'lpi=4'] : ['-o', 'cpi=10', '-o', 'lpi=6']
  return execFileSync('cupsfilter', ['-m', 'application/pdf', ...options, input], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function pdfToPng(pdf: Buffer, scratch: string, name: string): Buffer {
  const input = join(scratch, `${name}.pdf`)
  const output = join(scratch, `${name}.png`)
  writeFileSync(input, pdf)
  execFileSync('sips', ['-s', 'format', 'png', input, '--out', output], { stdio: 'ignore' })
  return readFileSync(output)
}

interface ScenarioPerson {
  id: string
  name: string
  scheduleId: string
}

function personEntry(name: string, scheduleId: string): ScenarioPerson {
  return {
    id: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
    name,
    scheduleId,
  }
}

/** Očekávaný termín skupiny: nejlepší návrh nad správnými směnami. */
function expectedDateOf(
  action: ActionParams,
  people: ScenarioPerson[],
  scheduleById: Map<string, PersonSchedule>,
) {
  const participants = people.map((person) => ({
    id: person.id,
    schedule: scheduleById.get(person.scheduleId)!,
  }))
  return findProposals(action, participants)[0] ?? null
}

const SCENARIO_WINDOWS = [
  { durationMinutes: 180, windowStart: '16:00', windowEnd: '23:00' },
  { durationMinutes: 120, windowStart: '17:00', windowEnd: '22:00' },
  { durationMinutes: 240, windowStart: '12:00', windowEnd: '23:00' },
]

/**
 * Skupiny g11–g20, ve kterých termín pro všechny neexistuje. Potřebují je funkce, které radí,
 * co dělat, když se všichni nevejdou (náhradní termín, co by pomohlo). Lidé se losují
 * pevným semínkem, takže skupiny vyjdou pokaždé stejně.
 */
function buildCrowdedScenarios(rendered: Rendered[], scheduleById: Map<string, PersonSchedule>) {
  const random = seededRandom(1123)
  const scenarios: {
    id: string
    action: ActionParams & { name: string }
    people: ScenarioPerson[]
    expectedDate: string
  }[] = []
  for (let attempt = 0; scenarios.length < 10 && attempt < 1000; attempt++) {
    const size = 5 + Math.floor(random() * 4)
    const members = [...rendered]
      .filter((item) => item.spec.weeks === 1)
      .sort(() => random() - 0.5)
      .slice(0, size)
    const people = members.map((member) => personEntry(member.spec.person, member.id))
    const action = {
      name: `Plná skupina ${scenarios.length + 1}`,
      from: WEEK_FROM,
      to: addDays(WEEK_FROM, 6),
      ...SCENARIO_WINDOWS[scenarios.length % SCENARIO_WINDOWS.length],
    }
    const best = expectedDateOf(action, people, scheduleById)
    if (!best || best.missing.length === 0) continue
    const id = `g${String(11 + scenarios.length).padStart(2, '0')}`
    scenarios.push({ id, action, people, expectedDate: best.date })
  }
  if (scenarios.length < 10) throw new Error('Nepodařilo se sestavit 10 plných skupin')
  return scenarios
}

/**
 * Skupiny g21–g23 se studenty, kteří mají liché a sudé bloky v různých časech. Období má dva týdny,
 * aby byl vidět lichý i sudý týden. Měření v nich hlídá, že nikdo nevyjde jako „může“, když má výuku.
 */
function buildTimetableScenarios(scheduleById: Map<string, PersonSchedule>) {
  const groups: { students: [string, string][]; window: (typeof SCENARIO_WINDOWS)[number] }[] = [
    {
      students: [
        ['Hedvika', 's23-text-timetable'],
        ['Martin', 's05-xlsx-grid'],
        ['Dita', 's16-pdf-grid'],
        ['Zbyněk', 's22-pdf-timetable'],
      ],
      window: { durationMinutes: 120, windowStart: '15:00', windowEnd: '21:00' },
    },
    {
      students: [
        ['Ignác', 's24-text-timetable'],
        ['Martin', 's05-xlsx-grid'],
        ['Zbyněk', 's22-pdf-timetable'],
      ],
      window: { durationMinutes: 120, windowStart: '15:00', windowEnd: '21:00' },
    },
    {
      students: [
        ['Johana', 's25-text-timetable'],
        ['Dita', 's16-pdf-grid'],
        ['Zbyněk', 's22-pdf-timetable'],
        ['Martin', 's05-xlsx-grid'],
      ],
      window: { durationMinutes: 90, windowStart: '16:00', windowEnd: '21:00' },
    },
  ]
  return groups.map((group, index) => {
    const people = group.students.map(([name, scheduleId]) => personEntry(name, scheduleId))
    const action = {
      name: `Rozvrhy ${index + 1}`,
      from: WEEK_FROM,
      to: addDays(WEEK_FROM, 13),
      ...group.window,
    }
    const best = expectedDateOf(action, people, scheduleById)
    if (!best) throw new Error(`Skupina s rozvrhy ${index + 1} nemá žádný návrh`)
    return { id: `g${21 + index}`, action, people, expectedDate: best.date }
  })
}

function buildScenarios(rendered: Rendered[]) {
  const windows = SCENARIO_WINDOWS
  return Array.from({ length: 10 }, (_, k) => {
    const size = 4 + (k % 3)
    const members = Array.from({ length: size }, (_, j) => rendered[(k * 2 + j) % rendered.length])
    const people = members.map((member) => ({
      id: member.spec.person.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      name: member.spec.person,
      scheduleId: member.id,
    }))
    const action = {
      name: `Skupina ${k + 1}`,
      from: WEEK_FROM,
      to: addDays(WEEK_FROM, 6),
      ...windows[k % windows.length],
    }
    const participants = people.map((person, index) => ({
      id: person.id,
      schedule: expectedSchedule(members[index]),
    }))
    // Očekávaný termín je nejlepší návrh nad správnými směnami. Měření končí na přečtení rozpisů, ne na tom, zda vyjde stejně.
    const [best] = findProposals(action, participants)
    if (!best) throw new Error(`Skupina ${k + 1} nemá žádný návrh`)
    return { id: `g${String(k + 1).padStart(2, '0')}`, action, people, expectedDate: best.date }
  })
}

/** Typy dokumentu, které měření uzná jako správně rozpoznané. U seznamu jen s názvy dnů je správně obojí. */
const KINDS_BY_STYLE: Record<Style, string[]> = {
  grid: ['table'],
  colors: ['table'],
  vertical: ['list', 'table'],
  'times-list': ['list'],
  words: ['list', 'timetable'],
  chat: ['message'],
}

/**
 * Týdenní rozvrhy bez konkrétních dat. Očekávané směny jsou vypsané ručně,
 * aby měření nezáviselo na kódu, který vzor rozepisuje na dny.
 */
interface TimetableCase {
  id: string
  format: 'text' | 'pdf'
  person: string
  from: string
  to: string
  text: string
  expected: [date: string, start: string, end: string][]
  /** Odpověď, kterou by dal člověk na otázku „je tento týden lichý, nebo sudý?“. Měření ji použije. */
  weekParity: { date: string; odd: boolean }
}

/** Platnost zimního semestru u nových rozvrhů. Bloky mimo hledané období model taky vrátí. */
const TERM = 'Platnost: 21. 9. 2026 – 18. 12. 2026'

const TIMETABLES: TimetableCase[] = [
  {
    id: 's21-text-timetable',
    format: 'text',
    person: 'Vendula',
    from: '2026-11-23',
    to: '2026-11-29',
    text: [
      'Rozvrh – zimní semestr',
      'Platnost: 14. 9. 2026 – 18. 12. 2026',
      '',
      'Pondělí',
      '  8:00–9:30    Matematika 2 (A12)',
      '  14:00–15:30  Angličtina (B03) *',
      'Úterý',
      '  10:00–11:30  Programování (lab L2) – jen sudý týden',
      '  10:00–11:30  Databáze (lab L4) – jen lichý týden',
      'Středa',
      '  (bez výuky)',
      'Čtvrtek',
      '  12:00–13:30  Statistika (A12) **',
      'Pátek',
      '  8:00–11:15   Praxe ve firmě',
      '',
      '*  odpadá 23. 11. 2026',
      '** odpadá 17. 12. 2026',
    ].join('\n'),
    expected: [
      ['2026-11-23', '08:00', '09:30'],
      ['2026-11-24', '10:00', '11:30'],
      ['2026-11-26', '12:00', '13:30'],
      ['2026-11-27', '08:00', '11:15'],
    ],
    weekParity: { date: '2026-11-23', odd: false },
  },
  {
    id: 's22-pdf-timetable',
    format: 'pdf',
    person: 'Zbyněk',
    from: '2026-11-23',
    to: '2026-12-06',
    text: [
      'Stálý týdenní rozpis směn',
      'Platí od 1. 10. 2026 do 31. 12. 2026',
      '',
      'Po   6:00–14:00',
      'Út   6:00–14:00',
      'St   volno',
      'Čt   14:00–22:00  (jen v lichém týdnu)',
      'Pá   14:00–22:00  (jen v lichém týdnu)',
      'So   22:00–6:00   (jen v sudém týdnu)',
      'Ne   volno',
    ].join('\n'),
    expected: [
      ['2026-11-23', '06:00', '14:00'],
      ['2026-11-24', '06:00', '14:00'],
      ['2026-11-28', '22:00', '06:00'],
      ['2026-11-30', '06:00', '14:00'],
      ['2026-12-01', '06:00', '14:00'],
      ['2026-12-03', '14:00', '22:00'],
      ['2026-12-04', '14:00', '22:00'],
    ],
    weekParity: { date: '2026-11-23', odd: false },
  },
  {
    // Podklad říká „dle kalendáře“: 48. týden (23.–29. 11.) je sudý, 49. lichý.
    id: 's23-text-timetable',
    format: 'text',
    person: 'Hedvika',
    from: '2026-11-23',
    to: '2026-12-06',
    text: [
      'Rozvrh – zimní semestr',
      TERM,
      'Liché a sudé týdny se počítají podle kalendáře.',
      '',
      'Pondělí',
      '  9:00–10:30   Ekonomie (E1)',
      'Středa',
      '  17:00–18:30  Seminář z účetnictví – lichý týden',
      'Čtvrtek',
      '  18:00–19:30  Laboratoř fyziky – sudý týden',
    ].join('\n'),
    expected: [
      ['2026-11-23', '09:00', '10:30'],
      ['2026-11-26', '18:00', '19:30'],
      ['2026-11-30', '09:00', '10:30'],
      ['2026-12-02', '17:00', '18:30'],
    ],
    weekParity: { date: '2026-11-23', odd: false },
  },
  {
    // Fakulta počítá týdny výuky: 23.–29. 11. je lichý, i když je to 48. týden roku.
    id: 's24-text-timetable',
    format: 'text',
    person: 'Ignác',
    from: '2026-11-23',
    to: '2026-12-06',
    text: [
      'Rozvrh – zimní semestr',
      TERM,
      '',
      'Úterý',
      '  16:00–17:30  Cvičení z programování (jen lichý týden)',
      '  18:00–19:30  Konzultace (jen sudý týden)',
      'Pátek',
      '  15:00–16:30  Tělocvik (jen sudý týden)',
    ].join('\n'),
    expected: [
      ['2026-11-24', '16:00', '17:30'],
      ['2026-12-01', '18:00', '19:30'],
      ['2026-12-04', '15:00', '16:30'],
    ],
    weekParity: { date: '2026-11-23', odd: true },
  },
  {
    // Bez údaje o počítání, odpověď člověka sedí s kalendářem: 23.–29. 11. je sudý.
    id: 's25-text-timetable',
    format: 'text',
    person: 'Johana',
    from: '2026-11-23',
    to: '2026-12-06',
    text: [
      'Můj rozvrh',
      TERM,
      '',
      'Po  18:00–19:30  Angličtina (lichý týden)',
      'St  17:00–18:30  Sborový zpěv (sudý týden)',
      'Čt  10:00–11:30  Statistika',
    ].join('\n'),
    expected: [
      ['2026-11-25', '17:00', '18:30'],
      ['2026-11-26', '10:00', '11:30'],
      ['2026-11-30', '18:00', '19:30'],
      ['2026-12-03', '10:00', '11:30'],
    ],
    weekParity: { date: '2026-11-23', odd: false },
  },
]

function timetableSchedule(item: TimetableCase): PersonSchedule {
  return {
    coverage: [{ from: item.from, to: item.to }],
    shifts: item.expected.map(([date, start, end]) => ({
      date,
      start,
      end,
      label: '',
      raw: '',
      uncertain: false,
    })),
    warnings: [],
  }
}

async function writeTimetable(item: TimetableCase, scratch: string) {
  const dir = join(DATA_DIR, 'schedules', item.id)
  mkdirSync(dir, { recursive: true })
  if (item.format === 'text') await writeDocument(join(dir, 'input.txt'), () => item.text)
  else
    await writeDocument(join(dir, 'input.pdf'), () => renderPdf(item.text, scratch, item.id, false))

  const meta = {
    personName: item.person,
    nameInSchedule: '',
    from: item.from,
    to: item.to,
    format: item.format,
    notation: 'týdenní vzor',
    style: 'timetable',
    legend: false,
    kinds: ['timetable'],
    weekParity: item.weekParity,
  }
  const expected = timetableSchedule(item)
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(join(dir, 'expected.json'), JSON.stringify(expected, null, 2) + '\n')
}

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), 'sladit-data-'))
  try {
    const rendered = SPECS.map(prepare)
    const names = new Set(SPECS.map((spec) => spec.person))
    if (names.size !== SPECS.length) throw new Error('Jména osob v rozpisech musí být unikátní')

    for (const item of rendered) {
      const { spec, id, dates } = item
      const dir = join(DATA_DIR, 'schedules', id)
      mkdirSync(dir, { recursive: true })

      if (spec.format === 'xlsx') {
        await writeDocument(join(dir, 'input.xlsx'), () => renderXlsx(item))
      } else if (spec.format === 'text') {
        await writeDocument(join(dir, 'input.txt'), () => renderText(item))
      } else {
        const screenshot = spec.format === 'screenshot'
        await writeDocument(join(dir, screenshot ? 'input.png' : 'input.pdf'), () => {
          const pdf = renderPdf(renderText(item), scratch, id, screenshot)
          return screenshot ? pdfToPng(pdf, scratch, id) : pdf
        })
      }

      writeFileSync(
        join(dir, 'meta.json'),
        JSON.stringify(
          {
            personName: spec.person,
            nameInSchedule: spec.nameInSchedule,
            from: dates[0],
            to: dates[dates.length - 1],
            format: spec.format,
            notation: spec.notation.name,
            style: spec.style,
            legend: spec.legend,
            kinds: KINDS_BY_STYLE[spec.style],
          },
          null,
          2,
        ) + '\n',
      )
      writeFileSync(
        join(dir, 'expected.json'),
        JSON.stringify(expectedSchedule(item), null, 2) + '\n',
      )
    }

    for (const timetable of TIMETABLES) await writeTimetable(timetable, scratch)

    const scheduleById = new Map<string, PersonSchedule>([
      ...rendered.map((item) => [item.id, expectedSchedule(item)] as const),
      ...TIMETABLES.map((item) => [item.id, timetableSchedule(item)] as const),
    ])
    const scenarios = [
      ...buildScenarios(rendered),
      ...buildCrowdedScenarios(rendered, scheduleById),
      ...buildTimetableScenarios(scheduleById),
    ]
    mkdirSync(join(DATA_DIR, 'scenarios'), { recursive: true })
    for (const scenario of scenarios) {
      writeFileSync(
        join(DATA_DIR, 'scenarios', `${scenario.id}.json`),
        JSON.stringify(scenario, null, 2) + '\n',
      )
    }
    console.log(
      `Vygenerováno: ${rendered.length} rozpisů, ${TIMETABLES.length} týdenních rozvrhů, ${scenarios.length} skupin.`,
    )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

await main()
