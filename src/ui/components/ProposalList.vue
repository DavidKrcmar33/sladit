<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConfirmedSlot } from '@/contract/api'
import type { Proposal } from '@/core/schema'
import type { Stability } from '@/core/sensitivity'
import { describeStability, formatDayLong, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'

const props = defineProps<{
  proposals: Proposal[]
  people: { id: string; name: string }[]
  /** Zda se nejlepší termín může změnit, až se doplní chybějící a ověří nejistá data. */
  stability: Stability | null
  /** Organizátor může termín potvrdit. */
  canConfirm?: boolean
  confirmed?: ConfirmedSlot | null
  /** Něco se ukládá: potvrzovat teď nejde. */
  busy?: boolean
  /** Právě se ukládá potvrzení termínu. */
  confirming?: boolean
}>()
const emit = defineEmits<{ confirm: [proposal: Proposal] }>()

/** Termín, na který organizátor naposledy klikl, aby u něj bylo vidět „Navrhuji…“. */
const clicked = ref<string | null>(null)

function keyOf(proposal: Proposal): string {
  return `${proposal.date}-${proposal.start}`
}

function confirm(proposal: Proposal) {
  clicked.value = keyOf(proposal)
  emit('confirm', proposal)
}

function isConfirmed(proposal: Proposal): boolean {
  return (
    props.confirmed?.date === proposal.date &&
    props.confirmed.start === proposal.start &&
    props.confirmed.end === proposal.end
  )
}

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
        :key="keyOf(proposal)"
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
        <p v-if="index === 0 && stabilityNote" class="border-t border-line pt-1.5 text-warn">
          {{ stabilityNote }}
        </p>
        <p v-if="isConfirmed(proposal)" class="font-semibold text-accent-dark">Navrženo</p>
        <UiButton
          v-else-if="canConfirm"
          :variant="index === 0 ? 'primary' : 'secondary'"
          class="mt-1 self-start"
          :disabled="busy"
          @click="confirm(proposal)"
        >
          {{ confirming && clicked === keyOf(proposal) ? 'Navrhuji…' : 'Navrhnout tento termín' }}
        </UiButton>
      </li>
    </ol>
  </section>
</template>
