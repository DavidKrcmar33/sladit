<script setup lang="ts">
import { computed } from 'vue'
import type { DayStatus } from '@/core/calendar'
import { formatShiftSummary } from '@/ui/format'

const props = defineProps<{ status: DayStatus; label: string; selected: boolean }>()
const emit = defineEmits<{ select: [] }>()

const isUncertain = computed(
  () => props.status.kind === 'working' && props.status.shifts.some((shift) => shift.uncertain),
)

const content = computed(() => {
  if (props.status.kind === 'unknown') return '?'
  if (props.status.kind === 'free') return ''
  const [first, ...rest] = props.status.shifts
  return rest.length ? `${formatShiftSummary(first)} +${rest.length}` : formatShiftSummary(first)
})

const statusClasses = computed(() => {
  if (props.status.kind === 'free') return 'bg-accent text-white hover:bg-accent-dark'
  if (props.status.kind === 'unknown') return 'bg-hatch text-ink hover:brightness-95'
  return isUncertain.value
    ? 'border-2 border-dashed border-warn bg-shift font-semibold text-ink hover:brightness-95'
    : 'bg-shift text-ink hover:brightness-95'
})
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :aria-pressed="selected"
    :class="[
      'flex h-13 w-full min-w-18 items-center justify-center rounded-md px-1 text-[13px] font-medium whitespace-nowrap transition',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      statusClasses,
      selected && 'ring-2 ring-ink ring-offset-2 ring-offset-ground',
    ]"
    @click="emit('select')"
  >
    {{ content }}
  </button>
</template>
