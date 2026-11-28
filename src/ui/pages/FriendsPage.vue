<script setup lang="ts">
import { sectionIcons } from '@/ui/sectionIcons'
import { ref } from 'vue'
import { useSession } from '@/session'
import PageHeader from '@/ui/components/PageHeader.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'

const {
  state,
  createFriendInvite,
  revokeFriendInvite,
  removeFriend,
  sendFriendRequest,
  acceptFriendRequest,
  deleteFriendRequest,
} = useSession()

const copied = ref(false)
const removing = ref<string | null>(null)

// Přidání podle e-mailu: adresátovi přijde žádost v aplikaci.
const email = ref('')
const sending = ref(false)
const sendResult = ref<{ ok: boolean; message: string } | null>(null)
async function sendRequest() {
  if (!email.value.trim() || sending.value) return
  sending.value = true
  sendResult.value = await sendFriendRequest(email.value)
  sending.value = false
  if (sendResult.value.ok) email.value = ''
}

const expiry = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' })

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
  } catch {
    // Bez přístupu ke schránce zůstane odkaz v poli a jde zkopírovat ručně.
    copied.value = false
  }
}

async function createLink() {
  copied.value = false
  await createFriendInvite()
}

async function confirmRemove(userId: string) {
  await removeFriend(userId)
  removing.value = null
}
</script>

