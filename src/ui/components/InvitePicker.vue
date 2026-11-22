<script setup lang="ts">
import { computed } from 'vue'
import type { Group } from '@/contract/api'
import type { Contact } from '@/session'
import UiIcon from './UiIcon.vue'

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

/** Členové skupiny, které jde pozvat: bez mě a bez těch, kdo už pozvaní jsou. */
function membersOf(group: Group): string[] {
  return group.members
    .filter((member) => !member.isYou && !(props.excluded ?? []).includes(member.userId))
    .map((member) => member.userId)
}

/**
 * Stav skupin pro výběr: kolik členů je vybraných. Skupina je vybraná, když jsou vybraní
 * všichni, kdo jdou pozvat. Klik ji vybere celou, nebo celou odebere.
 */
const groupItems = computed(() =>
  props.groups.map((group) => {
    const members = membersOf(group)
    const chosen = members.filter((id) => selected.value.includes(id)).length
    return {
      group,
      members,
      chosen,
      total: members.length,
      all: members.length > 0 && chosen === members.length,
    }
  }),
)

function toggleGroup(item: (typeof groupItems.value)[number]) {
  selected.value = item.all
    ? selected.value.filter((id) => !item.members.includes(id))
    : [...new Set([...selected.value, ...item.members])]
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
        <button
          v-for="item in groupItems"
          :key="item.group.id"
          type="button"
          :aria-pressed="item.all"
          :disabled="item.total === 0"
          :class="[
            'flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            item.all
              ? 'border-accent bg-accent text-white hover:bg-accent-dark'
              : item.chosen > 0
                ? 'border-accent bg-accent-soft text-accent-dark hover:brightness-95'
                : 'border-dashed border-outline bg-white text-ink hover:bg-panel',
          ]"
          @click="toggleGroup(item)"
        >
          <UiIcon v-if="item.all" name="check" :size="14" />
          Celá skupina {{ item.group.name }}
          <span v-if="item.chosen > 0 && !item.all" class="text-xs font-normal">
            ({{ item.chosen }} z {{ item.total }})
          </span>
        </button>
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
