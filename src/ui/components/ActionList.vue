<script setup lang="ts">
import type { Action } from '@/core/schema'
import { formatDateRange } from '@/ui/format'
import UiButton from './UiButton.vue'

defineProps<{ actions: Action[]; selectedActionId: string | null }>()
const emit = defineEmits<{ select: [actionId: string]; create: [] }>()
</script>

<template>
  <nav aria-labelledby="action-list-title" class="flex flex-col gap-1">
    <h2
      id="action-list-title"
      class="px-2 pb-1.5 text-xs font-medium tracking-wider text-muted uppercase"
    >
      Akce
    </h2>
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
          <span class="font-semibold">{{ action.name }}</span>
          <span class="text-xs text-muted">
            {{ formatDateRange(action.from, action.to) }} · Lidé: {{ action.people.length }}
          </span>
        </button>
      </li>
    </ul>
  </nav>
  <UiButton variant="dashed" @click="emit('create')">Nová akce</UiButton>
</template>
