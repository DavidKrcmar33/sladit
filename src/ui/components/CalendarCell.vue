<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarDay } from '@/core/calendar'
import { formatShiftSummary } from '@/ui/format'

const props = defineProps<{ day: CalendarDay; label: string; selected: boolean }>()
const emit = defineEmits<{ select: [] }>()

const isUncertain = computed(
  () =>
    props.day.status.kind === 'working' && props.day.status.shifts.some((shift) => shift.uncertain),
)

const content = computed(() => {
  const { status } = props.day
  if (status.kind === 'unknown') return '?'
  if (status.kind === 'free') return ''
  const [first, ...rest] = status.shifts
  return rest.length ? `${formatShiftSummary(first)} +${rest.length}` : formatShiftSummary(first)
})

const colorClasses = computed(() => {
  if (props.day.attendance === 'unknown') return 'bg-hatch text-ink hover:brightness-95'
  if (props.day.attendance === 'available') {
    return [
      'bg-accent text-white hover:bg-accent-dark',
      isUncertain.value && 'border-2 border-dashed border-white font-semibold',
    ]
  }
  return [
    'bg-shift text-ink hover:brightness-95',
    isUncertain.value && 'border-2 border-dashed border-warn font-semibold',
  ]
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
      colorClasses,
      selected && 'ring-2 ring-ink ring-offset-2 ring-offset-ground',
    ]"
    @click="emit('select')"
  >
    {{ content }}
  </button>
</template>
