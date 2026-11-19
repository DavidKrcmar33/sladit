import { computed, reactive, watch } from 'vue'
import { BackendError, type Backend } from './client/backend'
import { httpBackend } from './client/http'
import { memoryBackend } from './client/memory'
import type {
  ActionResource,
  ActionView,
  Group,
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
import { LEGACY_STORAGE_KEY, STORAGE_KEY, loadState, type Step } from './core/storage'
import { addDays, eachDay } from './core/time'

export type { Step }

/** Klíč, pod kterým pozvánka z odkazu přečká přihlášení přes Google (sessionStorage). */
export const INVITE_STORAGE_KEY = 'sladit.pozvanka'

/** Token pozvánky z adresy /pozvanka/<token>, jinak null. */
export function inviteTokenFromPath(pathname: string): string | null {
  return /^\/pozvanka\/([\w-]{16,200})\/?$/.exec(pathname)?.[1] ?? null
}

/**
 * Stav aplikace v prohlížeči. Zdrojem pravdy je server (účet uživatele), tady je jeho kopie
 * a to, co na server nepatří: rozpracovaný člověk, vložené a ještě nepřečtené soubory, výběr.
 */

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Pozvánka do skupiny čekající na odpověď. Náhled je null, dokud nedorazí, nebo když neplatí. */
export interface PendingInvite {
  token: string
  preview: InvitePreview | null
  error: string | null
}

export type ReadStatus = 'pending' | 'reading' | 'done' | 'error'

export type SessionStatus = 'loading' | 'signedOut' | 'ready' | 'failed'

export interface PersonDraft {
  editingPersonId: string | null
  name: string
  /** Vložené soubory, které se ještě nečetly. */
  files: SourceFile[]
}

const MIN_PEOPLE_FOR_CALENDAR = 2
const PASTED_TEXT_NAME = 'Vložený text'

class MissingFilesError extends Error {}

const READ_ERROR = 'Rozpis se nepodařilo přečíst.'
const UNREADABLE_ERROR = 'Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.'
const NOTHING_TO_READ_ERROR = 'V podkladu není co číst.'
const RATE_LIMIT_ERROR = 'Došel limit, zkus to za chvíli.'
const MISSING_FILES_ERROR = 'Podklady je potřeba vložit znovu.'
const SAVE_ERROR = 'Změnu se nepodařilo uložit.'

function emptyDraft(): PersonDraft {
  return { editingPersonId: null, name: '', files: [] }
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase('cs')
}

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
}

