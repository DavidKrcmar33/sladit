<script setup lang="ts">
import { ref, watch } from 'vue'
import UiIcon from './UiIcon.vue'

/**
 * Sbalitelný seznam v postranním panelu: nadpis se šipkou a plus pro novou položku.
 * Zda je sbalený, si pamatuje prohlížeč (jen pro pohodlí, bez úložiště to funguje taky).
 */
const props = defineProps<{
  id: string
  title: string
  count: number
  addLabel: string
  /** Krátká upozornění do nadpisu, když je seznam sbalený, třeba čekající pozvánka. */
  badge?: string | null
}>()
const emit = defineEmits<{ add: [] }>()

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

function add() {
  open.value = true
  emit('add')
}
</script>

<template>
  <nav :aria-labelledby="`${id}-title`" class="flex flex-col gap-1">
    <div class="flex items-center gap-1">
      <h2 :id="`${id}-title`" class="min-w-0 flex-1">
        <button
          type="button"
          :aria-expanded="open"
          :aria-controls="`${id}-content`"
          class="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium tracking-wider text-muted uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          @click="open = !open"
        >
          <UiIcon
            name="chevron-down"
            :size="14"
            :class="['shrink-0 transition-transform', open ? '' : '-rotate-90']"
          />
          {{ title }}
          <span v-if="!open && count > 0" class="font-normal tracking-normal">{{ count }}</span>
          <span
            v-if="!open && badge"
            class="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold tracking-normal text-white normal-case"
          >
            {{ badge }}
          </span>
        </button>
      </h2>
      <button
        type="button"
        :aria-label="addLabel"
        :title="addLabel"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        @click="add"
      >
        <UiIcon name="plus" :size="16" />
      </button>
    </div>
    <div v-show="open" :id="`${id}-content`" class="flex flex-col gap-1">
      <slot />
    </div>
  </nav>
</template>
