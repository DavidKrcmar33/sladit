<script setup lang="ts">
import { ref } from 'vue'
import type { NewActionErrors, NewActionInput } from '@/core/newAction'
import { useSession } from '@/session'
import ActionHeader from '@/ui/components/ActionHeader.vue'
import ActionList from '@/ui/components/ActionList.vue'
import AppShell from '@/ui/components/AppShell.vue'
import NewActionDialog from '@/ui/components/NewActionDialog.vue'
import NoActionState from '@/ui/components/NoActionState.vue'
import CalendarStep from '@/ui/steps/CalendarStep.vue'
import IntakeStep from '@/ui/steps/IntakeStep.vue'

const {
  state,
  selectedAction,
  currentStep,
  calendarBlocker,
  createAction,
  openSampleAction,
  selectAction,
  goToStep,
} = useSession()

const isCreatingAction = ref(false)
const newActionErrors = ref<NewActionErrors>({})

function openNewActionDialog() {
  newActionErrors.value = {}
  isCreatingAction.value = true
}

function submitNewAction(input: NewActionInput) {
  const errors = createAction(input)
  if (errors) {
    newActionErrors.value = errors
  } else {
    isCreatingAction.value = false
  }
}
</script>

<template>
  <AppShell>
    <template #sidebar>
      <p class="px-2 text-xl font-semibold tracking-tight">Sladit</p>
      <ActionList
        :actions="state.actions"
        :selected-action-id="state.selectedActionId"
        @select="selectAction"
        @create="openNewActionDialog"
      />
    </template>

    <template v-if="selectedAction" #header>
      <ActionHeader
        :action="selectedAction"
        :current-step="currentStep"
        :calendar-blocker="calendarBlocker"
        @navigate="goToStep"
      />
    </template>

    <IntakeStep v-if="selectedAction && currentStep === 'intake'" />
    <CalendarStep v-else-if="selectedAction" />
    <NoActionState v-else @create="openNewActionDialog" @open-sample="openSampleAction" />
  </AppShell>

  <NewActionDialog
    v-if="isCreatingAction"
    :errors="newActionErrors"
    @submit="submitNewAction"
    @close="isCreatingAction = false"
  />
</template>
