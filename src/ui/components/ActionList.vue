<script setup lang="ts">
import { formatDateRange, formatDayShort } from '@/ui/format'
import UiButton from './UiButton.vue'

defineProps<{
  actions: {
    id: string
    name: string
    from: string
    to: string
    peopleCount: number
    /** Pozvánka čeká na moji odpověď. */
    waitingForMe: boolean
    confirmed: { date: string } | null
  }[]
  selectedActionId: string | null
}>()
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
          <span class="flex items-center justify-between gap-2">
            <span class="font-semibold">{{ action.name }}</span>
            <span
              v-if="action.waitingForMe"
              class="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white"
            >
              pozvánka
            </span>
          </span>
          <span class="text-xs text-muted">
            {{ formatDateRange(action.from, action.to) }} · Lidé: {{ action.peopleCount }}
          </span>
          <span v-if="action.confirmed" class="text-xs font-medium text-accent-dark">
            Potvrzeno: {{ formatDayShort(action.confirmed.date) }}
          </span>
        </button>
      </li>
    </ul>
  </nav>
  <UiButton variant="dashed" @click="emit('create')">Nová akce</UiButton>
</template>
