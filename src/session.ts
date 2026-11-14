import { computed, reactive } from 'vue'
import { addPerson, removePerson, replacePerson, setShiftsForDay } from './core/actionEdits'
import { buildCalendar, findUncertainDays, type PersonDay } from './core/calendar'
import { sampleAction } from './core/fixtures'
import { createAction, type NewActionErrors, type NewActionInput } from './core/newAction'
import type { Action, DateString, Proposal, Shift, SourceFile } from './core/schema'
import { detectSourceFileKind } from './core/sourceFile'

export type Step = 'intake' | 'calendar'

export interface PersonDraft {
  editingPersonId: string | null
  name: string
  files: SourceFile[]
}

const MIN_PEOPLE_FOR_CALENDAR = 2
const PASTED_TEXT_NAME = 'Vložený text'

function emptyDraft(): PersonDraft {
  return { editingPersonId: null, name: '', files: [] }
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase('cs')
}

export function createSession(generateId: () => string = () => crypto.randomUUID()) {
  const state = reactive({
    actions: [] as Action[],
    selectedActionId: null as string | null,
    stepByActionId: {} as Record<string, Step>,
    draft: emptyDraft(),
    selectedDay: null as PersonDay | null,
  })

  // Obsah souborů drží jen paměť: do stavu nepatří a neukládá se.
  const fileBlobs = new Map<string, File>()

  const selectedAction = computed(
    () => state.actions.find((action) => action.id === state.selectedActionId) ?? null,
  )

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

  const calendar = computed(() =>
    selectedAction.value ? buildCalendar(selectedAction.value) : null,
  )

  const uncertainDays = computed(() =>
    selectedAction.value ? findUncertainDays(selectedAction.value) : [],
  )

  // Zatím prázdné: návrhy doplní výpočet termínů.
  const proposals = computed<Proposal[]>(() => [])

  function updateSelectedAction(update: (action: Action) => Action) {
    const index = state.actions.findIndex((action) => action.id === state.selectedActionId)
    if (index === -1) throw new Error('No action is selected')
    state.actions[index] = update(state.actions[index])
  }

  function forgetUnreferencedFiles() {
    const referenced = new Set(state.draft.files.map((file) => file.id))
    for (const action of state.actions) {
      for (const person of action.people) {
        for (const file of person.files) referenced.add(file.id)
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

  function openAction(action: Action, step: Step) {
    state.actions.push(action)
    state.stepByActionId[action.id] = step
    selectAction(action.id)
  }

  function createNewAction(input: NewActionInput): NewActionErrors | null {
    const result = createAction(generateId(), input)
    if (!result.ok) return result.errors
    openAction(result.action, 'intake')
    return null
  }

  function openSampleAction() {
    openAction({ ...structuredClone(sampleAction), id: generateId() }, 'calendar')
  }

  function selectAction(actionId: string) {
    state.selectedActionId = actionId
    state.selectedDay = null
    resetDraft()
  }

  function goToStep(step: Step): boolean {
    if (!state.selectedActionId) return false
    if (step === 'calendar' && calendarBlocker.value) return false
    state.stepByActionId[state.selectedActionId] = step
    return true
  }

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

  function saveDraft(): string | null {
    const action = selectedAction.value
    if (!action) return 'Není vybraná žádná akce.'

    const { editingPersonId, files } = state.draft
    const name = state.draft.name.trim()
    if (!name) return 'Vyplň jméno.'
    if (files.length === 0) return 'Vlož aspoň jeden podklad.'

    const nameTaken = action.people.some(
      (person) =>
        person.id !== editingPersonId && normalizedName(person.name) === normalizedName(name),
    )
    if (nameTaken) return 'Tohle jméno už v akci je.'

    const existing = action.people.find((person) => person.id === editingPersonId)
    updateSelectedAction((current) =>
      existing
        ? replacePerson(current, { ...existing, name, files: [...files] })
        : addPerson(current, { id: generateId(), name, files: [...files], schedule: null }),
    )
    resetDraft()
    return null
  }

  function discardDraft() {
    resetDraft()
  }

  function editPerson(personId: string) {
    const person = selectedAction.value?.people.find((candidate) => candidate.id === personId)
    if (!person) return
    state.draft = { editingPersonId: person.id, name: person.name, files: [...person.files] }
  }

  function removeEditedPerson() {
    const personId = state.draft.editingPersonId
    if (!personId) return
    updateSelectedAction((action) => removePerson(action, personId))
    resetDraft()
  }

  function selectDay(day: PersonDay | null) {
    state.selectedDay = day
  }

  function saveDayShifts(personId: string, date: DateString, shifts: Shift[]) {
    updateSelectedAction((action) => setShiftsForDay(action, personId, date, shifts))
  }

  function fileBlob(fileId: string): File | undefined {
    return fileBlobs.get(fileId)
  }

  return {
    state,
    selectedAction,
    currentStep,
    isDraftDirty,
    calendarBlocker,
    calendar,
    uncertainDays,
    proposals,
    createAction: createNewAction,
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
    removeEditedPerson,
    selectDay,
    saveDayShifts,
    fileBlob,
  }
}

export type Session = ReturnType<typeof createSession>

let session: Session | null = null

export function useSession(): Session {
  session ??= createSession()
  return session
}
