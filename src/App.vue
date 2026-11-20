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
import UiButton from '@/ui/components/UiButton.vue'
import ActionPage from '@/ui/pages/ActionPage.vue'
import FriendsPage from '@/ui/pages/FriendsPage.vue'
import MySchedulePage from '@/ui/pages/MySchedulePage.vue'
import SettingsPage from '@/ui/pages/SettingsPage.vue'

const {
  state,
  loginUrl,
  actionItems,
  contacts,
  selectedAction,
  selectedResource,
  selectedGroup,
  init,
  logout,
  acceptLocalActions,
  dismissLocalActions,
  showSchedule,
  showFriends,
  showSettings,
  selectAction,
  selectGroup,
  createGroup,
  createInvite,
  revokeInvite,
  addMember,
  removeMember,
  leaveGroup,
  acceptInvite,
  declineInvite,
  createAction,
  updateAction,
  undoActionUpdate,
  deleteAction,
  dismissCalendarNotice,
} = useSession()

/** Otevřený formulář akce: nová, nebo úprava vybrané. */
const actionDialog = ref<'create' | 'edit' | null>(null)
const actionErrors = ref<NewActionErrors>({})
/** Předvybraní pozvaní ve formuláři nové akce, třeba celá skupina. */
const dialogInvitees = ref<string[]>([])

const editedDetails = computed(() =>
  actionDialog.value === 'edit' && selectedAction.value
    ? actionDetails(selectedAction.value)
    : undefined,
)
const canUndoEdit = computed(
  () => state.lastActionEdit !== null && state.lastActionEdit.actionId === state.selectedActionId,
)
const showsAction = computed(() => state.page === 'action' && selectedAction.value !== null)

function navClass(active: boolean) {
  return [
    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left font-semibold',
    active ? 'border-line bg-white' : 'border-transparent hover:bg-white/60',
  ]
}

function openActionDialog(mode: 'create' | 'edit', invitees: string[] = []) {
  actionErrors.value = {}
  dialogInvitees.value = invitees
  actionDialog.value = mode
}

function createWithGroup() {
  const members = selectedGroup.value?.members.filter((member) => !member.isYou) ?? []
  openActionDialog(
    'create',
    members.map((member) => member.userId),
  )
}

async function submitAction(input: NewActionInput, inviteUserIds: string[]) {
  const errors =
    actionDialog.value === 'edit'
      ? await updateAction(input)
      : await createAction(input, inviteUserIds)
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
        <p class="flex items-center gap-2 px-2 text-xl font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" class="size-6" />
          Sladit
        </p>
        <nav aria-label="Moje" class="flex flex-col gap-1">
          <button
            type="button"
            :class="navClass(state.page === 'schedule')"
            :aria-current="state.page === 'schedule' ? 'page' : undefined"
            @click="showSchedule"
          >
            Můj rozvrh
          </button>
          <button
            type="button"
            :class="navClass(state.page === 'friends')"
            :aria-current="state.page === 'friends' ? 'page' : undefined"
            @click="showFriends"
          >
            Přátelé
            <span class="text-xs font-normal text-muted">{{ state.friends.length }}</span>
          </button>
        </nav>
        <ActionList
          :actions="actionItems"
          :selected-action-id="state.page === 'action' ? state.selectedActionId : null"
          @select="selectAction"
          @create="openActionDialog('create')"
        />
        <GroupList
          v-if="!state.demo"
          :groups="state.groups"
          :selected-group-id="state.page === 'group' ? state.selectedGroupId : null"
          @select="selectGroup"
          @create="submitGroup"
        />
        <AccountBox
          :name="state.user?.name ?? ''"
          :email="state.user?.email ?? ''"
          :demo="state.demo"
          :settings-open="state.page === 'settings'"
          @logout="logout"
          @settings="showSettings"
        />
      </template>

      <template v-if="showsAction && selectedAction && selectedResource" #header>
        <ActionHeader
          :action="selectedAction"
          :can-undo-edit="canUndoEdit"
          :is-organizer="selectedResource.isOrganizer"
          :organizer-name="selectedResource.organizerName"
          @edit="openActionDialog('edit')"
          @undo-edit="undoActionUpdate"
          @delete="deleteAction"
        />
      </template>

      <div
        v-if="state.localActions.length > 0"
        role="status"
        class="mx-8 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2"
      >
        <p>
          V tomto prohlížeči jsou uložené akce z doby před účty ({{ state.localActions.length }}).
          Převzít je do účtu? Převezmou se jen jejich parametry, lidi pozveš znovu.
        </p>
        <div class="flex gap-2">
          <UiButton variant="primary" @click="acceptLocalActions">Převzít</UiButton>
          <UiButton @click="dismissLocalActions">Teď ne</UiButton>
        </div>
      </div>
      <div
        v-if="state.calendarNotice"
        role="status"
        class="mx-8 mt-4 flex items-center justify-between gap-3 rounded-lg bg-accent-soft px-4 py-2 text-accent-dark"
      >
        <p>{{ state.calendarNotice }}</p>
        <UiButton variant="ghost" @click="dismissCalendarNotice">Zavřít</UiButton>
      </div>
      <p
        v-if="state.error"
        role="alert"
        class="mx-8 mt-4 rounded-lg bg-warn-soft px-4 py-2 font-medium text-warn"
      >
        {{ state.error }}
      </p>

      <ActionPage v-if="showsAction" :key="state.selectedActionId ?? ''" />
      <FriendsPage v-else-if="state.page === 'friends'" />
      <SettingsPage v-else-if="state.page === 'settings'" />
      <GroupPanel
        v-else-if="state.page === 'group' && selectedGroup"
        :key="selectedGroup.id"
        :group="selectedGroup"
        :friends="state.friends"
        :invite-url="state.lastInvite?.target === selectedGroup.id ? state.lastInvite.url : null"
        @create-invite="createInvite(selectedGroup.id)"
        @revoke-invite="revokeInvite(selectedGroup.id, $event)"
        @add-member="addMember(selectedGroup.id, $event)"
        @remove-member="removeMember(selectedGroup.id, $event)"
        @leave="leaveGroup(selectedGroup.id)"
        @remove="leaveGroup(selectedGroup.id, true)"
        @create-action="createWithGroup"
      />
      <MySchedulePage v-else />
    </AppShell>

    <NewActionDialog
      v-if="actionDialog"
      :key="actionDialog"
      :errors="actionErrors"
      :initial="editedDetails"
      :contacts="contacts"
      :groups="state.groups"
      :initial-invitees="dialogInvitees"
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
