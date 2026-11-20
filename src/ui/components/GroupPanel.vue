<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Friend, Group } from '@/contract/api'
import UiButton from './UiButton.vue'

const props = defineProps<{
  group: Group
  /** Moji přátelé. Zakladatel je může přidat rovnou, bez odkazu. */
  friends: Friend[]
  /** Odkaz s pozvánkou, ukáže se jen hned po založení. */
  inviteUrl: string | null
}>()
const emit = defineEmits<{
  createInvite: []
  revokeInvite: [inviteId: string]
  addMember: [userId: string]
  removeMember: [userId: string]
  leave: []
  remove: []
  createAction: []
}>()

const confirming = ref<'leave' | 'remove' | null>(null)

/** Přátelé, kteří ve skupině ještě nejsou. */
const addableFriends = computed(() =>
  props.friends.filter(
    (friend) => !props.group.members.some((member) => member.userId === friend.userId),
  ),
)
const copied = ref(false)

const expiry = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' })

function confirm() {
  if (confirming.value === 'remove') emit('remove')
  else emit('leave')
}

function formatExpiry(iso: string): string {
  return expiry.format(new Date(iso))
}

async function copyInvite() {
  if (!props.inviteUrl) return
  try {
    await navigator.clipboard.writeText(props.inviteUrl)
    copied.value = true
  } catch {
    // Bez přístupu ke schránce zůstane odkaz vybraný v poli a jde zkopírovat ručně.
    copied.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-wrap content-start gap-8 overflow-auto px-8 py-6">
    <section aria-labelledby="group-title" class="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
      <div class="flex flex-col gap-1">
        <h1 id="group-title" class="text-2xl font-semibold tracking-tight">{{ group.name }}</h1>
        <p class="text-[15px] text-muted">
          Skupina je seznam lidí, které můžeš pozvat do akce najednou. Každý pozvánku přijme sám a
          ostatní z jeho rozvrhu uvidí jen, zda v daný den může.
        </p>
      </div>

      <div>
        <UiButton variant="primary" @click="emit('createAction')">
          Nová akce s celou skupinou
        </UiButton>
      </div>

      <div class="flex flex-col gap-2 border-t border-line pt-4">
        <template v-if="confirming === null">
          <div class="flex flex-wrap gap-2">
            <UiButton variant="danger" @click="confirming = 'leave'">Odejít ze skupiny</UiButton>
            <UiButton v-if="group.isOwner" variant="danger" @click="confirming = 'remove'">
              Smazat skupinu
            </UiButton>
          </div>
        </template>
        <div v-else role="alertdialog" aria-label="Potvrzení" class="flex flex-col gap-2">
          <p class="text-warn">
            <template v-if="confirming === 'remove'">
              Smaže se skupina. Akce i rozpisy členů zůstanou. Vrátit to nejde.
            </template>
            <template v-else>
              Akce zůstanou, jen tě ostatní nebudou moct zvát přes skupinu.
              <template v-if="group.isOwner && group.members.length > 1">
                Skupinu převezme nejdéle přítomný člen.
              </template>
              <template v-else-if="group.members.length === 1">
                Jsi poslední člen, skupina se smaže.
              </template>
            </template>
          </p>
          <div class="flex gap-2">
            <UiButton variant="danger" @click="confirm">
              {{ confirming === 'remove' ? 'Smazat' : 'Odejít' }}
            </UiButton>
            <UiButton @click="confirming = null">Nechat</UiButton>
          </div>
        </div>
      </div>
    </section>

    <aside class="flex min-w-0 max-w-sm flex-[1_1_300px] flex-col gap-5">
      <section
        aria-labelledby="members-title"
        class="flex flex-col rounded-xl border border-line bg-white p-5"
      >
        <h2 id="members-title" class="pb-2 text-base font-semibold">
          Členové: {{ group.members.length }}
        </h2>
        <ul>
          <li
            v-for="member in group.members"
            :key="member.userId"
            class="flex items-center justify-between gap-3 border-t border-line py-2"
          >
            <span>
              <span class="font-semibold">{{ member.name }}</span>
              <span v-if="member.isYou" class="text-muted"> (ty)</span>
              <span v-if="member.isOwner" class="text-muted"> · zakladatel</span>
            </span>
            <UiButton
              v-if="group.isOwner && !member.isYou"
              variant="danger"
              :aria-label="`Odebrat ze skupiny: ${member.name}`"
              @click="emit('removeMember', member.userId)"
            >
              Odebrat
            </UiButton>
          </li>
        </ul>
      </section>

      <section
        v-if="group.isOwner"
        aria-labelledby="add-friends-title"
        class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="add-friends-title" class="text-base font-semibold">Přidat z přátel</h2>
        <p v-if="friends.length === 0" class="text-muted">
          Zatím nemáš přátele. Přidáš si je na stránce Přátelé, nebo pozvi lidi odkazem níže.
        </p>
        <p v-else-if="addableFriends.length === 0" class="text-muted">
          Všichni tví přátelé už ve skupině jsou.
        </p>
        <template v-else>
          <p class="text-muted">
            Přítel se přidá hned. Ostatní členové uvidí jen jeho jméno a on může skupinu kdykoli
            opustit.
          </p>
          <ul>
            <li
              v-for="friend in addableFriends"
              :key="friend.userId"
              class="flex items-center justify-between gap-3 border-t border-line py-2"
            >
              <span class="font-semibold">{{ friend.name }}</span>
              <UiButton
                variant="ghost"
                :aria-label="`Přidat do skupiny: ${friend.name}`"
                @click="emit('addMember', friend.userId)"
              >
                Přidat
              </UiButton>
            </li>
          </ul>
        </template>
      </section>

      <section
        v-if="group.isOwner"
        aria-labelledby="invite-title"
        class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="invite-title" class="text-base font-semibold">Pozvat odkazem</h2>
        <p class="text-muted">
          Kdo odkaz dostane, může se po přihlášení přidat. Platí 7 dní a jde kdykoli zrušit.
        </p>
        <template v-if="inviteUrl">
          <label for="invite-url" class="font-medium">Odkaz s pozvánkou</label>
          <input
            id="invite-url"
            :value="inviteUrl"
            readonly
            class="field-input"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <p class="text-xs text-muted">Ukáže se jen teď. Kdo ho ztratí, vytvoř nový.</p>
          <UiButton variant="primary" @click="copyInvite">
            {{ copied ? 'Zkopírováno' : 'Zkopírovat odkaz' }}
          </UiButton>
        </template>
        <UiButton v-else variant="primary" @click="emit('createInvite')">Vytvořit odkaz</UiButton>

        <template v-if="group.invites.length > 0">
          <p class="font-medium">Platné odkazy: {{ group.invites.length }}</p>
          <ul>
            <li
              v-for="invite in group.invites"
              :key="invite.id"
              class="flex items-center justify-between gap-3 border-t border-line py-1.5"
            >
              <span class="text-muted">platí do {{ formatExpiry(invite.expiresAt) }}</span>
              <UiButton variant="danger" @click="emit('revokeInvite', invite.id)">Zrušit</UiButton>
            </li>
          </ul>
        </template>
      </section>
    </aside>
  </div>
</template>
