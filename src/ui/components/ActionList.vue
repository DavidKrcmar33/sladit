<script setup lang="ts">
import { sectionIcons } from '@/ui/sectionIcons'
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
    polling: boolean
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
function statusLabel(action: (typeof props.actions)[number]): string {
  return action.agreed
    ? 'Termín domluvený'
    : action.polling
      ? 'O termínu se hlasuje'
      : 'Termín není domluvený'
}
</script>

<template>
  <SidebarSection
    id="action-list"
    :collapsed="collapsed"
    :selected-id="selectedActionId"
    :icon="sectionIcons.actions"
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
          <UiIcon :name="sectionIcons.actions" :size="18" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ action.name }}</span>
          <span
            class="flex shrink-0"
            :title="statusLabel(action)"
            role="img"
            :aria-label="statusLabel(action)"
            :class="
              action.id === selectedActionId
                ? 'text-accent-dark'
                : action.agreed || action.polling
                  ? 'text-sidebar-muted'
                  : 'text-warn-soft'
            "
          >
            <UiIcon
              :name="action.agreed ? 'check' : action.polling ? 'vote' : 'hourglass'"
              :size="16"
            />
          </span>
          <span v-if="action.waitingForMe || action.slotWaiting" class="sr-only">
            {{ action.waitingForMe ? 'Pozvánka čeká na odpověď' : 'Termín čeká na odpověď' }}
          </span>
        </button>
      </li>
    </ul>
  </SidebarSection>
</template>
