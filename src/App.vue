<script setup lang="ts">
import { computed, ref } from 'vue'
import { actionDetails, type NewActionErrors, type NewActionInput } from '@/core/newAction'
import { useSession } from '@/session'
import AccountBox from '@/ui/components/AccountBox.vue'
import ActionHeader from '@/ui/components/ActionHeader.vue'
import ActionList from '@/ui/components/ActionList.vue'
import AppShell from '@/ui/components/AppShell.vue'
import GroupList from '@/ui/components/GroupList.vue'
import GroupPanel from '@/ui/components/GroupPanel.vue'
import InviteDialog from '@/ui/components/InviteDialog.vue'
import LoginScreen from '@/ui/components/LoginScreen.vue'
import NewActionDialog from '@/ui/components/NewActionDialog.vue'
import NoActionState from '@/ui/components/NoActionState.vue'
import UiButton from '@/ui/components/UiButton.vue'
import CalendarStep from '@/ui/steps/CalendarStep.vue'
import IntakeStep from '@/ui/steps/IntakeStep.vue'

const {
  state,
  loginUrl,
  actionItems,
  selectedAction,
  selectedResource,
  selectedGroup,
  currentStep,
  calendarBlocker,
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
  createAction,
  updateAction,
  undoActionUpdate,
  openSampleAction,
  selectAction,
  goToStep,
} = useSession()

/** Otevřený formulář akce: nová, nebo úprava vybrané. */
const actionDialog = ref<'create' | 'edit' | null>(null)
const actionErrors = ref<NewActionErrors>({})
/** Skupina předvyplněná ve formuláři nové akce. */
const dialogGroupId = ref<string | null>(null)

const editedDetails = computed(() =>
  actionDialog.value === 'edit' && selectedAction.value
    ? actionDetails(selectedAction.value)
    : undefined,
)
const canUndoEdit = computed(
  () => state.lastActionEdit !== null && state.lastActionEdit.actionId === state.selectedActionId,
)
const selectedGroupName = computed(
  () => state.groups.find((group) => group.id === selectedResource.value?.groupId)?.name ?? null,
)
const groupActions = computed(() =>
  actionItems.value.filter(
    (item) =>
      state.actions.find((action) => action.id === item.id)?.groupId === state.selectedGroupId,
  ),
)

function openActionDialog(mode: 'create' | 'edit', groupId: string | null = null) {
  actionErrors.value = {}
  dialogGroupId.value = groupId
  actionDialog.value = mode
}

async function submitAction(input: NewActionInput, groupId: string | null) {
  const errors =
    actionDialog.value === 'edit' ? await updateAction(input) : await createAction(input, groupId)
  if (errors) {
    actionErrors.value = errors
  } else {
    actionDialog.value = null
  }
}

async function submitGroup(name: string) {
  const error = await createGroup(name)
  if (error) state.error = error
}
</script>

<template>
  <div
    v-if="state.status === 'loading'"
    class="flex min-h-screen items-center justify-center text-muted"
  >
    Načítám…
  </div>

  <LoginScreen
    v-else-if="state.status === 'signedOut'"
    :login-url="loginUrl"
    :fake-google="state.fakeGoogle"
    :has-invite="state.invite !== null"
  />

  <main
    v-else-if="state.status === 'failed'"
    class="flex min-h-screen flex-col items-center justify-center gap-3 text-sm"
  >
    <p role="alert" class="font-medium text-warn">{{ state.error }}</p>
    <UiButton @click="init">Zkusit znovu</UiButton>
  </main>

  <template v-else>
    <AppShell>
      <template #sidebar>
        <p class="px-2 text-xl font-semibold tracking-tight">Sladit</p>
        <ActionList
          :actions="actionItems"
          :selected-action-id="state.selectedGroupId ? null : state.selectedActionId"
          @select="selectAction"
          @create="openActionDialog('create')"
        />
        <GroupList
          v-if="!state.demo"
          :groups="state.groups"
          :selected-group-id="state.selectedGroupId"
          @select="selectGroup"
          @create="submitGroup"
        />
        <AccountBox
          :name="state.user?.name ?? ''"
          :email="state.user?.email ?? ''"
          :demo="state.demo"
          @logout="logout"
          @delete-account="deleteAccount"
        />
      </template>

      <template v-if="selectedAction && !selectedGroup" #header>
        <ActionHeader
          :action="selectedAction"
          :current-step="currentStep"
          :calendar-blocker="calendarBlocker"
          :can-undo-edit="canUndoEdit"
          :is-organizer="selectedResource?.isOrganizer ?? true"
          :organizer-name="selectedResource?.organizerName ?? ''"
          :group-name="selectedGroupName"
          @navigate="goToStep"
          @edit="openActionDialog('edit')"
          @undo-edit="undoActionUpdate"
        />
      </template>

      <div
        v-if="state.localActions.length > 0"
        role="status"
        class="mx-8 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2"
      >
        <p>
          V tomto prohlížeči jsou uložené akce z doby před účty ({{ state.localActions.length }}).
          Převzít je do účtu?
        </p>
        <div class="flex gap-2">
          <UiButton variant="primary" @click="acceptLocalActions">Převzít</UiButton>
          <UiButton @click="dismissLocalActions">Teď ne</UiButton>
        </div>
      </div>
      <p
        v-if="state.error"
        role="alert"
        class="mx-8 mt-4 rounded-lg bg-warn-soft px-4 py-2 font-medium text-warn"
      >
        {{ state.error }}
      </p>

      <GroupPanel
        v-if="selectedGroup"
        :key="selectedGroup.id"
        :group="selectedGroup"
        :actions="groupActions"
        :invite-url="state.lastInvite?.groupId === selectedGroup.id ? state.lastInvite.url : null"
        @create-invite="createInvite(selectedGroup.id)"
        @revoke-invite="revokeInvite(selectedGroup.id, $event)"
        @remove-member="removeMember(selectedGroup.id, $event)"
        @leave="leaveGroup(selectedGroup.id)"
        @remove="leaveGroup(selectedGroup.id, true)"
        @open-action="selectAction"
        @create-action="openActionDialog('create', selectedGroup.id)"
      />
      <IntakeStep v-else-if="selectedAction && currentStep === 'intake'" />
      <CalendarStep v-else-if="selectedAction" />
      <NoActionState v-else @create="openActionDialog('create')" @open-sample="openSampleAction" />
    </AppShell>

    <NewActionDialog
      v-if="actionDialog"
      :key="actionDialog"
      :errors="actionErrors"
      :initial="editedDetails"
      :groups="state.groups"
      :initial-group-id="dialogGroupId"
      @submit="submitAction"
      @close="actionDialog = null"
    />

    <InviteDialog
      v-if="state.invite"
      :invite="state.invite"
      @accept="acceptInvite"
      @decline="declineInvite"
    />
  </template>
</template>
