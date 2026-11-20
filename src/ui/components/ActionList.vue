<script setup lang="ts">
import { computed } from 'vue'
import { formatDateRange, formatDayShort } from '@/ui/format'
import SidebarSection from './SidebarSection.vue'

const props = defineProps<{
  actions: {
    id: string
    name: string
    from: string
    to: string
    peopleCount: number
    /** Pozvánka čeká na moji odpověď. */
    waitingForMe: boolean
    /** Navržený termín čeká na moji odpověď, nebo někdo navrhl jiný. */
    slotWaiting: boolean
    confirmed: { date: string } | null
    agreed: boolean
  }[]
  selectedActionId: string | null
}>()
const emit = defineEmits<{ select: [actionId: string]; create: [] }>()

/** Ve sbaleném seznamu nesmí čekající pozvánka ani termín k odpovědi zapadnout. */
const waitingBadge = computed(() => {
  const count = props.actions.filter((action) => action.waitingForMe || action.slotWaiting).length
  if (count === 0) return null
  return count === 1 ? '1 čeká' : `${count} čekají`
})
</script>

<template>
  <SidebarSection
    id="action-list"
    title="Akce"
    :count="actions.length"
    add-label="Nová akce"
    :badge="waitingBadge"
    @add="emit('create')"
  >
    <p v-if="actions.length === 0" class="px-2 text-muted">Zatím žádné akce.</p>
    <ul class="flex flex-col gap-1">
      <li v-for="action in actions" :key="action.id">
        <button
          type="button"
          :aria-current="action.id === selectedActionId ? 'page' : undefined"
          :class="[
            'flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left',
            action.id === selectedActionId
              ? 'border-line bg-white'
              : 'border-transparent hover:bg-white/60',
          ]"
          @click="emit('select', action.id)"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="font-semibold">{{ action.name }}</span>
            <span
              v-if="action.waitingForMe"
              class="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white"
            >
              pozvánka
            </span>
            <span
              v-else-if="action.slotWaiting"
              class="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white"
            >
              termín
            </span>
          </span>
          <span class="text-xs text-muted">
            {{ formatDateRange(action.from, action.to) }} · Lidé: {{ action.peopleCount }}
          </span>
          <span v-if="action.confirmed" class="text-xs font-medium text-accent-dark">
            {{ action.agreed ? 'Domluveno' : 'Navrženo' }}:
            {{ formatDayShort(action.confirmed.date) }}
          </span>
        </button>
      </li>
    </ul>
  </SidebarSection>
</template>
