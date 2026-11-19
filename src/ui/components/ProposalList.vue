<script setup lang="ts">
import { computed } from 'vue'
import type { Proposal } from '@/core/schema'
import type { Stability } from '@/core/sensitivity'
import { describeStability, formatDayLong, formatTimeWindow } from '@/ui/format'

const props = defineProps<{
  proposals: Proposal[]
  people: { id: string; name: string }[]
  /** Zda se nejlepší termín může změnit, až se doplní chybějící a ověří nejistá data. */
  stability: Stability | null
}>()

const stabilityNote = computed(() =>
  props.stability?.winner ? describeStability(props.stability, nameOf) : null,
)

function nameOf(personId: string): string {
  return props.people.find((person) => person.id === personId)?.name ?? personId
}

function namesOf(personIds: string[]): string {
  return personIds
    .map((personId) => props.people.find((person) => person.id === personId)?.name ?? personId)
    .join(', ')
}
</script>

<template>
  <section aria-labelledby="proposals-title" class="flex flex-col gap-3">
    <h2 id="proposals-title" class="text-base font-semibold">Návrhy termínů</h2>

    <p
      v-if="proposals.length === 0"
      class="rounded-xl border border-dashed border-outline px-4 py-6 text-center text-muted"
    >
      Zatím žádné návrhy.
    </p>

    <ol v-else class="flex flex-col gap-3">
      <li
        v-for="(proposal, index) in proposals"
        :key="`${proposal.date}-${proposal.start}`"
        :class="[
          'flex flex-col gap-1.5 rounded-xl bg-white p-4',
          index === 0 ? 'border-2 border-accent' : 'border border-line',
        ]"
      >
        <div class="flex items-center justify-between">
          <p :class="index === 0 ? 'font-semibold text-accent-dark' : 'font-medium text-muted'">
            {{ index === 0 ? 'Nejlepší termín' : `Návrh ${index + 1}` }}
          </p>
          <p class="text-xl font-semibold tracking-tight">
            {{ proposal.available.length }} z {{ people.length }}
          </p>
        </div>
        <p class="text-xl font-semibold tracking-tight first-letter:uppercase">
          {{ formatDayLong(proposal.date) }}
        </p>
        <p class="text-[15px]">{{ formatTimeWindow(proposal.start, proposal.end) }}</p>
        <p v-if="proposal.missing.length === 0 && proposal.unknown.length === 0" class="text-muted">
          Mohou všichni.
        </p>
        <p v-if="proposal.missing.length" class="text-muted">
          Chybí: {{ namesOf(proposal.missing) }}
        </p>
        <p v-if="proposal.unknown.length" class="text-muted">
          Neznámo: {{ namesOf(proposal.unknown) }}
        </p>
        <p
          v-if="index === 0 && stabilityNote"
          :class="[
            'border-t border-line pt-1.5',
            stability?.certain ? 'text-accent-dark' : 'text-warn',
          ]"
        >
          {{ stabilityNote }}
        </p>
      </li>
    </ol>
  </section>
</template>
