import type {
  ActionResource,
  ConfirmedSlot,
  OwnedPerson,
  ReadingRequest,
  User,
} from '@/contract/api'
import { withAnchor } from '@/core/parity'
import {
  ActionDetailsSchema,
  type Action,
  type ActionDetails,
  type Person,
  type Shift,
  type SourceContent,
} from '@/core/schema'
import { composePeople } from '@/core/compose'
import { daySlots } from '@/core/scheduler'
import { sharedView } from '@/core/sharedView'
import { BackendError, type Backend } from './backend'

/**
 * Server v paměti prohlížeče pro jednoho uživatele. Slouží testům a ukázce bez přihlášení,
 * kde se nic neukládá. Chová se jako skutečný server (server/app.ts) v tom, co aplikace
 * používá: uživatel má svůj rozpis a akce, organizátor se akce účastní vždy.
 *
 * Ukázka (`sample`): první člověk z ukázkové akce je přihlášený sám, jeho rozpis je jeho.
 * Ostatní jsou přátelé, kteří pozvánku přijali. Jejich rozpisy má ukázka v paměti, ale ven
 * pustí jen „může / nemůže / nevíme“, stejně jako server.
 */
export interface MemoryBackendOptions {
  user: User | null
  /** Čtení podkladů. Bez něj (ukázka) čtení vrátí chybu s vysvětlením. */
  read?: (request: ReadingRequest) => Promise<SourceContent>
  generateId?: () => string
  sample?: Action
}

interface StoredAction {
  id: string
  details: ActionDetails
  /** Přátelé z ukázky, kteří pozvánku přijali. */
  friendIds: string[]
  confirmed: ConfirmedSlot | null
}

