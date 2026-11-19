<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarDay } from '@/core/calendar'
import { formatFreeWindows, formatShiftSummary } from '@/ui/format'

const props = defineProps<{
  day: CalendarDay
  label: string
  selected: boolean
  /** Den člověka, jehož rozpis přihlášený nevidí: jde přečíst, ne otevřít. */
  readonly?: boolean
}>()
const emit = defineEmits<{ select: [] }>()

const shifts = computed(() => ('shifts' in props.day.status ? props.day.status.shifts : []))

const isUncertain = computed(() => shifts.value.some((shift) => shift.uncertain))

const content = computed(() => {
  const [first, ...rest] = shifts.value
  const summary = !first
    ? ''
    : rest.length
      ? `${formatShiftSummary(first)} +${rest.length}`
      : formatShiftSummary(first)
  // U cizího rozpisu jen výsledek: směny ani důvod neznáme.
  if (props.day.status.kind === 'private') {
    return props.day.attendance === 'busy'
      ? 'nemůže'
      : props.day.attendance === 'unknown'
        ? '?'
        : ''
  }
  // Neznámý den může mít známou směnu, třeba výuku, když chybí rozpis z práce.
  if (props.day.status.kind === 'unknown') return summary ? `${summary} ?` : '?'
  return summary
})

const freeText = computed(() =>
  props.day.isPartial ? `jen ${formatFreeWindows(props.day.windows)}` : '',
)

const colorClasses = computed(() => {
  if (props.day.attendance === 'unknown') return 'bg-hatch text-ink hover:brightness-95'
  if (props.day.attendance === 'available' && props.day.isPartial) {
    return [
      'border-2 bg-accent-soft text-accent-dark hover:brightness-95',
      isUncertain.value ? 'border-dashed border-accent-dark font-semibold' : 'border-accent-ring',
    ]
  }
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
  <div
    v-if="readonly"
    role="img"
    :aria-label="label"
    :title="label"
    :class="[
      'flex h-13 w-full min-w-18 cursor-default flex-col items-center justify-center rounded-md px-1 text-[13px] leading-tight font-medium whitespace-nowrap',
      colorClasses,
    ]"
  >
    <span v-if="content">{{ content }}</span>
  </div>
  <button
    v-else
    type="button"
    :aria-label="label"
    :title="label"
    :aria-pressed="selected"
    :class="[
      'flex h-13 w-full min-w-18 flex-col items-center justify-center leading-tight rounded-md px-1 text-[13px] font-medium whitespace-nowrap transition',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      colorClasses,
      selected && 'ring-2 ring-ink ring-offset-2 ring-offset-ground',
    ]"
    @click="emit('select')"
  >
    <span v-if="content">{{ content }}</span>
    <span v-if="freeText" class="text-[11px] font-semibold">{{ freeText }}</span>
  </button>
</template>
