<script setup lang="ts">
import { ref } from 'vue'
import type { Group } from '@/contract/api'
import { formatDateRange } from '@/ui/format'
import UiButton from './UiButton.vue'

const props = defineProps<{
  group: Group
  actions: { id: string; name: string; from: string; to: string; peopleCount: number }[]
  /** Odkaz s pozvánkou, ukáže se jen hned po založení. */
  inviteUrl: string | null
}>()
const emit = defineEmits<{
  createInvite: []
  revokeInvite: [inviteId: string]
  removeMember: [userId: string]
  leave: []
  remove: []
  openAction: [actionId: string]
  createAction: []
}>()

const confirming = ref<'leave' | 'remove' | null>(null)
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
          Akce ve skupině vidí všichni členové. U ostatních uvidíš jen, zda v daný den můžou,
          nemůžou, nebo to nevíme. Jejich směny ani rozvrh nikdo jiný nevidí.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold">Akce</h2>
          <UiButton variant="dashed" @click="emit('createAction')">Nová akce ve skupině</UiButton>
        </div>
        <p v-if="actions.length === 0" class="text-muted">Ve skupině zatím není žádná akce.</p>
        <ul v-else class="flex flex-col gap-1">
          <li v-for="action in actions" :key="action.id">
            <button
              type="button"
              class="flex w-full flex-col gap-0.5 rounded-lg border border-line bg-white px-3 py-2 text-left hover:bg-panel"
              @click="emit('openAction', action.id)"
            >
              <span class="font-semibold">{{ action.name }}</span>
              <span class="text-xs text-muted">
                {{ formatDateRange(action.from, action.to) }} · Lidé: {{ action.peopleCount }}
              </span>
            </button>
          </li>
        </ul>
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
              Smaže se skupina i všechny její akce. Rozpisy členů zůstanou. Vrátit to nejde.
            </template>
            <template v-else>
              Akce, které ve skupině pořádáš, se smažou.
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
