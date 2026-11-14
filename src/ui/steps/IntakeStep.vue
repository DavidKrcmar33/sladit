<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSession } from '@/session'
import PeoplePanel from '@/ui/components/PeoplePanel.vue'
import PersonIntake from '@/ui/components/PersonIntake.vue'
import StepFooter from '@/ui/components/StepFooter.vue'

const {
  state,
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
  goToStep,
} = useSession()

const error = ref<string | null>(null)

const people = computed(() => selectedAction.value?.people ?? [])
const summary = computed(() => {
  const fileCount = people.value.reduce((sum, person) => sum + person.files.length, 0)
  return `Lidé: ${people.value.length} · Podklady: ${fileCount}`
})

function addFiles(files: File[]) {
  const rejectedNames = addFilesToDraft(files)
  error.value = rejectedNames.length
    ? `Tento formát neumíme přečíst: ${rejectedNames.join(', ')}`
    : null
}

function save() {
  error.value = saveDraft()
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
        :is-dirty="isDraftDirty"
        :error="error"
        @rename="setDraftName"
        @add-files="addFiles"
        @add-text="withClearedError(() => addTextToDraft($event))"
        @remove-file="removeFileFromDraft"
        @save="save"
        @discard="withClearedError(discardDraft)"
        @remove-person="withClearedError(removeEditedPerson)"
      />
      <PeoplePanel
        class="max-w-sm flex-[1_1_300px]"
        :people="people"
        :editing-person-id="state.draft.editingPersonId"
        :can-edit="!isDraftDirty"
        @edit="withClearedError(() => editPerson($event))"
      />
    </div>
    <StepFooter
      :summary="summary"
      action-label="Přečíst rozpisy a ukázat kalendář"
      :blocker="calendarBlocker"
      @continue="goToStep('calendar')"
    />
  </div>
</template>
