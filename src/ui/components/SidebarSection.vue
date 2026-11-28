<script setup lang="ts">
import { ref, watch } from 'vue'
import UiIcon, { type IconName } from './UiIcon.vue'

/**
 * Sbalitelný seznam v postranním panelu: nadpis se šipkou a plus pro novou položku.
 * Zda je sbalený, si pamatuje prohlížeč (jen pro pohodlí, bez úložiště to funguje taky).
 */
const props = defineProps<{
  id: string
  title: string
  icon: IconName
  collapsed: boolean
  selectedId: string | null
  count: number
  addLabel: string
  /** Krátká upozornění do nadpisu, když je seznam sbalený, třeba čekající pozvánka. */
  badge?: string | null
}>()
const emit = defineEmits<{ add: []; expand: [] }>()

const storageKey = `sladit:panel:${props.id}`

function loadOpen(): boolean {
  try {
    return localStorage.getItem(storageKey) !== 'closed'
  } catch {
    return true
  }
}

const open = ref(loadOpen())

watch(open, (value) => {
  try {
    localStorage.setItem(storageKey, value ? 'open' : 'closed')
  } catch {
    // Bez úložiště se stav jen nezapamatuje.
  }
})

watch(
  () => props.selectedId,
  (id) => {
    if (id) open.value = true
  },
  { immediate: true },
)
function toggle() {
  if (props.collapsed) {
    open.value = true
    emit('expand')
  } else open.value = !open.value
}

function add() {
  open.value = true
  emit('add')
}
</script>

<template>
  <nav :aria-labelledby="`${id}-title`" :class="['flex flex-col', collapsed ? 'gap-0' : 'gap-1.5']">
    <h2 :id="`${id}-title`">
      <button
        type="button"
        :class="collapsed ? 'sidebar-link' : 'sidebar-category'"
        :aria-label="title"
        :title="title"
        :aria-expanded="!collapsed && open"
        :aria-controls="`${id}-content`"
        :data-active="selectedId && (collapsed || !open) ? 'true' : undefined"
        @click="toggle"
      >
        <UiIcon v-if="collapsed" :name="icon" :size="18" class="shrink-0" />
        <template v-else>
          <span class="min-w-0 flex-1">{{ title }}</span>
          <span v-if="!open && count" class="text-xs">{{ count }}</span>
          <span v-if="!open && badge" class="sidebar-badge">{{ badge }}</span>
          <UiIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="16" class="shrink-0" />
        </template>
        <span v-if="collapsed && badge" class="sidebar-dot" />
      </button>
    </h2>
    <div
      :id="`${id}-content`"
      class="sidebar-category-content"
      :data-open="!collapsed && open"
      :inert="collapsed || !open"
      :aria-hidden="collapsed || !open"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="flex flex-col gap-1.5">
          <slot />
          <button type="button" class="sidebar-link" :aria-label="addLabel" @click="add">
            <UiIcon name="plus" :size="18" class="shrink-0" />
            {{ addLabel }}
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>