<template>
  <div
    class="flex h-full flex-col gap-6 overflow-auto px-4 pt-6 pb-5 sm:px-6 lg:gap-8 lg:px-8 lg:pb-6"
  >
    <PageHeader
      title="Přátelé"
      :placeholder-icon="sectionIcons.friends"
      title-id="friends-title"
      subtitle="Přátele můžeš zvát do akcí. Navzájem vidíte jméno a e-mail. Z tvého rozvrhu uvidí jen, zda v daný den můžeš, tvé směny ne."
    />
    <section
      v-if="state.friends.length > 0"
      aria-labelledby="friends-title"
      class="flex w-full min-w-0 max-w-3xl shrink-0 flex-col gap-4"
    >
      <ul class="action-surface flex flex-col">
        <li
          v-for="friend in state.friends"
          :key="friend.userId"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
        >
          <span class="flex min-w-0 flex-col">
            <span class="font-semibold">{{ friend.name }}</span>
            <span v-if="friend.email" class="truncate text-muted">{{ friend.email }}</span>
          </span>
          <div v-if="removing === friend.userId" class="flex items-center gap-2">
            <span class="text-warn">Odebrat z přátel?</span>
            <UiButton variant="danger" @click="confirmRemove(friend.userId)">Odebrat</UiButton>
            <UiButton @click="removing = null">Nechat</UiButton>
          </div>
          <UiButton
            v-else-if="!state.demo"
            variant="ghost"
            :aria-label="`Odebrat z přátel: ${friend.name}`"
            @click="removing = friend.userId"
          >
            Odebrat
          </UiButton>
        </li>
      </ul>
    </section>

    <section
      v-if="!state.demo"
      aria-labelledby="friend-add-title"
      class="flex w-full min-w-0 max-w-3xl shrink-0 flex-col gap-4"
    >
      <h2 id="friend-add-title" class="action-section-title">Přidat přátele</h2>
      <div class="grid min-w-0 gap-4 md:grid-cols-2">
        <form
          class="action-surface grid min-w-0 gap-4 md:row-span-5 md:grid-rows-subgrid"
          aria-labelledby="friend-email-title"
          @submit.prevent="sendRequest"
        >
          <h3
            id="friend-email-title"
            class="flex items-center gap-3 text-base font-semibold text-ink"
          >
            <UiIcon name="mail" :size="20" class="shrink-0 text-accent" />
            Přidat e-mailem
          </h3>
          <div class="flex min-w-0 flex-col gap-2">
            <label for="friend-email" class="font-medium">E-mail kamaráda</label>
            <input
              id="friend-email"
              v-model="email"
              type="email"
              autocomplete="off"
              maxlength="200"
              placeholder="jmeno@example.com"
              class="field-input"
            />
          </div>
          <p class="text-sm text-muted">
            Adresát uvidí tvé jméno a e-mail. Pokud ještě nemá účet, žádost uvidí po prvním
            přihlášení.
          </p>
          <UiButton variant="primary" type="submit" :disabled="sending || !email.trim()">
            {{ sending ? 'Posílám…' : 'Poslat žádost' }}
          </UiButton>
          <div aria-live="polite">
            <p
              v-if="sendResult"
              :role="sendResult.ok ? 'status' : 'alert'"
              :class="sendResult.ok ? 'text-accent-dark' : 'font-medium text-warn'"
            >
              {{ sendResult.message }}
            </p>
          </div>
        </form>
        <section
          aria-labelledby="friend-link-title"
          class="action-surface grid min-w-0 gap-4 md:row-span-5 md:grid-rows-subgrid"
        >
          <h3
            id="friend-link-title"
            class="flex items-center gap-3 text-base font-semibold text-ink"
          >
            <UiIcon name="link" :size="20" class="shrink-0 text-accent" />
            Pozvat odkazem
          </h3>
          <div class="flex min-w-0 flex-col gap-2">
            <template v-if="state.lastInvite?.target === 'friends'">
              <label for="friend-url" class="font-medium">Tvůj odkaz</label>
              <input
                id="friend-url"
                :value="state.lastInvite.url"
                readonly
                class="field-input"
                @focus="($event.target as HTMLInputElement).select()"
              />
            </template>
            <p v-else class="text-sm text-muted">
              Pošli odkaz do chatu. Po přihlášení a potvrzení pozvánky budete přátelé.
            </p>
          </div>
          <p class="text-sm text-muted">
            Odkaz platí 7 dní a můžeš ho kdykoli zrušit.
            <template v-if="state.lastInvite?.target === 'friends'">
              Zkopíruj si ho teď, později bude potřeba vytvořit nový.
            </template>
          </p>
          <UiButton
            v-if="state.lastInvite?.target === 'friends'"
            variant="primary"
            @click="copyLink(state.lastInvite.url)"
          >
            {{ copied ? 'Zkopírováno' : 'Zkopírovat odkaz' }}
          </UiButton>
          <UiButton v-else variant="primary" @click="createLink">Vytvořit odkaz</UiButton>
          <div>
            <template v-if="state.friendInvites.length > 0">
              <p class="font-medium">Platné odkazy: {{ state.friendInvites.length }}</p>
              <ul>
                <li
                  v-for="invite in state.friendInvites"
                  :key="invite.id"
                  class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-1.5"
                >
                  <span class="text-sm text-muted"
                    >platí do {{ expiry.format(new Date(invite.expiresAt)) }}</span
                  >
                  <UiButton variant="danger" @click="revokeFriendInvite(invite.id)"
                    >Zrušit</UiButton
                  >
                </li>
              </ul>
            </template>
          </div>
        </section>
      </div>
    </section>
    <div
      v-if="state.friendRequests.incoming.length || state.friendRequests.outgoing.length"
      class="flex w-full min-w-0 max-w-3xl shrink-0 flex-col gap-4"
    >
      <section
        v-if="state.friendRequests.incoming.length > 0"
        aria-labelledby="requests-title"
        class="flex flex-col rounded-xl border-2 border-accent bg-white px-5 py-3"
      >
        <h2 id="requests-title" class="pb-1 font-semibold">Žádosti o přátelství</h2>
        <ul>
          <li
            v-for="request in state.friendRequests.incoming"
            :key="request.id"
            class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2"
          >
            <span>
              <strong>{{ request.fromName }}</strong>
              <span class="text-muted"> ({{ request.fromEmail }})</span> tě chce přidat do přátel.
            </span>
            <span class="flex gap-2">
              <UiButton variant="primary" @click="acceptFriendRequest(request.id)">
                Přijmout
              </UiButton>
              <UiButton @click="deleteFriendRequest(request.id)">Odmítnout</UiButton>
            </span>
          </li>
        </ul>
      </section>

      <section
        v-if="state.friendRequests.outgoing.length > 0"
        aria-labelledby="sent-title"
        class="flex flex-col gap-1"
      >
        <h2 id="sent-title" class="font-semibold">Odeslané žádosti</h2>
        <ul class="flex flex-col rounded-xl border border-line bg-white px-5 py-2">
          <li
            v-for="request in state.friendRequests.outgoing"
            :key="request.id"
            class="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
          >
            <span class="min-w-0 truncate">
              {{ request.email }} <span class="text-muted">· čeká na přijetí</span>
            </span>
            <UiButton
              variant="ghost"
              :aria-label="`Zrušit žádost: ${request.email}`"
              @click="deleteFriendRequest(request.id)"
            >
              Zrušit
            </UiButton>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
