import { computed, reactive } from 'vue'
import { BackendError, type Backend } from './client/backend'
import { httpBackend } from './client/http'
import { memoryBackend } from './client/memory'
import type { ActionResource, OwnedPerson, User } from './contract/api'
import {
  buildCalendar,
  findReadingWarnings,
  findUncertainDays,
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
import { addDays } from './core/time'

export type { Step }

/**
 * Stav aplikace v prohlížeči. Zdrojem pravdy je server (účet uživatele), tady je jeho kopie
 * a to, co na server nepatří: rozpracovaný člověk, vložené a ještě nepřečtené soubory, výběr.
 */

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>

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
}

export function createSession(options: SessionOptions) {
  const { backend } = options
  const generateId = options.generateId ?? (() => crypto.randomUUID())
  const storage = options.storage ?? null

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
    if ((selectedAction.value?.people.length ?? 0) < MIN_PEOPLE_FOR_CALENDAR) {
      return 'Přidej aspoň dva lidi.'
    }
    return null
  })

  /** Rozpisy lidí složené ze zdrojů a ručních úprav pro období vybrané akce. */
  const composedPeople = computed(() =>
    selectedAction.value ? composePeople(selectedAction.value) : [],
  )

  const calendar = computed(() =>
    selectedAction.value ? buildCalendar(selectedAction.value, composedPeople.value) : null,
  )

  /** Zda se nejlepší termín může změnit a na čích datech to stojí. */
  const stability = computed(() =>
    selectedAction.value ? analyzeStability(selectedAction.value, composedPeople.value) : null,
  )

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

  const proposals = computed(() =>
    selectedAction.value ? findProposals(selectedAction.value, composedPeople.value) : [],
  )

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
    fileBlobs.clear()
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
    const [people, loaded] = await Promise.all([backend.people(), backend.actions()])
    state.people = people
    state.actions = loaded
    if (!loaded.some((action) => action.id === state.selectedActionId)) {
      state.selectedActionId = loaded[0]?.id ?? null
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

  async function createNewAction(input: NewActionInput): Promise<NewActionErrors | null> {
    const checked = validateNewAction('nova', input)
    if (!checked.ok) return checked.errors
    const action = await guarded(() => backend.createAction(input))
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
    const hasSchedule = (existing?.sources.length ?? 0) > 0 || (existing?.overrides.length ?? 0) > 0
    if (files.length === 0 && !hasSchedule) return 'Vlož aspoň jeden podklad.'

    const nameTaken = action.people.some(
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
    selectedAction,
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

export function useSession(): Session {
  if (!session) {
    const demo = isDemo()
    session = createSession({
      backend: demo
        ? memoryBackend({ user: { id: 'ukazka', email: '', name: 'Ty' } })
        : httpBackend(),
      storage: typeof localStorage === 'undefined' ? null : localStorage,
      demo,
    })
    void session.init()
  }
  return session
}
