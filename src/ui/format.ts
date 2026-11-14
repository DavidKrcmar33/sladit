import type { DayStatus } from '@/core/calendar'
import type { DateString, Shift, TimeString } from '@/core/schema'

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

export function describeDayStatus(status: DayStatus): string {
  if (status.kind === 'free') return 'volno'
  if (status.kind === 'unknown') return 'rozpis chybí'
  const shifts = status.shifts.map((shift) => `směna ${formatShiftSummary(shift)}`).join(', ')
  return status.shifts.some((shift) => shift.uncertain) ? `${shifts}, nejisté čtení` : shifts
}
