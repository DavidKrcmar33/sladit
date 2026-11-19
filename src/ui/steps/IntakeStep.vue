<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSession } from '@/session'
import PeoplePanel from '@/ui/components/PeoplePanel.vue'
import PersonIntake from '@/ui/components/PersonIntake.vue'
import StepFooter from '@/ui/components/StepFooter.vue'

const {
  state,
  selfPersonId,
  selectedAction,
  isDraftDirty,
  calendarBlocker,
  setDraftName,
  addFilesToDraft,
  addTextToDraft,
  removeFileFromDraft,
  saveDraft,
  discardDraft,
  editPerson,
  removeEditedPerson,
  removeSource,
  changeSourceCircle,
  readSchedules,
  retryPerson,
} = useSession()

const error = ref<string | null>(null)

const people = computed(() => selectedAction.value?.people ?? [])
const editedSources = computed(
  () => people.value.find((person) => person.id === state.draft.editingPersonId)?.sources ?? [],
)
const isReading = computed(() => state.readProgress !== null)
const actionLabel = computed(() =>
  state.readProgress
    ? `Čtu rozpisy: ${state.readProgress.done} z ${state.readProgress.total}`
    : 'Přečíst rozpisy a ukázat kalendář',
)
const summary = computed(() => {
  const fileCount = people.value.reduce(
    (sum, person) =>
      sum +
      person.files.length +
      person.sources.reduce((count, source) => count + source.files.length, 0),
    0,
  )
  return `Lidé: ${people.value.length} · Podklady: ${fileCount}`
})

function addFiles(files: File[]) {
  const rejectedNames = addFilesToDraft(files)
  error.value = rejectedNames.length
    ? `Tento formát neumíme přečíst: ${rejectedNames.join(', ')}`
    : null
}

async function save() {
  error.value = await saveDraft()
}

function withClearedError(action: () => void) {
  error.value = null
  action()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex min-h-0 flex-1 flex-wrap gap-8 overflow-auto px-8 py-5">
      <PersonIntake
        class="min-w-0 flex-[999_1_480px]"
        :draft="state.draft"
        :sources="editedSources"
        :is-dirty="isDraftDirty"
        :error="error"
        @rename="setDraftName"
        @add-files="addFiles"
        @add-text="withClearedError(() => addTextToDraft($event))"
        @remove-file="removeFileFromDraft"
        @save="save"
        @discard="withClearedError(discardDraft)"
        @remove-person="withClearedError(removeEditedPerson)"
        @remove-source="removeSource(state.draft.editingPersonId!, $event)"
      />
      <PeoplePanel
        class="max-w-sm flex-[1_1_300px]"
        :people="people"
        :self-person-id="selfPersonId"
        :editing-person-id="state.draft.editingPersonId"
        :can-edit="!isDraftDirty && !isReading"
        :read-statuses="state.readingByPersonId"
        :read-errors="state.readErrorByPersonId"
        :is-reading="isReading"
        @edit="withClearedError(() => editPerson($event))"
        @retry="retryPerson"
        @change-circle="changeSourceCircle"
      />
    </div>
    <StepFooter
      :summary="summary"
      :action-label="actionLabel"
      :blocker="calendarBlocker"
      :busy="isReading"
      @continue="readSchedules"
    />
  </div>
</template>
