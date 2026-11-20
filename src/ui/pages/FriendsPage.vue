<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import { useSession } from '@/session'
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
  <div class="flex h-full flex-wrap content-start gap-8 overflow-auto px-8 py-6">
    <section aria-labelledby="friends-title" class="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <h1 id="friends-title" class="text-2xl font-semibold tracking-tight">Přátelé</h1>
          <button
            v-if="!state.demo"
            type="button"
            aria-label="Přidat přítele podle e-mailu"
            title="Přidat přítele podle e-mailu"
            class="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            @click="startAdding"
          >
            <UiIcon name="plus" :size="20" />
          </button>
        </div>
        <p class="text-[15px] text-muted">
          Přátele můžeš zvát do akcí. Z tvého rozvrhu uvidí jen, zda v daný den můžeš. Tvé směny ani
          e-mail neuvidí.
        </p>
      </div>

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

      <form
        v-if="adding"
        class="flex flex-col gap-2 rounded-xl border border-line bg-white p-5"
        @submit.prevent="sendRequest"
      >
        <label for="friend-email" class="font-medium">E-mail kamaráda</label>
        <div class="flex flex-wrap gap-2">
          <input
            id="friend-email"
            ref="emailInput"
            v-model="email"
            type="email"
            autocomplete="off"
            maxlength="200"
            placeholder="jmeno@example.com"
            class="field-input min-w-0 flex-1"
          />
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

      <p
        v-if="state.friends.length === 0"
        class="rounded-xl border border-dashed border-outline px-4 py-6 text-center text-muted"
      >
        Zatím tu nikdo není. Přidej kamaráda přes + podle e-mailu, nebo mu pošli odkaz vpravo.
      </p>
      <ul v-else class="flex flex-col rounded-xl border border-line bg-white px-5 py-2">
        <li
          v-for="friend in state.friends"
          :key="friend.userId"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
        >
          <span class="font-semibold">{{ friend.name }}</span>
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
      aria-labelledby="friend-link-title"
      class="flex min-w-0 max-w-sm flex-[1_1_300px] flex-col gap-3 self-start rounded-xl border border-line bg-white p-5"
    >
      <h2 id="friend-link-title" class="text-base font-semibold">Přidat si přítele</h2>
      <p class="text-muted">
        Vytvoř odkaz a pošli ho kamarádovi. Až ho po přihlášení otevře a potvrdí, budete přátelé.
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
