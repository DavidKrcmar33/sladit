<script setup lang="ts">
import { computed } from 'vue'
import type { ConfirmedSlot } from '@/contract/api'
import type { Proposal } from '@/core/schema'
import { formatDayLong, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'

/**
 * Výběr vlastního času: všechny možné začátky jednoho dne a kdo v nich může. Organizátor
 * čas navrhne nebo přidá do hlasování, účastník ho může navrhnout místo navrženého termínu.
 */
const props = defineProps<{
  date: string
  /** Null, dokud se časy načítají. */
  slots: Proposal[] | null
  people: { id: string; name: string }[]
  isOrganizer: boolean
  /** Účastník může navrhnout jiný termín (k navrženému termínu). */
  canCounter: boolean
  /** Časy, které už jsou v připravovaném hlasování. */
  inPoll: ConfirmedSlot[]
  busy: boolean
  /** Hlasování jde jen s účtem, v ukázce ne. */
  canPoll: boolean
}>()
const emit = defineEmits<{
  propose: [slot: ConfirmedSlot]
  togglePoll: [slot: ConfirmedSlot]
  counter: [slot: ConfirmedSlot]
  close: []
}>()

const best = computed(() => Math.max(0, ...(props.slots ?? []).map((s) => s.available.length)))

function names(ids: string[]): string {
  return ids.map((id) => props.people.find((person) => person.id === id)?.name ?? id).join(', ')
}

function isInPoll(slot: Proposal): boolean {
  return props.inPoll.some((item) => item.date === slot.date && item.start === slot.start)
}

function plain(slot: Proposal): ConfirmedSlot {
  return { date: slot.date, start: slot.start, end: slot.end }
}
</script>

<template>
  <section
    aria-labelledby="day-picker-title"
    class="flex flex-col gap-3 rounded-xl border border-line bg-white p-4"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="day-picker-title" class="text-base font-semibold first-letter:uppercase">
        {{ formatDayLong(date) }}: kdy kdo může
      </h2>
      <UiButton variant="ghost" @click="emit('close')">Zavřít</UiButton>
    </div>
    <p v-if="slots === null" class="text-muted">Načítám časy…</p>
    <p v-else-if="slots.length === 0" class="text-muted">
      Ten den se akce do denního okna nevejde.
    </p>
    <ul v-else class="flex flex-col">
      <li
        v-for="slot in slots"
        :key="slot.start"
        :class="[
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line py-2',
          slot.available.length === best && best > 0 && 'bg-accent-soft/60',
        ]"
      >
        <div class="flex min-w-0 flex-col">
          <span class="font-semibold">
            {{ formatTimeWindow(slot.start, slot.end) }}
            <span class="font-normal text-muted">
              · může {{ slot.available.length }} z {{ people.length }}
            </span>
          </span>
          <span v-if="slot.missing.length" class="text-xs text-muted">
            Nemůže: {{ names(slot.missing) }}
          </span>
          <span v-if="slot.unknown.length" class="text-xs text-muted">
            Nevíme: {{ names(slot.unknown) }}
          </span>
        </div>
        <div v-if="isOrganizer" class="flex gap-1">
          <UiButton variant="ghost" :disabled="busy" @click="emit('propose', plain(slot))">
            Navrhnout
          </UiButton>
          <UiButton
            v-if="canPoll"
            :variant="isInPoll(slot) ? 'primary' : 'secondary'"
            :aria-pressed="isInPoll(slot)"
            :disabled="busy || (!isInPoll(slot) && inPoll.length >= 3)"
            @click="emit('togglePoll', plain(slot))"
          >
            {{ isInPoll(slot) ? 'V hlasování' : 'Do hlasování' }}
          </UiButton>
        </div>
        <UiButton
          v-else-if="canCounter"
          variant="ghost"
          :disabled="busy"
          @click="emit('counter', plain(slot))"
        >
          Navrhnout jiný termín
        </UiButton>
      </li>
    </ul>
  </section>
</template>
