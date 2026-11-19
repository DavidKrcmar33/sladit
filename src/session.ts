import { computed, reactive, watch } from 'vue'
import { BackendError, type Backend } from './client/backend'
import { httpBackend } from './client/http'
import { memoryBackend } from './client/memory'
import type {
  ActionResource,
  ActionView,
  ConfirmedSlot,
  Friend,
  Group,
  InviteLink,
  InvitePreview,
  OwnedPerson,
  User,
} from './contract/api'
import {
  buildCalendar,
  findReadingWarnings,
  findUncertainDays,
  privateRow,
  type CalendarView,
  type PersonDay,
} from './core/calendar'
import { composePeople, findParityQuestions } from './core/compose'
import { sampleAction } from './core/fixtures'
import {
  actionDetails,
  createAction as validateNewAction,
  updateActionDetails,
  type NewActionErrors,
  type NewActionInput,
} from './core/newAction'
import type { Action, DateString, Shift, SourceFile } from './core/schema'
import { findProposals } from './core/scheduler'
import { analyzeStability } from './core/sensitivity'
import { detectSourceFileKind } from './core/sourceFile'
import { LEGACY_STORAGE_KEY, STORAGE_KEY, loadState } from './core/storage'
import { addDays, eachDay, mondayOf } from './core/time'

/**
 * Stav aplikace v prohlížeči. Zdrojem pravdy je server (účet uživatele), tady je jeho kopie
 * a to, co na server nepatří: vložené a ještě nepřečtené soubory, otevřená stránka, výběr.
 *
 * Každý má jeden rozpis („Můj rozvrh“), který si nahraje sám. V akci jsou organizátor
 * a přátelé, kteří pozvánku přijali. O nich aplikace ví jen „může / nemůže / nevíme“.
 */

/** Klíč, pod kterým pozvánka z odkazu přečká přihlášení přes Google (sessionStorage). */
export const INVITE_STORAGE_KEY = 'sladit.pozvanka'

/** Token pozvánky z adresy /pozvanka/<token>, jinak null. */
export function inviteTokenFromPath(pathname: string): string | null {
  return /^\/pozvanka\/([\w-]{16,200})\/?$/.exec(pathname)?.[1] ?? null
}

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type SessionStatus = 'loading' | 'signedOut' | 'ready' | 'failed'

/** Otevřená stránka hlavní části. */
export type Page = 'action' | 'schedule' | 'friends' | 'group'

/** Pozvánka do skupiny nebo do přátel čekající na odpověď. Náhled je null, dokud nedorazí. */
export interface PendingInvite {
  token: string
  preview: InvitePreview | null
  error: string | null
}

/** Člověk, kterého jde pozvat do akce: přítel, nebo člen některé z mých skupin. */
export interface Contact {
  userId: string
  name: string
  isFriend: boolean
  groupNames: string[]
}

/** Kolik týdnů ukazuje Můj rozvrh a za jak dlouhé období se čtou podklady. */
const SCHEDULE_WEEKS = 4
const READING_WEEKS = 12
/** Denní okno, ve kterém Můj rozvrh ukazuje volno. */
const SCHEDULE_DAY = { durationMinutes: 60, windowStart: '06:00', windowEnd: '23:00' }

const PASTED_TEXT_NAME = 'Vložený text'

class MissingFilesError extends Error {}

const READ_ERROR = 'Rozpis se nepodařilo přečíst.'
const UNREADABLE_ERROR = 'Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.'
const NOTHING_TO_READ_ERROR = 'V podkladu není co číst.'
const RATE_LIMIT_ERROR = 'Došel limit, zkus to za chvíli.'
const MISSING_FILES_ERROR = 'Podklady je potřeba vložit znovu.'
const SAVE_ERROR = 'Změnu se nepodařilo uložit.'

function readErrorMessage(error: unknown): string {
  if (error instanceof MissingFilesError) return MISSING_FILES_ERROR
  if (error instanceof BackendError) {
    // Když se část podkladu modelu neposlala, je to pravděpodobnější příčina než špatná fotka.
    if (error.code === 'unreadable') {
      return error.notes.length > 0
        ? `${NOTHING_TO_READ_ERROR} ${error.notes.join(' ')}`
        : UNREADABLE_ERROR
    }
    if (error.code === 'busy') return RATE_LIMIT_ERROR
    return error.message
  }
  // Chyba při přípravě v prohlížeči, třeba poškozený Excel. Zpráva je česky.
  return error instanceof Error && error.message ? error.message : READ_ERROR
}

