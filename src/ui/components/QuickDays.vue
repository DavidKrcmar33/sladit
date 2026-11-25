<script setup lang="ts">
import { formatDayHeader } from '@/ui/format'

/**
 * Rychlá odpověď bez rozpisu: kdo rozpis nemá po ruce, naklikne dny akce „můžu / nemůžu“.
 * Uloží se jako ruční dny v Mém rozvrhu, takže platí i v jiných akcích.
 */
const props = defineProps<{
  dates: string[]
  /** Stav každého dne: volno, celý den obsazeno, nebo nic. */
  states: Record<string, 'free' | 'busy' | null>
  busy: boolean
}>()
const emit = defineEmits<{ set: [date: string, state: 'free' | 'busy' | null] }>()

const NEXT = { null: 'free', free: 'busy', busy: null } as const
const TEXT = { free: 'můžu', busy: 'nemůžu' } as const

function cycle(date: string) {
  const current = props.states[date] ?? null
  emit('set', date, NEXT[`${current}` as keyof typeof NEXT])
}
</script>

<template>
  <section
    aria-labelledby="quick-days-title"
    class="flex flex-col gap-3 rounded-xl border-2 border-accent bg-white p-4"
  >
    <h2 id="quick-days-title" class="text-base font-semibold">Nemáš rozpis? Označ dny</h2>
    <p class="text-muted">
      Klepnutím přepneš den na „můžu“, „nemůžu“ a zpátky. Uloží se do tvého rozvrhu a ostatní z toho
      uvidí jen, jestli můžeš.
    </p>
    <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
      <button
        v-for="date in dates"
        :key="date"
        type="button"
        :disabled="busy"
        :aria-label="`${formatDayHeader(date)}: ${states[date] ? TEXT[states[date]!] : 'nevím'}`"
        :class="[
          'flex min-h-13 flex-col items-center justify-center rounded-md border px-1 text-[13px] font-medium transition',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          states[date] === 'free'
            ? 'border-accent-ring bg-free text-accent-dark'
            : states[date] === 'busy'
              ? 'border-warn-strong bg-shift text-ink'
              : 'border-dashed border-outline bg-white text-muted hover:bg-panel',
        ]"
        @click="cycle(date)"
      >
        <span>{{ formatDayHeader(date) }}</span>
        <span class="text-[11px]">{{ states[date] ? TEXT[states[date]!] : '?' }}</span>
      </button>
    </div>
  </section>
</template>
