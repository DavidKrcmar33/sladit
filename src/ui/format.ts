import type { CalendarDay } from '@/core/calendar'
import { CALENDAR_LABEL } from '@/core/calendarBusy'
import type { DateString, Shift, TimeString } from '@/core/schema'
import type { TimeRange } from '@/core/scheduler'
import type { Stability } from '@/core/sensitivity'
import { addDays, mondayOf } from '@/core/time'

const WEEKDAYS_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']
const WEEKDAYS_LONG = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']

function parseDate(date: DateString) {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return { year, month, day, weekday }
}

export function formatDayHeader(date: DateString): string {
  const { day, weekday } = parseDate(date)
  return `${WEEKDAYS_SHORT[weekday]} ${day}.`
}

/** Krátké datum do věty, například „čt 26. 11.“. */
export function formatDayShort(date: DateString): string {
  const { day, month, weekday } = parseDate(date)
  return `${WEEKDAYS_SHORT[weekday].toLowerCase()} ${day}. ${month}.`
}

export function formatDayLong(date: DateString): string {
  const { day, month, weekday } = parseDate(date)
  return `${WEEKDAYS_LONG[weekday]} ${day}. ${month}.`
}

export function formatDateRange(from: DateString, to: DateString): string {
  const start = parseDate(from)
  const end = parseDate(to)
  const endText = `${end.day}. ${end.month}. ${end.year}`

  if (from === to) return endText
  if (start.year !== end.year) return `${start.day}. ${start.month}. ${start.year} – ${endText}`
  if (start.month !== end.month) return `${start.day}. ${start.month}. – ${endText}`
  return `${start.day}.–${endText}`
}

/** Týden, do kterého den patří, od pondělí do neděle. */
export function formatWeek(date: DateString): string {
  const monday = mondayOf(date)
  return formatDateRange(monday, addDays(monday, 6))
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

function formatClockShort(time: TimeString): string {
  const [hours, minutes] = time.split(':')
  const hour = String(Number(hours))
  return minutes === '00' ? hour : `${hour}:${minutes}`
}

export function formatShiftTime(shift: Pick<Shift, 'start' | 'end'>): string {
  return `${formatClockShort(shift.start)}–${formatClockShort(shift.end)}`
}

export function formatTimeWindow(start: TimeString, end: TimeString): string {
  return `${start}–${end}`
}

export function formatShiftSummary(shift: Pick<Shift, 'label' | 'start' | 'end'>): string {
  return `${shift.label} ${formatShiftTime(shift)}`.trim()
}

/** Časy úseků celými hodinami nebo s minutami, například `20–23`, u více úseků `8–11 +1`. */
export function formatFreeWindows(windows: TimeRange[]): string {
  const [first, ...rest] = windows
  if (!first) return ''
  const text = formatShiftTime(first)
  return rest.length ? `${text} +${rest.length}` : text
}

function formatWindowList(windows: TimeRange[]): string {
  return windows.map((window) => formatTimeWindow(window.start, window.end)).join(', ')
}

const PRIVATE_DAY = { available: 'může', busy: 'nemůže', unknown: 'nevíme' } as const

/** Směna z rozpisu, nebo obsazený čas z Google Kalendáře, třeba „v kalendáři 18–21“. */
function describeShift(shift: Pick<Shift, 'label' | 'start' | 'end' | 'raw'>): string {
  if (shift.label === CALENDAR_LABEL && shift.raw === '') {
    return `v kalendáři ${formatShiftTime(shift)}`
  }
  return `směna ${formatShiftSummary(shift)}`
}

export function describeCalendarDay({
  status,
  attendance,
  windows,
  isPartial,
}: CalendarDay): string {
  // U cizího rozpisu víme jen výsledek, ne důvod.
  if (status.kind === 'private') return PRIVATE_DAY[attendance]
  if (status.kind === 'unknown') {
    return ['rozpis chybí', ...status.shifts.map(describeShift)].join(', ')
  }

  const parts = status.kind === 'free' ? ['volno'] : status.shifts.map(describeShift)
  if (status.kind === 'working' && status.shifts.some((shift) => shift.uncertain)) {
    parts.push('nejisté čtení')
  }
  if (attendance !== 'available') parts.push('nemůže')
  else parts.push(isPartial ? `může jen ${formatWindowList(windows)}` : 'může')
  return parts.join(', ')
}

/** Doplňující věta k dni v editoru, null když není co dodat. */
export function describeAvailability({
  attendance,
  windows,
  isPartial,
}: CalendarDay): string | null {
  if (attendance === 'busy') return 'V denním okně akce se nevejde.'
  if (attendance === 'available' && isPartial) {
    return `Vejde se jen v čase ${formatWindowList(windows)}.`
  }
  return null
}

const PIVOT_REASON = { missing: 'chybí rozpis', uncertain: 'nejisté čtení' } as const

/**
 * Varování k nejlepšímu termínu, na čích datech stojí. Jistý termín žádnou větu nepotřebuje.
 * Například „Může se změnit. Záleží na: Petr (čt 26. 11., chybí rozpis).“
 */
export function describeStability(
  stability: Stability,
  nameOf: (personId: string) => string,
): string | null {
  if (stability.certain) return null
  if (stability.pivots.length === 0) return 'Může se změnit.'
  const people = stability.pivots.map((pivot) => {
    const days = pivot.dates
      .map((item) =>
        item.reason === 'private'
          ? formatDayShort(item.date)
          : `${formatDayShort(item.date)}, ${PIVOT_REASON[item.reason]}`,
      )
      .join('; ')
    return `${nameOf(pivot.personId)} (${days})`
  })
  return `Může se změnit. Záleží na: ${people.join(', ')}.`
}
