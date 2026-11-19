<script setup lang="ts">
import { ref } from 'vue'
import type { Action } from '@/core/schema'
import { formatDateRange, formatDuration, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'

defineProps<{
  action: Action
  /** Poslední úpravu akce jde vrátit. */
  canUndoEdit: boolean
  /** Akci upravuje a maže jen organizátor. Ostatní uvidí, kdo ji pořádá. */
  isOrganizer: boolean
  organizerName: string
}>()
const emit = defineEmits<{ edit: []; undoEdit: []; delete: [] }>()

const confirmingDelete = ref(false)
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-3.5"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div class="flex flex-col gap-0.5">
        <p class="text-xl font-semibold tracking-tight">{{ action.name }}</p>
        <p class="text-muted">
          {{ formatDateRange(action.from, action.to) }} ·
          {{ formatDuration(action.durationMinutes) }} · mezi
          {{ formatTimeWindow(action.windowStart, action.windowEnd) }}
          <template v-if="!isOrganizer"> · pořádá {{ organizerName }}</template>
        </p>
      </div>
      <UiButton v-if="isOrganizer" variant="ghost" @click="emit('edit')">Upravit akci</UiButton>
      <p v-if="canUndoEdit" class="flex items-center gap-2 text-muted" aria-live="polite">
        Akce upravena.
        <UiButton variant="ghost" @click="emit('undoEdit')">Vrátit</UiButton>
      </p>
    </div>
    <template v-if="isOrganizer">
      <div
        v-if="confirmingDelete"
        role="alertdialog"
        aria-label="Smazat akci"
        class="flex items-center gap-2"
      >
        <span class="text-warn">Smazat akci pro všechny?</span>
        <UiButton variant="danger" @click="emit('delete')">Smazat</UiButton>
        <UiButton @click="confirmingDelete = false">Nechat</UiButton>
      </div>
      <UiButton v-else variant="danger" @click="confirmingDelete = true">Smazat akci</UiButton>
    </template>
  </header>
</template>
