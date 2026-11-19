import type { DateString, TimeString } from './schema'

/**
 * Soubor .ics s jednou událostí: potvrzený termín akce pro lidi bez připojeného kalendáře.
 * Časy jsou v pražském čase, soubor proto nese i popis pásma Europe/Prague.
 */
export interface IcsEvent {
  uid: string
  title: string
  date: DateString
  start: TimeString
  end: TimeString
  description?: string
  /** Kdy soubor vznikl (DTSTAMP), ISO čas. */
  createdAt: string
}

const PRAGUE_TIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function localStamp(date: DateString, time: TimeString): string {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`
}

function utcStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

/** Řádky delší než 75 bajtů se podle RFC 5545 lámou, pokračování začíná mezerou. */
function fold(line: string): string[] {
  const encoder = new TextEncoder()
  const result: string[] = []
  let current = ''
  for (const char of line) {
    const limit = result.length === 0 ? 75 : 74
    if (encoder.encode(current + char).length > limit) {
      result.push(current)
      current = char
    } else {
      current += char
    }
  }
  result.push(current)
  return result.map((part, index) => (index === 0 ? part : ` ${part}`))
}

export function icsForEvent(event: IcsEvent): string {
  // Událost přes půlnoc končí další den.
  const endDate =
    event.end <= event.start
      ? new Date(Date.parse(`${event.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      : event.date
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sladit//CS',
    'CALSCALE:GREGORIAN',
    ...PRAGUE_TIMEZONE,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(event.createdAt)}`,
    `DTSTART;TZID=Europe/Prague:${localStamp(event.date, event.start)}`,
    `DTEND;TZID=Europe/Prague:${localStamp(endDate, event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.flatMap(fold).join('\r\n') + '\r\n'
}
