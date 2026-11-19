import type { ActionResource, OwnedPerson, ReadingRequest, User } from '@/contract/api'
import { withAnchor } from '@/core/parity'
import {
  ActionDetailsSchema,
  type Action,
  type ActionDetails,
  type Shift,
  type SourceContent,
} from '@/core/schema'
import { BackendError, type Backend } from './backend'

/**
 * Server v paměti prohlížeče. Chová se jako skutečný (server/app.ts) v tom, co aplikace používá:
 * uživatel má člověka sám za sebe, akce ho obsahuje, hosté bez akce zmizí.
 * Slouží testům a ukázce bez přihlášení, kde se nic neukládá.
 */
export interface MemoryBackendOptions {
  user: User | null
  /** Čtení podkladů. Bez něj (ukázka) čtení vrátí chybu s vysvětlením. */
  read?: (request: ReadingRequest) => Promise<SourceContent>
  generateId?: () => string
}

/** Kopie dat, jako by prošla sítí. Na rozdíl od structuredClone zvládne i reaktivní objekty Vue. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function memoryBackend(options: MemoryBackendOptions): Backend & {
  /** Přihlásí uživatele, jako by prošel Googlem (testy). */
  signIn(user: User): void
} {
  let user = options.user
  let counter = 0
  const generateId = options.generateId ?? (() => `m${++counter}`)
  let people: OwnedPerson[] = []
  let actions: ActionResource[] = []

  function ensureSelf() {
    if (user && !people.some((person) => person.isSelf)) {
      people.unshift({
        id: generateId(),
        name: user.name,
        isSelf: true,
        sources: [],
        overrides: [],
      })
    }
  }
  ensureSelf()

  function signedIn(): User {
    if (!user) throw new BackendError('Nejsi přihlášený.', 401)
    return user
  }

  function personOf(personId: string): OwnedPerson {
    signedIn()
    const person = people.find((candidate) => candidate.id === personId)
    if (!person) throw new BackendError('Člověk nenalezen.', 404)
    return person
  }

  function actionOf(actionId: string): ActionResource {
    signedIn()
    const action = actions.find((candidate) => candidate.id === actionId)
    if (!action) throw new BackendError('Akce nenalezena.', 404)
    return action
  }

  function update(personId: string, change: (person: OwnedPerson) => OwnedPerson): OwnedPerson {
    const next = change(personOf(personId))
    people = people.map((person) => (person.id === personId ? next : person))
    return copy(next)
  }

  function checked(details: ActionDetails): ActionDetails {
    const parsed = ActionDetailsSchema.safeParse(details)
    if (!parsed.success) throw new BackendError(parsed.error.issues[0].message, 400)
    return parsed.data
  }

  function dropOrphanGuests() {
    const used = new Set(actions.flatMap((action) => action.participantIds))
    people = people.filter((person) => person.isSelf || used.has(person.id))
  }

  const selfId = () => people.find((person) => person.isSelf)?.id

  /** Osobní akce: v paměti je jen jeden uživatel, takže je vždy organizátor a nikdo cizí v ní není. */
  function resource(details: ActionDetails, participantIds: string[]): ActionResource {
    return {
      id: generateId(),
      details: checked(details),
      participantIds,
      others: [],
      groupId: null,
      isOrganizer: true,
      organizerName: user?.name ?? '',
    }
  }

  function noGroups(): never {
    signedIn()
    throw new BackendError('Skupiny jdou jen s účtem. Přihlas se.', 400)
  }

  return {
    loginUrl: '/api/auth/google',
    signIn(next) {
      user = next
      ensureSelf()
    },
    async me() {
      return { user, fakeGoogle: false }
    },
    async logout() {
      user = null
    },
    async deleteAccount() {
      signedIn()
      user = null
      people = []
      actions = []
    },

    async people() {
      signedIn()
      return copy(people)
    },
    async renamePerson(personId, name) {
      return update(personId, (person) => ({ ...person, name }))
    },
    async read(personId, request) {
      personOf(personId)
      if (!options.read) {
        throw new BackendError('V ukázce se podklady nečtou. Přihlas se a vyzkoušej vlastní.', 400)
      }
      const content = await options.read(request)
      return update(personId, (person) => ({
        ...person,
        sources: [
          ...person.sources,
          { ...copy(content), id: generateId(), files: copy(request.files) },
        ],
      }))
    },
    async updateSource(personId, sourceId, patch) {
      return update(personId, (person) => {
        if (!person.sources.some((source) => source.id === sourceId)) {
          throw new BackendError('Podklad nenalezen.', 404)
        }
        return {
          ...person,
          sources: person.sources.map((source) =>
            source.id !== sourceId
              ? source
              : {
                  ...source,
                  circle: patch.circle ?? source.circle,
                  parity: patch.weekParity
                    ? withAnchor(source.parity, patch.weekParity.date, patch.weekParity.odd)
                    : source.parity,
                },
          ),
        }
      })
    },
    async deleteSource(personId, sourceId) {
      return update(personId, (person) => ({
        ...person,
        sources: person.sources.filter((source) => source.id !== sourceId),
      }))
    },
    async setOverride(personId, date, shifts: Shift[]) {
      if (shifts.some((shift) => shift.date !== date)) {
        throw new BackendError('Všechny směny musí začínat v upravovaný den.', 400)
      }
      return update(personId, (person) => ({
        ...person,
        overrides: [
          ...person.overrides.filter((item) => item.date !== date),
          { date, shifts: copy(shifts) },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      }))
    },
    async deleteOverride(personId, date) {
      return update(personId, (person) => ({
        ...person,
        overrides: person.overrides.filter((item) => item.date !== date),
      }))
    },

    async actions() {
      signedIn()
      return copy(actions)
    },
    async createAction(details, groupId = null) {
      signedIn()
      if (groupId) noGroups()
      const self = selfId()
      const action = resource(details, self ? [self] : [])
      actions.push(action)
      return copy(action)
    },
    async updateAction(actionId, details) {
      const action = actionOf(actionId)
      action.details = checked(details)
      return copy(action)
    },
    async deleteAction(actionId) {
      actionOf(actionId)
      actions = actions.filter((action) => action.id !== actionId)
      dropOrphanGuests()
    },
    async addGuest(actionId, name) {
      const action = actionOf(actionId)
      const person = { id: generateId(), name, isSelf: false, sources: [], overrides: [] }
      people.push(person)
      action.participantIds.push(person.id)
      return { person: copy(person), action: copy(action) }
    },
    async removeParticipant(actionId, personId) {
      const action = actionOf(actionId)
      if (!action.participantIds.includes(personId)) {
        throw new BackendError('Člověk v akci není.', 404)
      }
      action.participantIds = action.participantIds.filter((id) => id !== personId)
      dropOrphanGuests()
      return copy(action)
    },
    actionView: async () => noGroups(),

    async groups() {
      signedIn()
      return []
    },
    createGroup: async () => noGroups(),
    deleteGroup: async () => noGroups(),
    leaveGroup: async () => noGroups(),
    removeMember: async () => noGroups(),
    createInvite: async () => noGroups(),
    revokeInvite: async () => noGroups(),
    invitePreview: async () => noGroups(),
    acceptInvite: async () => noGroups(),

    async importActions(imported: Action[]) {
      signedIn()
      for (const action of imported) {
        const { name, from, to, durationMinutes, windowStart, windowEnd, people: guests } = action
        const details = { name, from, to, durationMinutes, windowStart, windowEnd }
        const participantIds = selfId() ? [selfId()!] : []
        for (const guest of guests) {
          const id = generateId()
          people.push({
            id,
            name: guest.name,
            isSelf: false,
            sources: copy(guest.sources),
            overrides: copy(guest.overrides),
          })
          participantIds.push(id)
        }
        actions.push(resource(details, participantIds))
      }
      return imported.length
    },
  }
}
