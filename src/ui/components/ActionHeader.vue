<script setup lang="ts">
import type { Action } from '@/core/schema'
import { formatDateRange, formatDuration, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'

defineProps<{
  action: Action
  /** Poslední úpravu akce jde vrátit. */
  canUndoEdit: boolean
  /** Akci upravuje jen organizátor. Ostatní uvidí, kdo ji pořádá. Smazání je dole na stránce. */
  isOrganizer: boolean
  organizerName: string
}>()
const emit = defineEmits<{ edit: []; undoEdit: [] }>()
</script>

<template>
  <header
    class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-6 lg:px-8 lg:py-3.5"
  >
    <div class="flex min-w-0 flex-col gap-0.5">
      <p class="text-xl font-semibold tracking-tight">{{ action.name }}</p>
      <p class="text-muted">
        {{ formatDateRange(action.from, action.to) }} ·
        {{ formatDuration(action.durationMinutes) }} · mezi
        {{ formatTimeWindow(action.windowStart, action.windowEnd) }}
        <template v-if="!isOrganizer"> · pořádá {{ organizerName }}</template>
      </p>
    </div>
    <UiButton v-if="isOrganizer" variant="ghost" class="max-sm:-ml-4" @click="emit('edit')">
      Upravit akci
    </UiButton>
    <p v-if="canUndoEdit" class="flex items-center gap-2 text-muted" aria-live="polite">
      Akce upravena.
      <UiButton variant="ghost" @click="emit('undoEdit')">Vrátit</UiButton>
    </p>
  </header>
</template>
