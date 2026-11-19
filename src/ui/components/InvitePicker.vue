<script setup lang="ts">
import { computed } from 'vue'
import type { Group } from '@/contract/api'
import type { Contact } from '@/session'
import UiButton from './UiButton.vue'

/** Výběr, koho pozvat: přátelé a lidé z mých skupin. Skupinu jde přidat celou najednou. */
const props = defineProps<{
  contacts: Contact[]
  groups: Group[]
  /** Kdo už pozvaný je, ti se nenabízejí. */
  excluded?: string[]
}>()
const selected = defineModel<string[]>({ required: true })

const available = computed(() =>
  props.contacts.filter((contact) => !(props.excluded ?? []).includes(contact.userId)),
)

function toggle(userId: string, checked: boolean) {
  selected.value = checked
    ? [...new Set([...selected.value, userId])]
    : selected.value.filter((id) => id !== userId)
}

function addGroup(group: Group) {
  const members = group.members
    .filter((member) => !member.isYou && !(props.excluded ?? []).includes(member.userId))
    .map((member) => member.userId)
  selected.value = [...new Set([...selected.value, ...members])]
}

function describe(contact: Contact): string {
  return [contact.isFriend ? 'přítel' : '', ...contact.groupNames].filter(Boolean).join(', ')
}
</script>

<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="mb-1.5 font-medium">Koho pozvat</legend>
    <p v-if="available.length === 0" class="text-muted">
      Zatím nemáš koho pozvat. Přidej si přátele odkazem na stránce Přátelé, nebo založ skupinu.
    </p>
    <template v-else>
      <div v-if="groups.length > 0" class="flex flex-wrap gap-2">
        <UiButton v-for="group in groups" :key="group.id" variant="dashed" @click="addGroup(group)">
          Celá skupina {{ group.name }}
        </UiButton>
      </div>
      <ul class="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-line">
        <li
          v-for="contact in available"
          :key="contact.userId"
          class="border-b border-line last:border-b-0"
        >
          <label class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-panel">
            <input
              type="checkbox"
              :checked="selected.includes(contact.userId)"
              @change="toggle(contact.userId, ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex flex-col">
              <span class="font-medium">{{ contact.name }}</span>
              <span class="text-xs text-muted">{{ describe(contact) }}</span>
            </span>
          </label>
        </li>
      </ul>
      <p class="text-xs text-muted">
        Do termínu se pozvaný započítá, až pozvánku přijme. Vybráno: {{ selected.length }}
      </p>
    </template>
  </fieldset>
</template>