export function createSession(options: SessionOptions) {
  const { backend } = options
  const generateId = options.generateId ?? (() => crypto.randomUUID())
  const storage = options.storage ?? null
  const inviteStorage = options.inviteStorage ?? null
  if (options.inviteToken) inviteStorage?.setItem(INVITE_STORAGE_KEY, options.inviteToken)
  let inviteToken = options.inviteToken ?? inviteStorage?.getItem(INVITE_STORAGE_KEY) ?? null

  const state = reactive({
    status: 'loading' as SessionStatus,
    user: null as User | null,
    fakeGoogle: false,
    demo: options.demo ?? false,
    /** Lidé, které uživatel vlastní: on sám a jeho hosté, s rozpisy. */
    people: [] as OwnedPerson[],
    actions: [] as ActionResource[],
    selectedActionId: null as string | null,
    stepByActionId: {} as Record<string, Step>,
    /** Vložené a ještě nepřečtené soubory podle člověka. Obsah drží jen paměť (fileBlobs). */
    pendingFiles: {} as Record<string, SourceFile[]>,
    draft: emptyDraft(),
    selectedDay: null as PersonDay | null,
    readingByPersonId: {} as Record<string, ReadStatus>,
    readErrorByPersonId: {} as Record<string, string>,
    /** Průběh čtení rozpisů, null když se nic nečte. */
    readProgress: null as { done: number; total: number } | null,
    /** Parametry akce před poslední úpravou, aby šla vrátit. */
    lastActionEdit: null as { actionId: string; previous: NewActionInput } | null,
    /** Poslední chyba při ukládání, ukáže se nahoře. */
    error: null as string | null,
    /** Akce uložené v tomto prohlížeči z doby před účty, které jde převzít. */
    localActions: [] as Action[],
    groups: [] as Group[],
    /** Otevřená skupina. Má přednost před vybranou akcí. */
    selectedGroupId: null as string | null,
    /** Odkaz s pozvánkou, který se ukáže jen jednou, hned po založení. */
    lastInvite: null as { groupId: string; url: string } | null,
    /** Pozvánka z odkazu. Před přihlášením je známý jen token. */
    invite: null as PendingInvite | null,
    /** Pohledy ze serveru na akce s cizími lidmi: návrhy a stav dne ostatních. */
    views: {} as Record<string, ActionView>,
  })

  const fileBlobs = new Map<string, File>()

  // Akce ve tvaru, se kterým počítá jádro (core): lidé s rozpisy přímo v akci.
  function assemble(resource: ActionResource): Action {
    const byId = new Map(state.people.map((person) => [person.id, person]))
    return {
      id: resource.id,
      ...resource.details,
      people: resource.participantIds.flatMap((personId) => {
        const person = byId.get(personId)
        if (!person) return []
        const { id, name, sources, overrides } = person
        return [{ id, name, files: state.pendingFiles[id] ?? [], sources, overrides }]
      }),
    }
  }

  const actions = computed(() => state.actions.map(assemble))

  const selectedAction = computed(
    () => actions.value.find((action) => action.id === state.selectedActionId) ?? null,
  )

  /** Vybraná akce, jak ji poslal server: i s cizími účastníky, skupinou a organizátorem. */
  const selectedResource = computed(
    () => state.actions.find((action) => action.id === state.selectedActionId) ?? null,
  )

  const selectedGroup = computed(
    () => state.groups.find((group) => group.id === state.selectedGroupId) ?? null,
  )

  /** Akci upravuje a přidává do ní lidi jen organizátor. */
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

  /** Jména všech účastníků vybrané akce, vlastních i cizích. */
  const participants = computed(() => {
    const resource = selectedResource.value
    if (!resource) return []
    return resource.participantIds.flatMap((personId) => {
      const own = state.people.find((person) => person.id === personId)
      if (own) return [{ id: own.id, name: own.name, isPrivate: false }]
      const other = resource.others.find((person) => person.id === personId)
      return other ? [{ id: other.id, name: other.name, isPrivate: true }] : []
    })
  })

  /** Položky seznamu akcí: počet lidí včetně cizích a název skupiny. */
  const actionItems = computed(() =>
    state.actions.map((action) => ({
      id: action.id,
      name: action.details.name,
      from: action.details.from,
      to: action.details.to,
      peopleCount: action.participantIds.length,
      groupName: state.groups.find((group) => group.id === action.groupId)?.name ?? null,
    })),
  )

  const selfPersonId = computed(() => state.people.find((person) => person.isSelf)?.id ?? null)

  const currentStep = computed<Step>(() =>
    state.selectedActionId ? (state.stepByActionId[state.selectedActionId] ?? 'intake') : 'intake',
  )

  const isDraftDirty = computed(
    () =>
      state.draft.editingPersonId !== null ||
      state.draft.name.trim() !== '' ||
      state.draft.files.length > 0,
  )

  const calendarBlocker = computed<string | null>(() => {
    if (isDraftDirty.value) return 'Nejdřív dokonči rozpracovaného člověka.'
    if (participants.value.length < MIN_PEOPLE_FOR_CALENDAR) {
      return canEditAction.value ? 'Přidej aspoň dva lidi.' : 'V akci je zatím jen jeden člověk.'
    }
    return null
  })

  /** Rozpisy lidí složené ze zdrojů a ručních úprav pro období vybrané akce. */
  const composedPeople = computed(() =>
    selectedAction.value ? composePeople(selectedAction.value) : [],
  )

  /**
   * Kalendář: vlastní lidé s rozpisem, ostatní jen se stavem dne ze serveru,
   * v pořadí účastníků akce.
   */
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

  /** Nejistá čtení, nejdřív ta, na kterých stojí nejlepší termín. */
  const uncertainDays = computed(() => {
    if (!selectedAction.value) return []
    const days = findUncertainDays(selectedAction.value, composedPeople.value)
    return [...days.filter(isPivotal), ...days.filter((day) => !isPivotal(day))]
  })

  const pivotalUncertainCount = computed(() => uncertainDays.value.filter(isPivotal).length)

  const readingWarnings = computed(() => findReadingWarnings(composedPeople.value))

  const proposals = computed(() => {
    if (usesServerView.value) return currentView.value?.proposals ?? []
    return selectedAction.value ? findProposals(selectedAction.value, composedPeople.value) : []
  })

  const parityQuestions = computed(() =>
    selectedAction.value ? findParityQuestions(selectedAction.value) : [],
  )

  // Práce se serverem

  function signedOut() {
    state.status = 'signedOut'
    state.user = null
    state.people = []
    state.actions = []
    state.selectedActionId = null
    state.pendingFiles = {}
    state.lastActionEdit = null
    state.localActions = []
    state.groups = []
    state.selectedGroupId = null
    state.lastInvite = null
    state.views = {}
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

  function replacePersonState(person: OwnedPerson) {
    state.people = state.people.map((existing) => (existing.id === person.id ? person : existing))
  }

  function replaceActionState(action: ActionResource) {
    state.actions = state.actions.map((existing) => (existing.id === action.id ? action : existing))
  }

  async function reload() {
    const [people, loaded, groups] = await Promise.all([
      backend.people(),
      backend.actions(),
      backend.groups(),
    ])
    state.people = people
    state.actions = loaded
    state.groups = groups
    if (!loaded.some((action) => action.id === state.selectedActionId)) {
      state.selectedActionId = loaded[0]?.id ?? null
    }
    if (!groups.some((group) => group.id === state.selectedGroupId)) {
      state.selectedGroupId = null
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
      const me = await backend.me()
      state.fakeGoogle = me.fakeGoogle
      if (!me.user) {
        signedOut()
        return
      }
      state.user = me.user
      await reload()
      if (state.demo && state.actions.length === 0) {
        await openSampleAction()
        // Ukázkový uživatel nemá rozpis, v akci by jen přidal „nevíme“ ke každému dni.
        const action = state.actions[0]
        if (action && selfPersonId.value) {
          replaceActionState(await backend.removeParticipant(action.id, selfPersonId.value))
        }
      }
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

  // Skupiny a pozvánky

  function replaceGroupState(group: Group) {
    state.groups = state.groups.some((existing) => existing.id === group.id)
      ? state.groups.map((existing) => (existing.id === group.id ? group : existing))
      : [...state.groups, group]
  }

  function selectGroup(groupId: string | null) {
    state.selectedGroupId = groupId
    state.selectedDay = null
    if (state.lastInvite?.groupId !== groupId) state.lastInvite = null
  }

  async function createGroup(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return 'Vyplň název skupiny.'
    const group = await guarded(() => backend.createGroup(trimmed))
    if (!group) return state.error
    replaceGroupState(group)
    selectGroup(group.id)
    return null
  }

  /** Odkaz s pozvánkou se ukáže jen teď, server si ho nepamatuje. */
  async function createInvite(groupId: string) {
    const created = await guarded(() => backend.createInvite(groupId))
    if (!created) return
    replaceGroupState(created.group)
    state.lastInvite = { groupId, url: created.url }
  }

  async function revokeInvite(groupId: string, inviteId: string) {
    const group = await guarded(() => backend.revokeInvite(groupId, inviteId))
    if (group) replaceGroupState(group)
  }

  async function removeMember(groupId: string, userId: string) {
    const group = await guarded(async () => {
      const updated = await backend.removeMember(groupId, userId)
      // Akce, které člen ve skupině pořádal, zmizely, a s nimi i jeho účast v ostatních.
      state.actions = await backend.actions()
      return updated
    })
    if (group) replaceGroupState(group)
  }

  /** Odchod ze skupiny, nebo její smazání zakladatelem. S ní zmizí akce, které v ní člověk pořádal. */
  async function leaveGroup(groupId: string, remove = false) {
    const done = await guarded(async () => {
      await (remove ? backend.deleteGroup(groupId) : backend.leaveGroup(groupId))
      await reload()
      return true
    })
    if (done) selectGroup(null)
  }

  async function acceptInvite() {
    const token = state.invite?.token
    if (!token) return
    const group = await guarded(async () => {
      const joined = await backend.acceptInvite(token)
      await reload()
      return joined
    })
    if (!group) return
    forgetInvite()
    selectGroup(group.id)
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

  // Pohled se přepočítá, když se změní akce nebo rozpis někoho, koho přihlášený vlastní.
  const viewKey = computed(() => {
    const resource = selectedResource.value
    if (!resource || resource.others.length === 0) return null
    const own = selectedAction.value?.people.map(({ id, sources, overrides }) => ({
      id,
      sources,
      overrides,
    }))
    return JSON.stringify([resource, own, state.status])
  })
  watch(viewKey, (key) => {
    if (key) void refreshView()
  })

  // Výběr a kroky

  function forgetReadState(personId: string) {
    delete state.readingByPersonId[personId]
    delete state.readErrorByPersonId[personId]
  }

  function forgetUnreferencedFiles() {
    const referenced = new Set(state.draft.files.map((file) => file.id))
    for (const files of Object.values(state.pendingFiles)) {
      for (const file of files) referenced.add(file.id)
    }
    // Přečtené soubory zůstávají v paměti kvůli náhledu v editoru dne.
    for (const person of state.people) {
      for (const source of person.sources) {
        for (const file of source.files) referenced.add(file.id)
      }
    }
    for (const fileId of fileBlobs.keys()) {
      if (!referenced.has(fileId)) fileBlobs.delete(fileId)
    }
  }

  function resetDraft() {
    state.draft = emptyDraft()
    forgetUnreferencedFiles()
  }

  function selectAction(actionId: string) {
    state.selectedActionId = actionId
    state.selectedGroupId = null
    state.selectedDay = null
    resetDraft()
  }

  function openAction(actionId: string, step: Step) {
    state.stepByActionId[actionId] = step
    selectAction(actionId)
  }

  function goToStep(step: Step): boolean {
    if (!state.selectedActionId) return false
    if (step === 'calendar' && calendarBlocker.value) return false
    state.stepByActionId[state.selectedActionId] = step
    return true
  }

  // Akce

  /** Založí akci, ve skupině se jí účastní všichni členové. Vrací chyby formuláře. */
  async function createNewAction(
    input: NewActionInput,
    groupId: string | null = null,
  ): Promise<NewActionErrors | null> {
    const checked = validateNewAction('nova', input)
    if (!checked.ok) return checked.errors
    const action = await guarded(() => backend.createAction(input, groupId))
    if (!action) return null
    state.actions.push(action)
    openAction(action.id, 'intake')
    return null
  }

  /** Ukázková akce se pěti lidmi se uloží do účtu jako běžná akce. */
  async function openSampleAction() {
    const before = new Set(state.actions.map((action) => action.id))
    const imported = await guarded(async () => {
      await backend.importActions([structuredClone(sampleAction)])
      await reload()
      return true
    })
    const created = state.actions.find((action) => !before.has(action.id))
    if (imported && created) openAction(created.id, 'calendar')
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
    replaceActionState(updated)
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
    replaceActionState(restored)
    state.lastActionEdit = null
    state.selectedDay = null
  }

  // Rozpracovaný člověk

  function setDraftName(name: string) {
    state.draft.name = name
  }

  function addFilesToDraft(files: File[]): string[] {
    const rejectedNames: string[] = []
    for (const file of files) {
      const kind = detectSourceFileKind(file.name, file.type)
      if (!kind) {
        rejectedNames.push(file.name)
        continue
      }
      const id = generateId()
      fileBlobs.set(id, file)
      state.draft.files.push({ id, name: file.name, kind })
    }
    return rejectedNames
  }

  function addTextToDraft(text: string) {
    addFilesToDraft([new File([text], `${PASTED_TEXT_NAME}.txt`, { type: 'text/plain' })])
  }

  function removeFileFromDraft(fileId: string) {
    state.draft.files = state.draft.files.filter((file) => file.id !== fileId)
  }

  async function saveDraft(): Promise<string | null> {
    const action = selectedAction.value
    if (!action) return 'Není vybraná žádná akce.'

    const { editingPersonId, files } = state.draft
    const name = state.draft.name.trim()
    if (!name) return 'Vyplň jméno.'

    const existing = action.people.find((person) => person.id === editingPersonId)
    if (!existing && !canEditAction.value) return 'Lidi do akce přidává jen organizátor.'
    const hasSchedule = (existing?.sources.length ?? 0) > 0 || (existing?.overrides.length ?? 0) > 0
    if (files.length === 0 && !hasSchedule) return 'Vlož aspoň jeden podklad.'

    const nameTaken = participants.value.some(
      (person) =>
        person.id !== editingPersonId && normalizedName(person.name) === normalizedName(name),
    )
    if (nameTaken) return 'Tohle jméno už v akci je.'

    if (existing) {
      if (existing.name !== name) {
        const renamed = await guarded(() => backend.renamePerson(existing.id, name))
        if (!renamed) return state.error
        replacePersonState(renamed)
      }
      // Koncept drží jen podklady čekající na přečtení. Přečtené zdroje a ruční úpravy zůstávají.
      const filesChanged =
        existing.files.length !== files.length ||
        existing.files.some((file, index) => file.id !== files[index].id)
      if (filesChanged) forgetReadState(existing.id)
      state.pendingFiles[existing.id] = [...files]
    } else {
      const added = await guarded(() => backend.addGuest(action.id, name))
      if (!added) return state.error
      state.people.push(added.person)
      replaceActionState(added.action)
      state.pendingFiles[added.person.id] = [...files]
    }
    resetDraft()
    return null
  }

  function discardDraft() {
    resetDraft()
  }

  function editPerson(personId: string) {
    if (state.readProgress) return
    const person = selectedAction.value?.people.find((candidate) => candidate.id === personId)
    if (!person) return
    state.draft = { editingPersonId: person.id, name: person.name, files: [...person.files] }
  }

  /** Z kalendáře zpět k podkladům, s člověkem připraveným k úpravě. */
  function editPersonInIntake(personId: string): boolean {
    const exists = selectedAction.value?.people.some((person) => person.id === personId)
    if (!exists || state.readProgress) return false
    editPerson(personId)
    return goToStep('intake')
  }

  /** Odebere člověka z akce. Host, který už v žádné akci není, se smaže i s rozpisem. */
  async function removeEditedPerson() {
    const personId = state.draft.editingPersonId
    const actionId = state.selectedActionId
    if (!personId || !actionId) return
    const updated = await guarded(async () => {
      const action = await backend.removeParticipant(actionId, personId)
      state.people = await backend.people()
      return action
    })
    if (!updated) return
    replaceActionState(updated)
    delete state.pendingFiles[personId]
    forgetReadState(personId)
    resetDraft()
  }

  // Rozpisy

  function selectDay(day: PersonDay | null) {
    state.selectedDay = day
  }

  /** Ruční úprava dne. Pokrývá jen ten den a nové čtení ji nepřepíše. */
  async function saveDayShifts(personId: string, date: DateString, shifts: Shift[]) {
    const person = await guarded(() => backend.setOverride(personId, date, shifts))
    if (person) replacePersonState(person)
  }

  /** Den se zase řídí podklady. */
  async function clearDayOverride(personId: string, date: DateString) {
    const person = await guarded(() => backend.deleteOverride(personId, date))
    if (person) replacePersonState(person)
  }

  async function removeSource(personId: string, sourceId: string) {
    const person = await guarded(() => backend.deleteSource(personId, sourceId))
    if (!person) return
    replacePersonState(person)
    forgetUnreferencedFiles()
  }

  async function changeSourceCircle(personId: string, sourceId: string, circle: string) {
    const person = await guarded(() => backend.updateSource(personId, sourceId, { circle }))
    if (person) replacePersonState(person)
  }

  /** Potvrzení, zda je týden s daným dnem lichý, nebo sudý. */
  async function answerWeekParity(
    personId: string,
    sourceId: string,
    date: DateString,
    odd: boolean,
  ) {
    const person = await guarded(() =>
      backend.updateSource(personId, sourceId, { weekParity: { date, odd } }),
    )
    if (person) replacePersonState(person)
  }

  async function readPerson(actionId: string, personId: string) {
    const action = actions.value.find((candidate) => candidate.id === actionId)
    const files = state.pendingFiles[personId] ?? []
    if (!action || files.length === 0) return

    state.readingByPersonId[personId] = 'reading'
    delete state.readErrorByPersonId[personId]
    try {
      const blobs = files.map((file) => fileBlobs.get(file.id))
      if (blobs.some((blob) => blob === undefined)) throw new MissingFilesError()
      // Příprava běží v prohlížeči: z Excelu jde jen viditelná část a název souboru se neposílá.
      // Modul s ExcelJS se načte až tady, ať se s ním nestahuje úvodní stránka.
      const { prepareSource } = await import('./llm/ingest')
      const parts = await Promise.all(
        files.map((file, index) => prepareSource(blobs[index]!, file.kind)),
      )
      const person = await backend.read(personId, {
        from: action.from,
        to: action.to,
        files,
        parts,
      })
      replacePersonState(person)
      delete state.pendingFiles[personId]
      state.readingByPersonId[personId] = 'done'
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) signedOut()
      state.readingByPersonId[personId] = 'error'
      state.readErrorByPersonId[personId] = readErrorMessage(error)
    }
  }

  async function readPeople(actionId: string, personIds: string[]) {
    state.readProgress = { done: 0, total: personIds.length }
    for (const personId of personIds) state.readingByPersonId[personId] = 'pending'
    try {
      // Postupně: limity modelu a přehledný průběh.
      for (const personId of personIds) {
        await readPerson(actionId, personId)
        if (state.readProgress) state.readProgress.done++
      }
    } finally {
      state.readProgress = null
    }
  }

  /** Přečte nové podklady všech lidí a otevře kalendář. Selhání jednoho ostatní nezastaví. */
  async function readSchedules() {
    const action = selectedAction.value
    if (!action || state.readProgress || calendarBlocker.value) return

    const pending = action.people.filter((person) => person.files.length > 0)
    if (pending.length > 0) {
      await readPeople(
        action.id,
        pending.map((person) => person.id),
      )
    }
    if (state.selectedActionId === action.id && state.status === 'ready') goToStep('calendar')
  }

  /** Přečte znovu jednoho člověka, krok se nemění. */
  async function retryPerson(personId: string) {
    const action = selectedAction.value
    if (!action || state.readProgress) return
    if (!action.people.some((person) => person.id === personId)) return
    await readPeople(action.id, [personId])
  }

  function fileBlob(fileId: string): File | undefined {
    return fileBlobs.get(fileId)
  }

  return {
    state,
    loginUrl: backend.loginUrl,
    actions,
    actionItems,
    selectedAction,
    selectedResource,
    selectedGroup,
    canEditAction,
    usesServerView,
    participants,
    selfPersonId,
    currentStep,
    isDraftDirty,
    calendarBlocker,
    calendar,
    composedPeople,
    stability,
    uncertainDays,
    pivotalUncertainCount,
    readingWarnings,
    proposals,
    parityQuestions,
    init,
    logout,
    deleteAccount,
    acceptLocalActions,
    dismissLocalActions,
    selectGroup,
    createGroup,
    createInvite,
    revokeInvite,
    removeMember,
    leaveGroup,
    acceptInvite,
    declineInvite,
    refreshView,
    createAction: createNewAction,
    updateAction,
    undoActionUpdate,
    openSampleAction,
    selectAction,
    goToStep,
    setDraftName,
    addFilesToDraft,
    addTextToDraft,
    removeFileFromDraft,
    saveDraft,
    discardDraft,
    editPerson,
    editPersonInIntake,
    removeEditedPerson,
    selectDay,
    saveDayShifts,
    clearDayOverride,
    removeSource,
    changeSourceCircle,
    answerWeekParity,
    readSchedules,
    retryPerson,
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
        ? memoryBackend({ user: { id: 'ukazka', email: '', name: 'Ty' } })
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
