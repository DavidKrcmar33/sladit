<script setup lang="ts">
import { computed } from 'vue'
import { formatDateRange, formatDayShort } from '@/ui/format'
import SidebarSection from './SidebarSection.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  collapsed: boolean
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
const emit = defineEmits<{ expand: []; select: [actionId: string]; create: [] }>()

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
    :collapsed="collapsed"
    :selected-id="selectedActionId"
    icon="calendar"
    title="Akce"
    :count="actions.length"
    add-label="Přidat akci"
    :badge="waitingBadge"
    @expand="emit('expand')"
    @add="emit('create')"
  >
    <ul class="flex flex-col gap-1.5">
      <li v-for="action in actions" :key="action.id">
        <button
          type="button"
          :aria-current="action.id === selectedActionId ? 'page' : undefined"
          class="sidebar-link"
          :title="`${action.name} · ${formatDateRange(action.from, action.to)} · Lidé: ${action.peopleCount}${action.confirmed ? ` · ${action.agreed ? 'Domluveno' : 'Navrženo'}: ${formatDayShort(action.confirmed.date)}` : ''}`"
          @click="emit('select', action.id)"
        >
          <UiIcon name="calendar" :size="18" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ action.name }}</span>
          <span v-if="action.waitingForMe" class="sidebar-badge shrink-0">pozvánka</span>
          <span v-else-if="action.slotWaiting" class="sidebar-badge shrink-0">termín</span>
        </button>
      </li>
    </ul>
  </SidebarSection>
</template>
