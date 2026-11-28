<script setup lang="ts">
import { sectionIcons } from '@/ui/sectionIcons'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import UiIcon from '@/ui/components/UiIcon.vue'
import ActionPage from '@/ui/pages/ActionPage.vue'
import FriendsPage from '@/ui/pages/FriendsPage.vue'
import MySchedulePage from '@/ui/pages/MySchedulePage.vue'
import SettingsPage from '@/ui/pages/SettingsPage.vue'
import { pathFor, routeFromPath } from '@/ui/route'

const {
  state,
  me,
  loginUrl,
  actionItems,
  slotNotice,
  contacts,
  selectedAction,
  participants,
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
  deleteAction,
  dismissCalendarNotice,
  draftAction,
  refresh,
  openRoute,
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
const showsAction = computed(() => state.page === 'action' && selectedAction.value !== null)

/** Horní lišta na úzké obrazovce: název otevřené stránky. */
const pageTitle = computed(() => {
  // Název akce nese její hlavička hned pod lištou, nahoře by byl dvakrát.
  if (showsAction.value) return 'Akce'
  if (state.page === 'group' && selectedGroup.value) return selectedGroup.value.name
  if (state.page === 'friends') return 'Přátelé'
  if (state.page === 'settings') return 'Nastavení'
  return 'Můj rozvrh'
})
/** Mění se s každou navigací, aby se vysunutý panel po výběru zavřel. */
const navKey = computed(
  () => `${state.page}:${state.selectedActionId ?? ''}:${state.selectedGroupId ?? ''}`,
)
/** Čekající žádost nebo pozvánka: tečka na tlačítku menu. */
const menuAttention = computed(
  () =>
    state.friendRequests.incoming.length > 0 ||
    actionItems.value.some((action) => action.waitingForMe || action.slotWaiting),
)
/**
 * Nabídka převzetí starých akcí jen na úvodní stránce a jen do „Teď ne“. Potom zůstane
 * v Nastavení, aby neodsouvala obsah všech stránek.
 */
const offersLocalActions = computed(
  () => state.localActions.length > 0 && !state.localActionsDismissed && state.page === 'schedule',
)

/** Žádosti o přátelství, které čekají na mou odpověď: odznak v menu a upozornění nahoře. */
const requestCount = computed(() => {
  const count = state.friendRequests.incoming.length
  if (count === 1) return '1 žádost'
  return count < 5 ? `${count} žádosti` : `${count} žádostí`
})
const requestNotice = computed(() => {
  const incoming = state.friendRequests.incoming
  return incoming.length === 1
    ? `${incoming[0].fromName} tě chce přidat do přátel.`
    : `Máš ${requestCount.value} o přátelství.`
})

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

async function deleteEditedAction() {
  if (actionDialog.value !== 'edit' || !selectedResource.value?.isOrganizer) return
  const id = state.selectedActionId
  await deleteAction()
  if (!state.actions.some((action) => action.id === id)) actionDialog.value = null
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

// Otevřená stránka v adrese: po obnovení stránky se otevře totéž a funguje tlačítko Zpět.
// Ukázka adresu nemění (běží na ?ukazka).
const startRoute = state.demo ? null : routeFromPath(location.pathname)
const currentPath = computed(() =>
  pathFor(state.page, state.selectedActionId, state.selectedGroupId),
)
let routed = false

watch(
  () => state.status,
  (status) => {
    if (status !== 'ready' || routed || state.demo) return
    routed = true
    // Výchozí stránku (třeba Nastavení po připojení kalendáře) přepíše jen konkrétní adresa.
    if (startRoute && startRoute.page !== 'schedule') openRoute(startRoute)
    if (location.pathname !== currentPath.value) {
      history.replaceState(history.state, '', currentPath.value)
    }
  },
  { immediate: true },
)

watch(currentPath, (path) => {
  if (!routed || state.demo || location.pathname === path) return
  history.pushState(history.state, '', path)
})

function onPopState() {
  const route = routeFromPath(location.pathname)
  if (!route || !openRoute(route)) openRoute({ page: 'schedule' })
}

// Upozornění v aplikaci: jednou za minutu a po návratu do záložky se načtou nové pozvánky,
// termíny a žádosti. Ve skryté záložce se nic nestahuje.
const REFRESH_MS = 60_000
let refreshTimer: ReturnType<typeof setInterval> | undefined

function refreshIfVisible() {
  if (document.visibilityState === 'visible') void refresh()
}

onMounted(() => {
  refreshTimer = setInterval(refreshIfVisible, REFRESH_MS)
  document.addEventListener('visibilitychange', refreshIfVisible)
  window.addEventListener('popstate', onPopState)
})
onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', refreshIfVisible)
  window.removeEventListener('popstate', onPopState)
})

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
    <AppShell :title="pageTitle" :nav-key="navKey" :attention="menuAttention">
      <template #sidebar="{ collapsed, expand }">
        <nav aria-label="Moje" class="flex flex-col gap-1.5">
          <button
            type="button"
            class="sidebar-link"
            :aria-current="state.page === 'schedule' ? 'page' : undefined"
            title="Můj rozvrh"
            aria-label="Můj rozvrh"
            @click="showSchedule"
          >
            <UiIcon :name="sectionIcons.schedule" :size="18" class="shrink-0" />
            <span v-if="!collapsed">Můj rozvrh</span>
          </button>
          <button
            type="button"
            class="sidebar-link"
            :aria-current="state.page === 'friends' ? 'page' : undefined"
            title="Přátelé"
            :aria-label="
              state.friendRequests.incoming.length ? `Přátelé, ${requestCount}` : 'Přátelé'
            "
            @click="showFriends"
          >
            <UiIcon :name="sectionIcons.friends" :size="18" class="shrink-0" />
            <span v-if="!collapsed">Přátelé</span>
            <span
              v-if="state.friendRequests.incoming.length > 0"
              :class="collapsed ? 'sidebar-dot' : 'sidebar-badge ml-auto'"
            >
              {{ collapsed ? '' : requestCount }}
            </span>
          </button>
        </nav>
        <ActionList
          :collapsed="collapsed"
          :actions="actionItems"
          :selected-action-id="state.page === 'action' ? state.selectedActionId : null"
          @expand="expand"
          @select="selectAction"
          @create="openActionDialog('create')"
        />
        <GroupList
          v-if="!state.demo"
          :collapsed="collapsed"
          :groups="state.groups"
          :selected-group-id="state.page === 'group' ? state.selectedGroupId : null"
          @expand="expand"
          @select="selectGroup"
          @create="submitGroup"
        />
        <AccountBox
          :collapsed="collapsed"
          :name="me?.name ?? state.user?.name ?? ''"
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
          :confirmed="selectedResource.confirmed"
          :agreed="selectedResource.agreed"
          :participant-count="selectedResource.participantIds.length"
          :participants="participants"
          :voting="selectedResource.poll !== null"
          :is-organizer="selectedResource.isOrganizer"
          :organizer-name="selectedResource.organizerName"
          @edit="openActionDialog('edit')"
        />
      </template>

      <div
        v-if="offersLocalActions"
        role="status"
        class="mx-4 mt-4 sm:mx-6 lg:mx-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2"
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
        v-if="
          slotNotice && !(state.page === 'action' && state.selectedActionId === slotNotice.actionId)
        "
        role="status"
        class="mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-accent-soft px-4 py-2 text-accent-dark sm:mx-6 lg:mx-8"
      >
        <p>{{ slotNotice.text }}</p>
        <UiButton variant="ghost" @click="selectAction(slotNotice.actionId)">Odpovědět</UiButton>
      </div>
      <div
        v-if="state.friendRequests.incoming.length > 0 && state.page !== 'friends'"
        role="status"
        class="mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-accent-soft px-4 py-2 text-accent-dark sm:mx-6 lg:mx-8"
      >
        <p>{{ requestNotice }}</p>
        <UiButton variant="ghost" @click="showFriends">Zobrazit</UiButton>
      </div>
      <div
        v-if="state.calendarNotice"
        role="status"
        class="mx-4 mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-accent-soft px-4 py-2 text-accent-dark sm:mx-6 lg:mx-8"
      >
        <p>{{ state.calendarNotice }}</p>
        <UiButton variant="ghost" @click="dismissCalendarNotice">Zavřít</UiButton>
      </div>
      <p
        v-if="state.error"
        role="alert"
        class="mx-4 mt-4 rounded-lg bg-warn-soft sm:mx-6 lg:mx-8 px-4 py-2 font-medium text-warn"
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
      :draft="state.demo ? undefined : draftAction"
      :can-delete="actionDialog === 'edit' && selectedResource?.isOrganizer"
      :busy="Boolean(state.pending)"
      @delete="deleteEditedAction"
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
