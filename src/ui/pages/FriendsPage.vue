<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import { useSession } from '@/session'
import PageHeader from '@/ui/components/PageHeader.vue'
import UiButton from '@/ui/components/UiButton.vue'

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
const adding = ref(false)
const email = ref('')
const sending = ref(false)
const sendResult = ref<{ ok: boolean; message: string } | null>(null)
const emailInput = useTemplateRef<HTMLInputElement>('emailInput')

async function startAdding() {
  adding.value = true
  sendResult.value = null
  await nextTick()
  emailInput.value?.focus()
}

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
    class="flex h-full flex-wrap content-start gap-6 overflow-auto px-4 pb-5 sm:px-6 lg:gap-8 lg:px-8 lg:pb-6"
  >
    <PageHeader
      title="Přátelé"
      title-id="friends-title"
      subtitle="Přátele můžeš zvát do akcí. Navzájem vidíte jméno a e-mail. Z tvého rozvrhu uvidí jen, zda v daný den můžeš, tvé směny ne."
    />
    <section aria-labelledby="friends-title" class="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
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

      <p
        v-if="state.friends.length === 0"
        class="rounded-xl border border-dashed border-outline px-4 py-6 text-center text-muted"
      >
        Zatím tu nikdo není. Přidej kamaráda podle e-mailu, nebo mu pošli odkaz.
      </p>
      <ul v-else class="flex flex-col rounded-xl border border-line bg-white px-5 py-2">
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
    </section>

    <aside
      v-if="!state.demo"
      aria-labelledby="friend-add-title"
      class="flex min-w-0 flex-[1_1_300px] flex-col gap-3 self-start rounded-xl border border-line bg-white p-5 lg:max-w-sm"
    >
      <h2 id="friend-add-title" class="text-base font-semibold">Přidat přítele</h2>

      <h3 class="font-medium">Podle e-mailu</h3>
      <form v-if="adding" class="flex flex-col gap-2" @submit.prevent="sendRequest">
        <label for="friend-email" class="font-medium">E-mail kamaráda</label>
        <input
          id="friend-email"
          ref="emailInput"
          v-model="email"
          type="email"
          autocomplete="off"
          maxlength="200"
          placeholder="jmeno@example.com"
          class="field-input"
        />
        <div class="flex flex-wrap gap-2">
          <UiButton variant="primary" type="submit" :disabled="sending || !email.trim()">
            {{ sending ? 'Posílám…' : 'Poslat žádost' }}
          </UiButton>
          <UiButton @click="adding = false">Zavřít</UiButton>
        </div>
        <p class="text-xs text-muted">
          Adresát uvidí tvé jméno a e-mail, ať pozná, od koho žádost je. Kdo ještě nemá účet, uvidí
          žádost po prvním přihlášení.
        </p>
        <p
          v-if="sendResult"
          :role="sendResult.ok ? 'status' : 'alert'"
          :class="sendResult.ok ? 'text-accent-dark' : 'font-medium text-warn'"
        >
          {{ sendResult.message }}
        </p>
      </form>
      <template v-if="!adding">
        <p class="text-muted">Kamarádovi přijde žádost v aplikaci.</p>
        <UiButton @click="startAdding">Přidat přítele podle e-mailu</UiButton>
      </template>

      <h3 class="border-t border-line pt-3 font-medium">Odkazem</h3>
      <p class="text-muted">
        Pošli odkaz třeba do chatu. Až ho kamarád po přihlášení otevře a potvrdí, budete přátelé.
        Odkaz platí 7 dní a jde kdykoli zrušit.
      </p>
      <template v-if="state.lastInvite?.target === 'friends'">
        <label for="friend-url" class="font-medium">Tvůj odkaz</label>
        <input
          id="friend-url"
          :value="state.lastInvite.url"
          readonly
          class="field-input"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <p class="text-xs text-muted">Ukáže se jen teď. Kdo ho ztratí, vytvoř nový.</p>
        <UiButton variant="primary" @click="copyLink(state.lastInvite.url)">
          {{ copied ? 'Zkopírováno' : 'Zkopírovat odkaz' }}
        </UiButton>
      </template>
      <UiButton v-else variant="primary" @click="createLink">Vytvořit odkaz</UiButton>

      <template v-if="state.friendInvites.length > 0">
        <p class="font-medium">Platné odkazy: {{ state.friendInvites.length }}</p>
        <ul>
          <li
            v-for="invite in state.friendInvites"
            :key="invite.id"
            class="flex items-center justify-between gap-3 border-t border-line py-1.5"
          >
            <span class="text-muted">platí do {{ expiry.format(new Date(invite.expiresAt)) }}</span>
            <UiButton variant="danger" @click="revokeFriendInvite(invite.id)">Zrušit</UiButton>
          </li>
        </ul>
      </template>
    </aside>
  </div>
</template>
