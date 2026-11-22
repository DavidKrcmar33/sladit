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
  /** Měsíční mřížka: na telefonu se celý týden vejde do šířky, text se smí zalomit. */
  compact?: boolean
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

/** Slova jako samostatné kusy: v úzké buňce se řádek zlomí jen na mezeře, ne v čase „14–22“. */
function words(text: string): string[] {
  return text.split(' ').filter(Boolean)
}

const sizeClasses = computed(() =>
  props.compact
    ? 'min-w-18 whitespace-nowrap max-sm:h-auto max-sm:min-h-13 max-sm:min-w-0 max-sm:px-0.5 max-sm:py-1 max-sm:text-[11px] max-sm:whitespace-normal'
    : 'min-w-14 whitespace-nowrap sm:min-w-18',
)

/**
 * „Může“ je světlé: plná tmavá plocha by přitahovala pohled víc než dny, kdy někdo nemůže.
 * Směna v dni, kdy člověk může (mimo okno akce), má navíc obrys, aby nesplývala s volnem.
 */
const colorClasses = computed(() => {
  if (props.day.attendance === 'unknown') return 'bg-hatch text-ink hover:brightness-95'
  if (props.day.attendance === 'available' && props.day.isPartial) {
    return [
      'border-2 bg-white text-accent-dark hover:bg-accent-soft',
      isUncertain.value ? 'border-dashed border-accent-dark font-semibold' : 'border-accent-ring',
    ]
  }
  if (props.day.attendance === 'available') {
    return [
      'bg-free text-accent-dark hover:brightness-95',
      isUncertain.value
        ? 'border-2 border-dashed border-accent-dark font-semibold'
        : shifts.value.length > 0 && 'border border-accent-ring',
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
      'flex h-13 w-full cursor-default flex-col items-center justify-center rounded-md px-1 text-center text-[13px] leading-tight font-medium',
      sizeClasses,
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
      'flex h-13 w-full flex-col items-center justify-center rounded-md px-1 text-center text-[13px] leading-tight font-medium transition',
      sizeClasses,
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      colorClasses,
      selected && 'ring-2 ring-ink ring-offset-2 ring-offset-ground',
    ]"
    @click="emit('select')"
  >
    <span v-if="content">
      <template v-for="(word, i) in words(content)" :key="i">
        <span class="inline-block whitespace-nowrap">{{ word }}</span>{{ ' ' }}
      </template>
    </span>
    <span v-if="freeText" class="text-[11px] font-semibold">
      <template v-for="(word, i) in words(freeText)" :key="i">
        <span class="inline-block whitespace-nowrap">{{ word }}</span>{{ ' ' }}
      </template>
    </span>
  </button>
</template>
