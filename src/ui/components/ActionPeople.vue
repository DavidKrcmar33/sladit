<script setup lang="ts">
import { ref } from 'vue'
import type { ActionResource, Group } from '@/contract/api'
import type { Contact } from '@/session'
import InvitePicker from './InvitePicker.vue'
import UiButton from './UiButton.vue'

const props = defineProps<{
  action: ActionResource
  contacts: Contact[]
  groups: Group[]
  /** Právě vytvořený odkaz do akce. Ukáže se jen teď. */
  linkUrl?: string | null
  /** Odkazy, nezbytní lidé a prosby jdou jen s účtem, v ukázce ne. */
  canLink?: boolean
}>()
const emit = defineEmits<{
  invite: [userIds: string[]]
  cancel: [userId: string]
  createLink: []
  revokeLink: [linkId: string]
  setRequired: [userId: string, required: boolean]
  remind: [userId: string]
}>()

/** Komu jsem už v této návštěvě poslal prosbu o rozpis (tlačítko pak ukáže „Posláno“). */
const reminded = ref<string[]>([])

function remind(userId: string) {
  reminded.value = [...reminded.value, userId]
  emit('remind', userId)
}

const copied = ref(false)
const canShare = typeof navigator !== 'undefined' && 'share' in navigator
const expiry = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' })

function formatExpiry(iso: string): string {
  return expiry.format(new Date(iso))
}

async function copyLink() {
  if (!props.linkUrl) return
  try {
    await navigator.clipboard.writeText(props.linkUrl)
    copied.value = true
  } catch {
    // Bez přístupu ke schránce zůstane odkaz v poli a jde zkopírovat ručně.
    copied.value = false
  }
}

/** Na telefonu nabídka sdílení (WhatsApp, Messenger…), jinak se odkaz zkopíruje. */
async function shareLink() {
  if (!props.linkUrl) return
  try {
    await navigator.share({
      title: props.action.details.name,
      text: `Přidej se k akci ${props.action.details.name}, ať najdeme termín:`,
      url: props.linkUrl,
    })
  } catch {
    // Zavřené sdílení není chyba.
  }
}

const STATUS_TEXT = {
  // Jestli jde na navržený termín, ukazuje pruh s termínem. Tady jen pozvánka.
  invited: 'pozvánka čeká',
  accepted: 'v akci',
  declined: 'odmítnuto',
} as const

const picking = ref(false)
const selected = ref<string[]>([])

function sendInvites() {
  emit('invite', selected.value)
  selected.value = []
  picking.value = false
}

function invitedIds(): string[] {
  return props.action.invites
    .filter((invite) => invite.status !== 'declined')
    .map((invite) => invite.userId)
}
</script>

<template>
  <section aria-labelledby="people-title" class="flex min-w-0 flex-col gap-4">
    <h2 id="people-title" class="action-section-title">Účastníci</h2>
    <div class="flex min-w-0 flex-col gap-2 action-surface">
      <ul>
        <li class="flex items-center justify-between gap-3 border-t border-line py-2">
          <span class="font-semibold">{{ action.organizerName }}</span>
          <span class="text-muted">pořádá</span>
        </li>
        <li
          v-for="invite in action.invites"
          :key="invite.userId"
          class="flex items-center justify-between gap-3 border-t border-line py-2"
        >
          <span class="flex min-w-0 flex-col">
            <span class="font-semibold">
              {{ invite.name }}
              <span v-if="invite.required" class="text-xs font-medium text-accent-dark">
                · nezbytný
              </span>
            </span>
            <span :class="invite.status === 'accepted' ? 'text-accent-dark' : 'text-muted'">
              {{ STATUS_TEXT[invite.status] }}
              <template v-if="invite.status === 'accepted' && !invite.hasSchedule">
                · <span class="text-warn">bez rozpisu</span>
              </template>
            </span>
          </span>
          <div v-if="action.isOrganizer" class="flex flex-wrap justify-end gap-1">
            <UiButton
              v-if="canLink && invite.status === 'accepted' && !invite.hasSchedule"
              variant="ghost"
              :disabled="reminded.includes(invite.userId)"
              :aria-label="`Poprosit o rozpis: ${invite.name}`"
              @click="remind(invite.userId)"
            >
              {{ reminded.includes(invite.userId) ? 'Posláno' : 'Poprosit o rozpis' }}
            </UiButton>
            <UiButton
              v-if="canLink && invite.status !== 'declined'"
              variant="ghost"
              :aria-pressed="invite.required"
              :aria-label="`Nezbytný: ${invite.name}`"
              :title="
                invite.required
                  ? 'Bez něj se termín nenavrhne. Klikni pro zrušení.'
                  : 'Označit jako nezbytného: bez něj se termín nenavrhne.'
              "
              @click="emit('setRequired', invite.userId, !invite.required)"
            >
              {{ invite.required ? 'Nezbytný ✓' : 'Nezbytný?' }}
            </UiButton>
            <UiButton
              variant="ghost"
              :aria-label="`Zrušit pozvánku: ${invite.name}`"
              @click="emit('cancel', invite.userId)"
            >
              {{ invite.status === 'accepted' ? 'Odebrat' : 'Zrušit' }}
            </UiButton>
          </div>
        </li>
      </ul>
      <p v-if="action.invites.length === 0" class="text-muted">Zatím nikdo pozvaný není.</p>

      <template v-if="action.isOrganizer">
        <div v-if="picking" class="flex flex-col gap-3 border-t border-line pt-3">
          <InvitePicker
            v-model="selected"
            :contacts="contacts"
            :groups="groups"
            :excluded="invitedIds()"
          />
          <div class="flex gap-2">
            <UiButton variant="primary" :disabled="selected.length === 0" @click="sendInvites">
              Pozvat
            </UiButton>
            <UiButton @click="picking = false">Zrušit</UiButton>
          </div>
        </div>
        <UiButton v-else variant="dashed" @click="picking = true">Pozvat další</UiButton>

        <div v-if="canLink" class="flex flex-col gap-2 border-t border-line pt-3">
          <h3 class="font-medium">Pozvat odkazem</h3>
          <p class="text-muted">
            Pošli odkaz třeba do skupinového chatu. Kdo ho otevře a přijme, bude tvůj přítel a
            rovnou účastník akce. Platí 7 dní.
          </p>
          <template v-if="linkUrl">
            <label for="action-link" class="font-medium">Odkaz do akce</label>
            <input
              id="action-link"
              :value="linkUrl"
              readonly
              class="field-input"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <p class="text-xs text-muted">Ukáže se jen teď. Kdo ho ztratí, vytvoř nový.</p>
            <div class="flex flex-wrap gap-2">
              <UiButton variant="primary" @click="copyLink">
                {{ copied ? 'Zkopírováno' : 'Zkopírovat odkaz' }}
              </UiButton>
              <UiButton v-if="canShare" @click="shareLink">Sdílet</UiButton>
            </div>
          </template>
          <UiButton v-else variant="primary" @click="emit('createLink')"
            >Vytvořit odkaz do akce</UiButton
          >
          <ul v-if="action.links.length > 0">
            <li
              v-for="link in action.links"
              :key="link.id"
              class="flex items-center justify-between gap-3 border-t border-line py-1.5"
            >
              <span class="text-muted">odkaz platí do {{ formatExpiry(link.expiresAt) }}</span>
              <UiButton
                variant="danger"
                :aria-label="`Zrušit odkaz platný do ${formatExpiry(link.expiresAt)}`"
                @click="emit('revokeLink', link.id)"
              >
                Zrušit
              </UiButton>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
