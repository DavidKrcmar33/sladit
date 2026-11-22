<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
 * Skupiny, na které člověk klikl. Vybraná je jen skupina, kterou zvolil, ne každá, jejíž
 * členové náhodou vybraní jsou (menší skupina uvnitř větší se tak neoznačí s ní).
 */
const chosenGroups = ref<Set<string>>(initialGroups())

/**
 * Předvybraní (třeba „Nová akce s celou skupinou“): označí se skupiny, které výběr celé
 * pokrývá, ale jen ty největší. Skupina uvnitř jiné pokryté skupiny se neoznačí.
 */
function initialGroups(): Set<string> {
  const covered = props.groups.filter((group) => {
    const members = membersOf(group)
    return members.length > 0 && members.every((id) => selected.value.includes(id))
  })
  const inside = (small: Group, big: Group) =>
    small.id !== big.id &&
    membersOf(small).length < membersOf(big).length &&
    membersOf(small).every((id) => membersOf(big).includes(id))
  return new Set(
    covered
      .filter((group) => !covered.some((other) => inside(group, other)))
      .map((group) => group.id),
  )
}

// Skupina, ze které člověk ručně odebral všechny, už zvolená není.
watch(selected, (ids) => {
  const left = [...chosenGroups.value].filter((groupId) => {
    const group = props.groups.find((candidate) => candidate.id === groupId)
    return group !== undefined && membersOf(group).some((id) => ids.includes(id))
  })
  if (left.length !== chosenGroups.value.size) chosenGroups.value = new Set(left)
})

/** Stav skupin pro výběr. U zvolené skupiny, ze které někdo ubyl, je vidět kolik zbývá. */
const groupItems = computed(() =>
  props.groups.map((group) => {
    const members = membersOf(group)
    const chosen = members.filter((id) => selected.value.includes(id)).length
    const picked = chosenGroups.value.has(group.id)
    return {
      group,
      members,
      chosen,
      total: members.length,
      picked,
      all: picked && members.length > 0 && chosen === members.length,
    }
  }),
)

/**
 * Klik na skupinu: vybere všechny její členy, nebo je odebere. Kdo patří i do jiné zvolené
 * skupiny, ten zůstane vybraný.
 */
function toggleGroup(item: (typeof groupItems.value)[number]) {
  const next = new Set(chosenGroups.value)
  if (item.picked) {
    next.delete(item.group.id)
    const keep = new Set(
      groupItems.value
        .filter((other) => other.group.id !== item.group.id && next.has(other.group.id))
        .flatMap((other) => other.members),
    )
    selected.value = selected.value.filter((id) => !item.members.includes(id) || keep.has(id))
  } else {
    next.add(item.group.id)
    selected.value = [...new Set([...selected.value, ...item.members])]
  }
  chosenGroups.value = next
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
          :aria-pressed="item.picked"
          :disabled="item.total === 0"
          :class="[
            'flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            item.all
              ? 'border-accent bg-accent text-white hover:bg-accent-dark'
              : item.picked
                ? 'border-accent bg-accent-soft text-accent-dark hover:brightness-95'
                : 'border-dashed border-outline bg-white text-ink hover:bg-panel',
          ]"
          @click="toggleGroup(item)"
        >
          <UiIcon v-if="item.all" name="check" :size="14" />
          Celá skupina {{ item.group.name }}
          <span v-if="item.picked && !item.all" class="text-xs font-normal">
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