/** Kopie dat, jako by prošla sítí. Na rozdíl od structuredClone zvládne i reaktivní objekty Vue. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function detailsOf(action: Action): ActionDetails {
  const { name, from, to, durationMinutes, windowStart, windowEnd } = action
  return { name, from, to, durationMinutes, windowStart, windowEnd }
}

export function memoryBackend(options: MemoryBackendOptions): Backend & {
  /** Přihlásí uživatele, jako by prošel Googlem (testy). */
  signIn(user: User): void
} {
  let user = options.user
  let counter = 0
  const generateId = options.generateId ?? (() => `m${++counter}`)
  let self: OwnedPerson | null = null
  let actions: StoredAction[] = []
  const [sampleSelf, ...sampleFriends] = options.sample?.people ?? []
  const friends: Person[] = copy(sampleFriends)

  function ensureSelf() {
    if (user && !self) {
      self = {
        id: generateId(),
        name: user.name,
        isSelf: true,
        sources: copy(sampleSelf?.sources ?? []),
        overrides: copy(sampleSelf?.overrides ?? []),
      }
    }
  }
  ensureSelf()
  if (options.sample) {
    actions.push({
      id: generateId(),
      details: detailsOf(options.sample),
      friendIds: friends.map((friend) => friend.id),
      confirmed: null,
    })
  }

  function signedIn(): User {
    if (!user) throw new BackendError('Nejsi přihlášený.', 401)
    return user
  }

  function me(personId: string): OwnedPerson {
    signedIn()
    if (!self || self.id !== personId) throw new BackendError('Člověk nenalezen.', 404)
    return self
  }

  function stored(actionId: string): StoredAction {
    signedIn()
    const action = actions.find((candidate) => candidate.id === actionId)
    if (!action) throw new BackendError('Akce nenalezena.', 404)
    return action
  }

  function update(personId: string, change: (person: OwnedPerson) => OwnedPerson): OwnedPerson {
    self = change(me(personId))
    return copy(self)
  }

  function checked(details: ActionDetails): ActionDetails {
    const parsed = ActionDetailsSchema.safeParse(details)
    if (!parsed.success) throw new BackendError(parsed.error.issues[0].message, 400)
    return parsed.data
  }

  function friendsIn(action: StoredAction): Person[] {
    return friends.filter((friend) => action.friendIds.includes(friend.id))
  }

  function resource(action: StoredAction): ActionResource {
    const invited = friendsIn(action)
    return copy({
      id: action.id,
      details: action.details,
      participantIds: [...(self ? [self.id] : []), ...invited.map((friend) => friend.id)],
      others: invited.map(({ id, name }) => ({ id, name })),
      isOrganizer: true,
      organizerName: user?.name ?? '',
      myStatus: 'organizer' as const,
      // V ukázce ostatní na navržený termín rovnou jdou, nikdo jiný tu neodpovídá.
      invites: invited.map(({ id, name }) => ({
        userId: id,
        name,
        status: 'accepted' as const,
        slot: action.confirmed ? ('going' as const) : ('pending' as const),
        counter: null,
        required: false,
        hasSchedule: true,
      })),
      confirmed: action.confirmed,
      mySlot: null,
      agreed: action.confirmed !== null,
      inMyCalendar: false,
      links: [],
      poll: null,
      remindedAt: null,
    })
  }

  function onlyWithAccount(): never {
    signedIn()
    throw new BackendError('Tohle jde jen s účtem. Přihlas se.', 400)
  }

  return {
    loginUrl: '/api/auth/google',
    calendarConnectUrl: '/api/calendar/connect',
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
      self = null
      actions = []
    },

    async people() {
      signedIn()
      return self ? [copy(self)] : []
    },
    async renamePerson(personId, name) {
      return update(personId, (person) => ({ ...person, name }))
    },
    async read(personId, request) {
      me(personId)
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
    // V ukázce se podklady nečtou, takže se k nim není na co doptat.
    answerSource: async () => onlyWithAccount(),
    clarifySource: async () => onlyWithAccount(),
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
    async dismissWarning(personId, sourceId, warning) {
      return update(personId, (person) => ({
        ...person,
        sources: person.sources.map((source) =>
          source.id === sourceId
            ? { ...source, warnings: source.warnings.filter((item) => item !== warning) }
            : source,
        ),
      }))
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
      return actions.map(resource)
    },
    async createAction(details, inviteUserIds = []) {
      signedIn()
      // V ukázce jde pozvat jen přátele z ukázky a rovnou se počítají, jako by přijali.
      if (inviteUserIds.some((userId) => !friends.some((friend) => friend.id === userId))) {
        throw new BackendError('Pozvat jde jen přátele a lidi z tvých skupin.', 400)
      }
      const action = {
        id: generateId(),
        details: checked(details),
        friendIds: [...new Set(inviteUserIds)],
        confirmed: null,
      }
      actions.push(action)
      return resource(action)
    },
    async updateAction(actionId, details) {
      const action = stored(actionId)
      const next = checked(details)
      // Potvrzený termín zmizí, když se změní cokoli kromě názvu.
      const fields = ['from', 'to', 'durationMinutes', 'windowStart', 'windowEnd'] as const
      if (fields.some((field) => action.details[field] !== next[field])) action.confirmed = null
      action.details = next
      return resource(action)
    },
    async deleteAction(actionId) {
      stored(actionId)
      actions = actions.filter((action) => action.id !== actionId)
    },
    async actionView(actionId) {
      const action = stored(actionId)
      const invited = friendsIn(action)
      const people: Person[] = [
        ...(self ? [{ ...self, files: [] }] : []),
        ...invited.map((friend) => ({ ...friend, files: [] })),
      ]
      const view = sharedView(
        { id: action.id, ...action.details, people },
        new Set(invited.map((friend) => friend.id)),
      )
      return copy({ actionId: action.id, ...view })
    },
    async daySlots(actionId, date) {
      const action = stored(actionId)
      const people: Person[] = [
        ...(self ? [{ ...self, files: [] }] : []),
        ...friendsIn(action).map((friend) => ({ ...friend, files: [] })),
      ]
      const full = { id: action.id, ...action.details, people }
      return copy(daySlots(full, composePeople(full), date))
    },
    // Nezbytní, prosby a hlasování jdou jen s účtem: v ukázce nikdo jiný neodpovídá.
    setRequired: async () => onlyWithAccount(),
    remind: async () => onlyWithAccount(),
    createPoll: async () => onlyWithAccount(),
    deletePoll: async () => onlyWithAccount(),
    vote: async () => onlyWithAccount(),
    choosePoll: async () => onlyWithAccount(),
    async inviteToAction(actionId, userIds) {
      const action = stored(actionId)
      if (userIds.some((userId) => !friends.some((friend) => friend.id === userId))) {
        throw new BackendError('Pozvat jde jen přátele a lidi z tvých skupin.', 400)
      }
      action.friendIds = [...new Set([...action.friendIds, ...userIds])]
      return resource(action)
    },
    async cancelInvite(actionId, userId) {
      const action = stored(actionId)
      if (!action.friendIds.includes(userId)) throw new BackendError('Pozvánka nenalezena.', 404)
      action.friendIds = action.friendIds.filter((id) => id !== userId)
      return resource(action)
    },
    respondToAction: async () => onlyWithAccount(),
    // V ukázce se model nevolá a odkazy nikam nevedou.
    draftAction: async () => onlyWithAccount(),
    createActionLink: async () => onlyWithAccount(),
    revokeActionLink: async () => onlyWithAccount(),
    async confirmAction(actionId, slot) {
      const action = stored(actionId)
      action.confirmed = slot ? copy(slot) : null
      return resource(action)
    },

    async friends() {
      signedIn()
      return {
        friends: friends.map(({ id, name }) => ({ userId: id, name, email: '' })),
        invites: [],
        incoming: [],
        outgoing: [],
      }
    },
    sendFriendRequest: async () => onlyWithAccount(),
    acceptFriendRequest: async () => onlyWithAccount(),
    deleteFriendRequest: async () => onlyWithAccount(),
    createFriendInvite: async () => onlyWithAccount(),
    // V ukázce na termín nikdo neodpovídá, ostatní rovnou jdou.
    respondToSlot: async () => onlyWithAccount(),
    adoptCounter: async () => onlyWithAccount(),
    revokeFriendInvite: async () => onlyWithAccount(),
    removeFriend: async () => onlyWithAccount(),

    async groups() {
      signedIn()
      return []
    },
    createGroup: async () => onlyWithAccount(),
    deleteGroup: async () => onlyWithAccount(),
    leaveGroup: async () => onlyWithAccount(),
    addMember: async () => onlyWithAccount(),
    removeMember: async () => onlyWithAccount(),
    createInvite: async () => onlyWithAccount(),
    revokeInvite: async () => onlyWithAccount(),
    invitePreview: async () => onlyWithAccount(),
    acceptInvite: async () => onlyWithAccount(),

    // Kalendář jde jen s účtem a serverem.
    async calendarStatus() {
      signedIn()
      return { state: 'unavailable' as const, autoWrite: false, canWrite: false, syncedAt: null }
    },
    setCalendarAutoWrite: async () => onlyWithAccount(),
    disconnectCalendar: async () => onlyWithAccount(),
    syncCalendar: async () => onlyWithAccount(),
    addToCalendar: async () => onlyWithAccount(),
    removeFromCalendar: async () => onlyWithAccount(),

    async importActions(imported: Action[]) {
      signedIn()
      // Jako server: jen parametry akcí, lidi z nich se nepřevezmou.
      for (const action of imported) {
        actions.push({
          id: generateId(),
          details: checked(detailsOf(action)),
          friendIds: [],
          confirmed: null,
        })
      }
      return imported.length
    },
  }
}
