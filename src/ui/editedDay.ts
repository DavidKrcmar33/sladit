import type { OwnedPerson } from '@/contract/api'
import { dayStatus, type CalendarView, type PersonDay } from '@/core/calendar'
import type { ComposedPerson } from '@/core/compose'
import { describeAvailability } from '@/ui/format'

/**
 * Data pro editor dne (DayEditor) u mého řádku: směny ten den, zda je den známý, zda je
 * upravený ručně a z jakých podkladů vznikl. Cizí dny se neotevírají, vrací se null.
 */
export function editedDayOf(
  day: PersonDay | null,
  me: OwnedPerson | null,
  composed: ComposedPerson[],
  calendar: CalendarView | null,
  fileBlob: (fileId: string) => File | undefined,
) {
  const person = composed.find((candidate) => candidate.id === day?.personId)
  if (!day || !me || !person || person.id !== me.id) return null
  const status = dayStatus(person.schedule, day.date)
  const row = calendar?.rows.find((candidate) => candidate.personId === person.id)
  const calendarDay = row && calendar ? row.days[calendar.dates.indexOf(day.date)] : undefined
  return {
    key: `${person.id}-${day.date}`,
    personName: person.name,
    date: day.date,
    shifts: 'shifts' in status ? status.shifts : [],
    isKnown: status.kind !== 'unknown',
    hasOverride: me.overrides.some((override) => override.date === day.date),
    warnings: person.schedule?.warnings ?? [],
    availabilityNote: calendarDay ? describeAvailability(calendarDay) : null,
    sources: me.sources
      .flatMap((source) => source.files)
      .map((file) => ({ file, blob: fileBlob(file.id) })),
  }
}
