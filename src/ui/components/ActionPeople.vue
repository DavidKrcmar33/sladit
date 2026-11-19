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
}>()
const emit = defineEmits<{ invite: [userIds: string[]]; cancel: [userId: string] }>()

const STATUS_TEXT = {
  invited: 'čeká na odpověď',
  accepted: 'jde',
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
  <section
    aria-labelledby="people-title"
    class="flex flex-col gap-2 rounded-xl border border-line bg-white p-5"
  >
    <h2 id="people-title" class="text-base font-semibold">Kdo jde</h2>
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
        <span class="flex flex-col">
          <span class="font-semibold">{{ invite.name }}</span>
          <span :class="invite.status === 'accepted' ? 'text-accent-dark' : 'text-muted'">
            {{ STATUS_TEXT[invite.status] }}
          </span>
        </span>
        <UiButton
          v-if="action.isOrganizer"
          variant="ghost"
          :aria-label="`Zrušit pozvánku: ${invite.name}`"
          @click="emit('cancel', invite.userId)"
        >
          {{ invite.status === 'accepted' ? 'Odebrat' : 'Zrušit' }}
        </UiButton>
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
    </template>
  </section>
</template>