function localToday(): DateString {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export interface SessionOptions {
  backend: Backend
  generateId?: () => string
  /** Úložiště prohlížeče, ze kterého jde jednou převzít akce z doby před účty. */
  storage?: StorageLike | null
  /** Ukázka bez přihlášení: nic se neukládá a ukázková akce se otevře sama. */
  demo?: boolean
  /** Token pozvánky z otevřeného odkazu. */
  inviteToken?: string | null
  /** Úložiště, ve kterém pozvánka přečká přihlášení (sessionStorage). */
  inviteStorage?: WritableStorage | null
  /** Dnešní datum (testy). */
  today?: () => DateString
}

export function createSession(options: SessionOptions) {
  const { backend } = options
  const generateId = options.generateId ?? (() => crypto.randomUUID())
  const storage = options.storage ?? null
  const today = options.today ?? localToday
  const inviteStorage = options.inviteStorage ?? null
  if (options.inviteToken) inviteStorage?.setItem(INVITE_STORAGE_KEY, options.inviteToken)
  let inviteToken = options.inviteToken ?? inviteStorage?.getItem(INVITE_STORAGE_KEY) ?? null

  const state = reactive({
    status: 'loading' as SessionStatus,
    user: null as User | null,
    fakeGoogle: false,
    demo: options.demo ?? false,
    page: 'schedule' as Page,
    /** Můj rozpis: člověk „sám za sebe“ s podklady a ručními úpravami. */
    people: [] as OwnedPerson[],
    actions: [] as ActionResource[],
    selectedActionId: null as string | null,
    selectedGroupId: null as string | null,
    groups: [] as Group[],
    friends: [] as Friend[],
    friendInvites: [] as InviteLink[],
    /** Odkaz s pozvánkou, který se ukáže jen jednou, hned po založení. */
    lastInvite: null as { target: 'friends' | string; url: string } | null,
    /** Pozvánka z odkazu. Před přihlášením je známý jen token. */
    invite: null as PendingInvite | null,
    /** Pohledy ze serveru na akce s cizími lidmi: návrhy a stav dne ostatních. */
    views: {} as Record<string, ActionView>,
    /** Vložené a ještě nepřečtené soubory mého rozvrhu. Obsah drží jen paměť (fileBlobs). */
    pendingFiles: [] as SourceFile[],
    reading: false,
    readError: null as string | null,
    /** První den (pondělí) období, které ukazuje Můj rozvrh. */
    scheduleFrom: mondayOf(today()),
    selectedDay: null as PersonDay | null,
    /** Parametry akce před poslední úpravou, aby šla vrátit. */
    lastActionEdit: null as { actionId: string; previous: NewActionInput } | null,
    /** Poslední chyba při ukládání, ukáže se nahoře. */
    error: null as string | null,
    /** Akce uložené v tomto prohlížeči z doby před účty, které jde převzít. */
    localActions: [] as Action[],
  })

  const fileBlobs = new Map<string, File>()

  // Můj rozvrh

  const me = computed(() => state.people.find((person) => person.isSelf) ?? null)

  /** Můj rozvrh jako „akce“ jen se mnou, aby šel ukázat stejným kalendářem. */
  const scheduleAction = computed<Action | null>(() => {
    const person = me.value
    if (!person) return null
    return {
      id: 'muj-rozvrh',
      name: 'Můj rozvrh',
      from: state.scheduleFrom,
      to: addDays(state.scheduleFrom, SCHEDULE_WEEKS * 7 - 1),
      ...SCHEDULE_DAY,
      people: [{ ...person, files: state.pendingFiles }],
    }
  })

  const scheduleComposed = computed(() =>
    scheduleAction.value ? composePeople(scheduleAction.value) : [],
  )

  const scheduleCalendar = computed(() =>
    scheduleAction.value ? buildCalendar(scheduleAction.value, scheduleComposed.value) : null,
  )

  const scheduleParityQuestions = computed(() =>
    scheduleAction.value ? findParityQuestions(scheduleAction.value) : [],
  )

  const scheduleWarnings = computed(() => findReadingWarnings(scheduleComposed.value))

  const scheduleUncertainDays = computed(() =>
    scheduleAction.value ? findUncertainDays(scheduleAction.value, scheduleComposed.value) : [],
  )

  // Akce

  // Akce ve tvaru, se kterým počítá jádro (core): jen lidé, jejichž rozpis znám, tedy já.
  function assemble(resource: ActionResource): Action {
    const person = me.value
    const takesPart = person !== null && resource.participantIds.includes(person.id)
    return {
      id: resource.id,
      ...resource.details,
      people: takesPart ? [{ ...person, files: [] }] : [],
    }
  }

  const selectedResource = computed(
    () => state.actions.find((action) => action.id === state.selectedActionId) ?? null,
  )

  const selectedAction = computed(() =>
    selectedResource.value ? assemble(selectedResource.value) : null,
  )

  const selectedGroup = computed(
    () => state.groups.find((group) => group.id === state.selectedGroupId) ?? null,
  )

  /** Akci upravuje, zve do ní a potvrzuje termín jen organizátor. */
  const canEditAction = computed(() => selectedResource.value?.isOrganizer ?? false)

  /** Návrhy počítá server, když jsou v akci lidé, jejichž rozpis přihlášený nevidí. */
  const usesServerView = computed(() => (selectedResource.value?.others.length ?? 0) > 0)

  /** Pohled ze serveru, jen pokud sedí na dnešní období akce. */
  const currentView = computed<ActionView | null>(() => {
    const action = selectedAction.value
    const view = action ? state.views[action.id] : undefined
    if (!action || !view) return null
    const dates = eachDay(action.from, action.to)
    return view.dates.length === dates.length && view.dates.every((date, i) => date === dates[i])
      ? view
      : null
  })

  /** Účastníci vybrané akce v pořadí: organizátor a ti, kdo přijali. */
  const participants = computed(() => {
    const resource = selectedResource.value
    if (!resource) return []
    return resource.participantIds.flatMap((personId) => {
      if (me.value?.id === personId)
        return [{ id: personId, name: me.value.name, isPrivate: false }]
      const other = resource.others.find((person) => person.id === personId)
      return other ? [{ id: other.id, name: other.name, isPrivate: true }] : []
    })
  })

  const composedPeople = computed(() =>
    selectedAction.value ? composePeople(selectedAction.value) : [],
  )

  /** Kalendář akce: můj řádek s rozpisem, ostatní jen se stavem dne ze serveru. */
  const calendar = computed<CalendarView | null>(() => {
    const action = selectedAction.value
    if (!action) return null
    const own = buildCalendar(action, composedPeople.value)
    if (!usesServerView.value) return own
    const rows = new Map(own.rows.map((row) => [row.personId, row]))
    return {
      dates: own.dates,
      rows: participants.value.flatMap((person) => {
        if (!person.isPrivate) return rows.has(person.id) ? [rows.get(person.id)!] : []
        const days = currentView.value?.others.find((other) => other.personId === person.id)
        return [privateRow(person.id, person.name, own.dates, days?.days)]
      }),
    }
  })

  /** Zda se nejlepší termín může změnit a na čích datech to stojí. */
  const stability = computed(() => {
    if (usesServerView.value) return currentView.value?.stability ?? null
    return selectedAction.value
      ? analyzeStability(selectedAction.value, composedPeople.value)
      : null
  })

  const proposals = computed(() => {
    if (usesServerView.value) return currentView.value?.proposals ?? []
    return selectedAction.value ? findProposals(selectedAction.value, composedPeople.value) : []
  })

  /**
   * Nejistá čtení, která mohou změnit nejlepší termín. Nejistá směna zpochybní svůj den
   * a noční i ráno dne dalšího, proto se počítá i den po ní.
   */
  function isPivotal(day: PersonDay): boolean {
    const pivot = stability.value?.pivots.find((item) => item.personId === day.personId)
    return (
      pivot?.dates.some(
        (item) =>
          item.reason === 'uncertain' &&
          (item.date === day.date || item.date === addDays(day.date, 1)),
      ) ?? false
    )
  }

  /** Moje nejistá čtení v období akce, nejdřív ta, na kterých stojí nejlepší termín. */
  const uncertainDays = computed(() => {
    if (!selectedAction.value) return []
    const days = findUncertainDays(selectedAction.value, composedPeople.value)
    return [...days.filter(isPivotal), ...days.filter((day) => !isPivotal(day))]
  })

  const pivotalUncertainCount = computed(() => uncertainDays.value.filter(isPivotal).length)

  const readingWarnings = computed(() => findReadingWarnings(composedPeople.value))

  const parityQuestions = computed(() =>
    selectedAction.value ? findParityQuestions(selectedAction.value) : [],
  )

  /** Položky seznamu akcí: počet účastníků, čeká na moji odpověď, potvrzený termín. */
  const actionItems = computed(() =>
    state.actions.map((action) => ({
      id: action.id,
      name: action.details.name,
      from: action.details.from,
      to: action.details.to,
      peopleCount: action.participantIds.length,
      waitingForMe: action.myStatus === 'invited',
      confirmed: action.confirmed,
    })),
  )

  /** Koho jde pozvat: přátelé a členové mých skupin, každý jednou. */
  const contacts = computed<Contact[]>(() => {
    const byId = new Map<string, Contact>()
    for (const friend of state.friends) {
      byId.set(friend.userId, { ...friend, isFriend: true, groupNames: [] })
    }
    for (const group of state.groups) {
      for (const member of group.members) {
        if (member.isYou) continue
        const contact = byId.get(member.userId) ?? {
          userId: member.userId,
          name: member.name,
          isFriend: false,
          groupNames: [],
        }
        contact.groupNames.push(group.name)
        byId.set(member.userId, contact)
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  })

  // Práce se serverem

  function signedOut() {
    state.status = 'signedOut'
    state.user = null
    state.people = []
    state.actions = []
    state.selectedActionId = null
    state.selectedGroupId = null
    state.groups = []
    state.friends = []
    state.friendInvites = []
    state.lastInvite = null
    state.views = {}
    state.pendingFiles = []
    state.lastActionEdit = null
    state.localActions = []
    fileBlobs.clear()
    // Pozvánka z odkazu zůstává: po přihlášení se nabídne.
    state.invite = inviteToken ? { token: inviteToken, preview: null, error: null } : null
  }

  /** Volání serveru. Chyba se ukáže uživateli, vypršelé přihlášení vrátí na přihlašovací obrazovku. */
  async function guarded<T>(work: () => Promise<T>): Promise<T | null> {
    state.error = null
    try {
      return await work()
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) {
        signedOut()
        return null
      }
      state.error = error instanceof BackendError ? error.message : SAVE_ERROR
      return null
    }
  }

  function replaceMe(person: OwnedPerson) {
    state.people = state.people.map((existing) => (existing.id === person.id ? person : existing))
  }

  function replaceAction(action: ActionResource) {
    state.actions = state.actions.some((existing) => existing.id === action.id)
      ? state.actions.map((existing) => (existing.id === action.id ? action : existing))
      : [...state.actions, action]
  }

  function replaceGroup(group: Group) {
    state.groups = state.groups.some((existing) => existing.id === group.id)
      ? state.groups.map((existing) => (existing.id === group.id ? group : existing))
      : [...state.groups, group]
  }

  async function reload() {
    const [people, loaded, groups, friends] = await Promise.all([
      backend.people(),
      backend.actions(),
      backend.groups(),
      backend.friends(),
    ])
    state.people = people
    state.actions = loaded
    state.groups = groups
    state.friends = friends.friends
    state.friendInvites = friends.invites
    if (!loaded.some((action) => action.id === state.selectedActionId)) {
      state.selectedActionId = loaded[0]?.id ?? null
      if (state.page === 'action' && !state.selectedActionId) state.page = 'schedule'
    }
    if (!groups.some((group) => group.id === state.selectedGroupId)) {
      state.selectedGroupId = null
      if (state.page === 'group') state.page = 'schedule'
    }
  }

  function forgetInvite() {
    inviteToken = null
    inviteStorage?.removeItem(INVITE_STORAGE_KEY)
    state.invite = null
  }

  /** Načte, kam pozvánka zve. Neplatnou ukáže s vysvětlením. */
  async function loadInvite() {
    if (!inviteToken) return
    const token = inviteToken
    state.invite = { token, preview: null, error: null }
    try {
      state.invite = { token, preview: await backend.invitePreview(token), error: null }
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) return signedOut()
      state.invite = {
        token,
        preview: null,
        error: error instanceof BackendError ? error.message : 'Pozvánku se nepodařilo načíst.',
      }
    }
  }

  async function init() {
    state.status = 'loading'
    state.error = null
    try {
      const response = await backend.me()
      state.fakeGoogle = response.fakeGoogle
      if (!response.user) {
        signedOut()
        return
      }
      state.user = response.user
      await reload()
      // Kdo ještě nemá rozpis, začne Můj rozvrh. Jinak se otevře první akce.
      const hasSchedule = (state.people[0]?.sources.length ?? 0) > 0
      state.page = state.selectedActionId && (hasSchedule || state.demo) ? 'action' : 'schedule'
      state.localActions = !state.demo && storage ? (loadState(storage)?.actions ?? []) : []
      state.status = 'ready'
      if (!state.demo) await loadInvite()
    } catch (error) {
      state.status = 'failed'
      state.error = error instanceof BackendError ? error.message : 'Aplikace se nenačetla.'
    }
  }

  async function logout() {
    await guarded(() => backend.logout())
    signedOut()
  }

  async function deleteAccount() {
    const done = await guarded(async () => {
      await backend.deleteAccount()
      return true
    })
    if (done) signedOut()
  }

  /** Převezme akce uložené v prohlížeči do účtu. Z prohlížeče zmizí až po úspěchu. */
  async function acceptLocalActions() {
    const imported = await guarded(() => backend.importActions(state.localActions))
    if (imported === null) return
    storage?.removeItem(STORAGE_KEY)
    storage?.removeItem(LEGACY_STORAGE_KEY)
    state.localActions = []
    await guarded(reload)
  }

  /** Nabídku převzetí skryje jen pro tuto návštěvu, data v prohlížeči zůstanou. */
  function dismissLocalActions() {
    state.localActions = []
  }

  // Stránky

  function open(page: Page) {
    state.page = page
    state.selectedDay = null
    // Jednorázový odkaz s pozvánkou se ukazuje jen na stránce, kde vznikl.
    const here = page === 'group' ? state.selectedGroupId : page
    if (state.lastInvite && state.lastInvite.target !== here) state.lastInvite = null
  }

  function showSchedule() {
    open('schedule')
  }

  function showFriends() {
    open('friends')
  }

  function selectAction(actionId: string) {
    state.selectedActionId = actionId
    open('action')
  }

  function selectGroup(groupId: string) {
    state.selectedGroupId = groupId
    open('group')
  }

  // Akce

  /** Založí akci a pozve vybrané přátele. Vrací chyby formuláře. */
  async function createNewAction(
    input: NewActionInput,
    inviteUserIds: string[] = [],
  ): Promise<NewActionErrors | null> {
    const checked = validateNewAction('nova', input)
    if (!checked.ok) return checked.errors
    const action = await guarded(() => backend.createAction(input, inviteUserIds))
    if (!action) return null
    replaceAction(action)
    selectAction(action.id)
    return null
  }

  /** Změní parametry vybrané akce. Rozpisy zůstanou, termíny se přepočítají. Vrací chyby formuláře. */
  async function updateAction(input: NewActionInput): Promise<NewActionErrors | null> {
    const action = selectedAction.value
    if (!action) return null
    const checked = updateActionDetails(action, input)
    if (!checked.ok) return checked.errors
    const previous = actionDetails(action)
    const updated = await guarded(() => backend.updateAction(action.id, input))
    if (!updated) return null
    replaceAction(updated)
    state.lastActionEdit = { actionId: action.id, previous }
    state.selectedDay = null
    return null
  }

  /** Vrátí poslední úpravu parametrů akce. */
  async function undoActionUpdate() {
    const edit = state.lastActionEdit
    if (!edit || edit.actionId !== state.selectedActionId) return
    const restored = await guarded(() => backend.updateAction(edit.actionId, edit.previous))
    if (!restored) return
    replaceAction(restored)
    state.lastActionEdit = null
    state.selectedDay = null
  }

  async function deleteAction() {
    const actionId = state.selectedActionId
    if (!actionId) return
    const done = await guarded(async () => {
      await backend.deleteAction(actionId)
      return true
    })
    if (!done) return
    state.actions = state.actions.filter((action) => action.id !== actionId)
    state.selectedActionId = state.actions[0]?.id ?? null
    open(state.selectedActionId ? 'action' : 'schedule')
  }

  async function inviteToAction(userIds: string[]) {
    const actionId = state.selectedActionId
    if (!actionId || userIds.length === 0) return
    const action = await guarded(() => backend.inviteToAction(actionId, userIds))
    if (action) replaceAction(action)
  }

  async function cancelInvite(userId: string) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await guarded(() => backend.cancelInvite(actionId, userId))
    if (action) replaceAction(action)
  }

  /** Odpověď na pozvánku. Po odmítnutí akce zmizí ze seznamu. */
  async function respondToAction(accept: boolean) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const result = await guarded(async () => ({
      action: await backend.respondToAction(actionId, accept),
    }))
    if (!result) return
    if (result.action) {
      replaceAction(result.action)
      return
    }
    state.actions = state.actions.filter((action) => action.id !== actionId)
    state.selectedActionId = state.actions[0]?.id ?? null
    open(state.selectedActionId ? 'action' : 'schedule')
  }

  /** Organizátor potvrdí termín, nebo potvrzení zruší (null). */
  async function confirmSlot(slot: ConfirmedSlot | null) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await guarded(() => backend.confirmAction(actionId, slot))
    if (action) replaceAction(action)
  }

  // Přátelé

  /** Osobní odkaz „přidej si mě do přátel“. Ukáže se jen teď, server si ho nepamatuje. */
  async function createFriendInvite() {
    const created = await guarded(() => backend.createFriendInvite())
    if (!created) return
    state.friendInvites = [...state.friendInvites, created.invite]
    state.lastInvite = { target: 'friends', url: created.url }
  }

  async function revokeFriendInvite(inviteId: string) {
    const done = await guarded(async () => {
      await backend.revokeFriendInvite(inviteId)
      return true
    })
    if (done) state.friendInvites = state.friendInvites.filter((item) => item.id !== inviteId)
  }

  async function removeFriend(userId: string) {
    const done = await guarded(async () => {
      await backend.removeFriend(userId)
      return true
    })
    if (done) state.friends = state.friends.filter((friend) => friend.userId !== userId)
  }

  // Skupiny

  async function createGroup(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return 'Vyplň název skupiny.'
    const group = await guarded(() => backend.createGroup(trimmed))
    if (!group) return state.error
    replaceGroup(group)
    selectGroup(group.id)
    return null
  }

  async function createInvite(groupId: string) {
    const created = await guarded(() => backend.createInvite(groupId))
    if (!created) return
    replaceGroup(created.group)
    state.lastInvite = { target: groupId, url: created.url }
  }

  async function revokeInvite(groupId: string, inviteId: string) {
    const group = await guarded(() => backend.revokeInvite(groupId, inviteId))
    if (group) replaceGroup(group)
  }

  async function removeMember(groupId: string, userId: string) {
    const group = await guarded(() => backend.removeMember(groupId, userId))
    if (group) replaceGroup(group)
  }

  /** Odchod ze skupiny, nebo její smazání zakladatelem. Akce zůstávají. */
  async function leaveGroup(groupId: string, remove = false) {
    const done = await guarded(async () => {
      await (remove ? backend.deleteGroup(groupId) : backend.leaveGroup(groupId))
      state.groups = state.groups.filter((group) => group.id !== groupId)
      return true
    })
    if (done) {
      state.selectedGroupId = null
      open('schedule')
    }
  }

  // Pozvánky odkazem

  async function acceptInvite() {
    const token = state.invite?.token
    if (!token) return
    const result = await guarded(() => backend.acceptInvite(token))
    if (!result) return
    forgetInvite()
    if (result.kind === 'group') {
      replaceGroup(result.group)
      selectGroup(result.group.id)
    } else {
      if (!state.friends.some((friend) => friend.userId === result.friend.userId)) {
        state.friends = [...state.friends, result.friend]
      }
      showFriends()
    }
  }

  function declineInvite() {
    forgetInvite()
  }

  // Pohled ze serveru na akce s cizími lidmi

  let viewRequest = 0

  /** Načte návrhy a stav dne ostatních pro vybranou akci. Starší odpověď novější nepřepíše. */
  async function refreshView() {
    const resource = selectedResource.value
    if (!resource || resource.others.length === 0 || state.status !== 'ready') return
    const request = ++viewRequest
    try {
      const view = await backend.actionView(resource.id)
      if (request === viewRequest) state.views[resource.id] = view
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) return signedOut()
      if (request === viewRequest) {
        state.error = error instanceof BackendError ? error.message : SAVE_ERROR
      }
    }
  }

  // Pohled se přepočítá, když se změní akce nebo můj rozpis.
  const viewKey = computed(() => {
    const resource = selectedResource.value
    if (!resource || resource.others.length === 0) return null
    const mine = me.value ? [me.value.sources, me.value.overrides] : null
    return JSON.stringify([resource, mine, state.status])
  })
  watch(viewKey, (key) => {
    if (key) void refreshView()
  })

  // Můj rozvrh: podklady, čtení, ruční úpravy

  /** Vloží soubory k přečtení. Vrací názvy souborů, které neumíme přečíst. */
  function addFiles(files: File[]): string[] {
    const rejectedNames: string[] = []
    for (const file of files) {
      const kind = detectSourceFileKind(file.name, file.type)
      if (!kind) {
        rejectedNames.push(file.name)
        continue
      }
      const id = generateId()
      fileBlobs.set(id, file)
      state.pendingFiles.push({ id, name: file.name, kind })
    }
    state.readError = null
    return rejectedNames
  }

  function addText(text: string) {
    addFiles([new File([text], `${PASTED_TEXT_NAME}.txt`, { type: 'text/plain' })])
  }

  function removePendingFile(fileId: string) {
    state.pendingFiles = state.pendingFiles.filter((file) => file.id !== fileId)
    fileBlobs.delete(fileId)
  }

  /** Přečte vložené podklady modelem a přidá je k mému rozpisu. Starší zdroje a úpravy zůstanou. */
  async function readSchedule() {
    const person = me.value
    const files = state.pendingFiles
    if (!person || files.length === 0 || state.reading) return
    state.reading = true
    state.readError = null
    try {
      const blobs = files.map((file) => fileBlobs.get(file.id))
      if (blobs.some((blob) => blob === undefined)) throw new MissingFilesError()
      // Příprava běží v prohlížeči: z Excelu jde jen viditelná část a název souboru se neposílá.
      // Modul s ExcelJS se načte až tady, ať se s ním nestahuje úvodní stránka.
      const { prepareSource } = await import('./llm/ingest')
      const parts = await Promise.all(
        files.map((file, index) => prepareSource(blobs[index]!, file.kind)),
      )
      const from = mondayOf(today())
      const updated = await backend.read(person.id, {
        from,
        to: addDays(from, READING_WEEKS * 7 - 1),
        files: [...files],
        parts,
      })
      replaceMe(updated)
      state.pendingFiles = []
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) signedOut()
      state.readError = readErrorMessage(error)
    } finally {
      state.reading = false
    }
  }

  async function renameMe(name: string): Promise<string | null> {
    const person = me.value
    const trimmed = name.trim()
    if (!person) return null
    if (!trimmed) return 'Jméno nesmí být prázdné.'
    const updated = await guarded(() => backend.renamePerson(person.id, trimmed))
    if (!updated) return state.error
    replaceMe(updated)
    return null
  }

  function selectDay(day: PersonDay | null) {
    state.selectedDay = day
  }

  /** Ruční úprava dne. Pokrývá jen ten den a nové čtení ji nepřepíše. */
  async function saveDayShifts(date: DateString, shifts: Shift[]) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.setOverride(person.id, date, shifts))
    if (updated) replaceMe(updated)
  }

  /** Den se zase řídí podklady. */
  async function clearDayOverride(date: DateString) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.deleteOverride(person.id, date))
    if (updated) replaceMe(updated)
  }

  async function removeSource(sourceId: string) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.deleteSource(person.id, sourceId))
    if (!updated) return
    replaceMe(updated)
    // Obsah souborů smazaného zdroje už není potřeba ani pro náhled.
    const referenced = new Set([
      ...state.pendingFiles.map((file) => file.id),
      ...updated.sources.flatMap((source) => source.files.map((file) => file.id)),
    ])
    for (const fileId of fileBlobs.keys()) if (!referenced.has(fileId)) fileBlobs.delete(fileId)
  }

  async function changeSourceCircle(sourceId: string, circle: string) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.updateSource(person.id, sourceId, { circle }))
    if (updated) replaceMe(updated)
  }

  /** Potvrzení, zda je týden s daným dnem lichý, nebo sudý. */
  async function answerWeekParity(sourceId: string, date: DateString, odd: boolean) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() =>
      backend.updateSource(person.id, sourceId, { weekParity: { date, odd } }),
    )
    if (updated) replaceMe(updated)
  }

  /** Posune Můj rozvrh o daný počet týdnů. */
  function shiftSchedule(weeks: number) {
    state.scheduleFrom = addDays(state.scheduleFrom, weeks * 7)
    state.selectedDay = null
  }

  function fileBlob(fileId: string): File | undefined {
    return fileBlobs.get(fileId)
  }

  return {
    state,
    loginUrl: backend.loginUrl,
    me,
    scheduleAction,
    scheduleCalendar,
    scheduleComposed,
    scheduleParityQuestions,
    scheduleWarnings,
    scheduleUncertainDays,
    actionItems,
    contacts,
    selectedResource,
    selectedAction,
    selectedGroup,
    canEditAction,
    usesServerView,
    participants,
    composedPeople,
    calendar,
    stability,
    proposals,
    uncertainDays,
    pivotalUncertainCount,
    readingWarnings,
    parityQuestions,
    init,
    logout,
    deleteAccount,
    acceptLocalActions,
    dismissLocalActions,
    showSchedule,
    showFriends,
    selectAction,
    selectGroup,
    createAction: createNewAction,
    updateAction,
    undoActionUpdate,
    deleteAction,
    inviteToAction,
    cancelInvite,
    respondToAction,
    confirmSlot,
    createFriendInvite,
    revokeFriendInvite,
    removeFriend,
    createGroup,
    createInvite,
    revokeInvite,
    removeMember,
    leaveGroup,
    acceptInvite,
    declineInvite,
    refreshView,
    addFiles,
    addText,
    removePendingFile,
    readSchedule,
    renameMe,
    selectDay,
    saveDayShifts,
    clearDayOverride,
    removeSource,
    changeSourceCircle,
    answerWeekParity,
    shiftSchedule,
    fileBlob,
  }
}

export type Session = ReturnType<typeof createSession>

let session: Session | null = null

/** Ukázka bez přihlášení na adrese s ?ukazka. Nic se v ní neukládá a podklady se nečtou. */
function isDemo(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('ukazka')
}

/**
 * Token z odkazu /pozvanka/<token>. Adresa se hned přepíše na úvodní, aby token nezůstal
 * v historii ani na snímku obrazovky. Do přihlášení ho drží sessionStorage.
 */
function takeInviteTokenFromUrl(): string | null {
  if (typeof location === 'undefined') return null
  const token = inviteTokenFromPath(location.pathname)
  if (token) history.replaceState(null, '', '/')
  return token
}

export function useSession(): Session {
  if (!session) {
    const demo = isDemo()
    session = createSession({
      backend: demo
        ? memoryBackend({ user: { id: 'ukazka', email: '', name: 'Ty' }, sample: sampleAction })
        : httpBackend(),
      storage: typeof localStorage === 'undefined' ? null : localStorage,
      demo,
      inviteToken: demo ? null : takeInviteTokenFromUrl(),
      inviteStorage: typeof sessionStorage === 'undefined' ? null : sessionStorage,
    })
    void session.init()
  }
  return session
}
