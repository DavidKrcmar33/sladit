import { withAnchor } from './parity'
import type { Action, DateString, Person, Shift, Source } from './schema'

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

function updatePerson(action: Action, personId: string, update: (person: Person) => Person) {
  const person = action.people.find((candidate) => candidate.id === personId)
  if (!person) {
    throw new Error(`Person ${personId} is not part of the action`)
  }
  return replacePerson(action, update(person))
}

function updateSource(
  action: Action,
  personId: string,
  sourceId: string,
  update: (source: Source) => Source,
): Action {
  return updatePerson(action, personId, (person) => {
    if (!person.sources.some((source) => source.id === sourceId)) {
      throw new Error(`Source ${sourceId} does not belong to person ${personId}`)
    }
    return {
      ...person,
      sources: person.sources.map((source) => (source.id === sourceId ? update(source) : source)),
    }
  })
}

/** Přidá přečtený zdroj. Soubory, ze kterých vznikl, přestanou čekat na přečtení. */
export function addSource(action: Action, personId: string, source: Source): Action {
  const readIds = new Set(source.files.map((file) => file.id))
  return updatePerson(action, personId, (person) => ({
    ...person,
    files: person.files.filter((file) => !readIds.has(file.id)),
    sources: [...person.sources, source],
  }))
}

/** Odebere zdroj. Ruční úpravy dnů zůstanou. */
export function removeSource(action: Action, personId: string, sourceId: string): Action {
  return updatePerson(action, personId, (person) => ({
    ...person,
    sources: person.sources.filter((source) => source.id !== sourceId),
  }))
}

export function setSourceCircle(
  action: Action,
  personId: string,
  sourceId: string,
  circle: string,
): Action {
  const name = circle.trim()
  if (!name) throw new Error('Circle must not be empty')
  return updateSource(action, personId, sourceId, (source) => ({ ...source, circle: name }))
}

/** Potvrzení, zda je týden s daným dnem lichý, nebo sudý. Nahradí dřívější ze stejného úseku výuky. */
export function setWeekParity(
  action: Action,
  personId: string,
  sourceId: string,
  date: DateString,
  odd: boolean,
): Action {
  return updateSource(action, personId, sourceId, (source) => ({
    ...source,
    parity: withAnchor(source.parity, date, odd),
  }))
}

function compareShifts(a: Shift, b: Shift): number {
  return a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
}

/**
 * Ruční úprava dne. Pokrývá jen ten den (sousední neznámé dny zůstanou neznámé)
 * a platí i po přidání nového podkladu.
 */
export function setDayOverride(
  action: Action,
  personId: string,
  date: DateString,
  shifts: Shift[],
): Action {
  if (shifts.some((shift) => shift.date !== date)) {
    throw new Error(`All shifts must start on ${date}`)
  }
  return updatePerson(action, personId, (person) => ({
    ...person,
    overrides: [
      ...person.overrides.filter((override) => override.date !== date),
      { date, shifts: [...shifts].sort(compareShifts) },
    ].sort((a, b) => a.date.localeCompare(b.date)),
  }))
}

/** Zruší ruční úpravu dne, den se zase řídí podklady. */
export function removeDayOverride(action: Action, personId: string, date: DateString): Action {
  return updatePerson(action, personId, (person) => ({
    ...person,
    overrides: person.overrides.filter((override) => override.date !== date),
  }))
}
