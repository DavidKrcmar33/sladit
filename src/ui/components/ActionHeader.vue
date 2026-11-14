<script setup lang="ts">
import { computed } from 'vue'
import type { Action } from '@/core/schema'
import type { Step } from '@/session'
import { formatDateRange, formatDuration, formatTimeWindow } from '@/ui/format'
import StepIndicator from './StepIndicator.vue'

const props = defineProps<{ action: Action; currentStep: Step; calendarBlocker: string | null }>()
const emit = defineEmits<{ navigate: [step: Step] }>()

const steps = computed(() => [
  { id: 'intake' as const, label: 'Podklady', available: true },
  { id: 'calendar' as const, label: 'Kalendář a termín', available: !props.calendarBlocker },
])
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-3.5"
  >
    <div class="flex flex-col gap-0.5">
      <p class="text-xl font-semibold tracking-tight">{{ action.name }}</p>
      <p class="text-muted">
        {{ formatDateRange(action.from, action.to) }} ·
        {{ formatDuration(action.durationMinutes) }} · mezi
        {{ formatTimeWindow(action.windowStart, action.windowEnd) }}
      </p>
    </div>
    <StepIndicator
      :steps="steps"
      :current-step-id="currentStep"
      @select="emit('navigate', $event)"
    />
  </header>
</template>
