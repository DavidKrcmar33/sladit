import type { Action, DateString, Person, PersonSchedule, Shift } from './schema'

export function addPerson(action: Action, person: Person): Action {
  return { ...action, people: [...action.people, person] }
}

export function replacePerson(action: Action, person: Person): Action {
  return {
    ...action,
    people: action.people.map((existing) => (existing.id === person.id ? person : existing)),
  }
}

export function removePerson(action: Action, personId: string): Action {
  return { ...action, people: action.people.filter((person) => person.id !== personId) }
}

function compareShifts(a: Shift, b: Shift): number {
  return a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
}

/**
 * Nastaví směny jednoho dne. Den tím přestává být neznámý: rozsah rozpisu se rozšíří, aby ho zahrnul.
 * Rozsah je souvislý, takže dny mezi starým rozsahem a nově doplněným dnem se začnou brát jako volné.
 */
export function setShiftsForDay(
  action: Action,
  personId: string,
  date: DateString,
  shifts: Shift[],
): Action {
  if (shifts.some((shift) => shift.date !== date)) {
    throw new Error(`All shifts must start on ${date}`)
  }

  const person = action.people.find((candidate) => candidate.id === personId)
  if (!person) {
    throw new Error(`Person ${personId} is not part of the action`)
  }

  const current: PersonSchedule = person.schedule ?? {
    coveredFrom: date,
    coveredTo: date,
    shifts: [],
    warnings: [],
  }

  const schedule: PersonSchedule = {
    ...current,
    coveredFrom: date < current.coveredFrom ? date : current.coveredFrom,
    coveredTo: date > current.coveredTo ? date : current.coveredTo,
    shifts: [...current.shifts.filter((shift) => shift.date !== date), ...shifts].sort(
      compareShifts,
    ),
  }

  return replacePerson(action, { ...person, schedule })
}
