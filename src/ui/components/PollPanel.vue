<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ActionResource, ConfirmedSlot, PollCandidate, Vote } from '@/contract/api'
import type { PendingWork } from '@/session'
import { formatDayLong, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'

/**
 * Hlasování o 2–3 termínech. Organizátor ho připraví a spustí, účastníci u každého termínu
 * odpoví „můžu / když bude nutné / nemůžu“ (předvyplněné podle rozpisu) a organizátor jedním
 * klikem vybere vítěze.
 */
const props = defineProps<{
  resource: ActionResource
  /** Termíny, které organizátor chystá do hlasování. */
  draft: ConfirmedSlot[]
  /** Předvyplněný hlas podle mého rozpisu, null když nevíme. */
  suggest: (slot: ConfirmedSlot) => Vote | null
  pending: PendingWork | null
  now: Date
}>()
const emit = defineEmits<{
  removeDraft: [slot: ConfirmedSlot]
  start: [deadline: string | null]
  cancel: []
  vote: [votes: { candidateId: string; vote: Vote }[]]
  choose: [candidateId: string]
}>()

const VOTES: { value: Vote; label: string }[] = [
  { value: 'yes', label: 'Můžu' },
  { value: 'maybe', label: 'Když bude nutné' },
  { value: 'no', label: 'Nemůžu' },
]

const busy = computed(() => props.pending !== null)
const poll = computed(() => props.resource.poll)
const deadline = ref('')

function describe(slot: ConfirmedSlot): string {
  return `${formatDayLong(slot.date)} ${formatTimeWindow(slot.start, slot.end)}`
}

function start() {
  emit('start', deadline.value ? new Date(deadline.value).toISOString() : null)
}

// Účastník: rozpracované hlasy, předvyplněné podle rozpisu.
const myVotes = ref<Record<string, Vote | null>>({})
watch(
  poll,
  (value) => {
    myVotes.value = Object.fromEntries(
      (value?.candidates ?? []).map((candidate) => [
        candidate.id,
        candidate.myVote ?? props.suggest(candidate),
      ]),
    )
  },
  { immediate: true },
)
const voted = computed(() => poll.value?.candidates.some((candidate) => candidate.myVote) ?? false)
const complete = computed(() => Object.values(myVotes.value).every((vote) => vote !== null))

function sendVotes() {
  emit(
    'vote',
    Object.entries(myVotes.value).flatMap(([candidateId, vote]) =>
      vote ? [{ candidateId, vote }] : [],
    ),
  )
}

function count(candidate: PollCandidate, vote: Vote): number {
  return candidate.votes.filter((item) => item.vote === vote).length
}

function voters(candidate: PollCandidate, vote: Vote): string {
  return candidate.votes
    .filter((item) => item.vote === vote)
    .map((item) => item.name)
    .join(', ')
}

/** Doporučený vítěz: nejvíc „můžu“, pak nejvíc „když bude nutné“, pak dřívější. */
const recommended = computed(() => {
  const candidates = poll.value?.candidates ?? []
  const ranked = [...candidates].sort(
    (a, b) =>
      count(b, 'yes') - count(a, 'yes') ||
      count(b, 'maybe') - count(a, 'maybe') ||
      count(a, 'no') - count(b, 'no'),
  )
  return ranked[0]?.votes.length ? ranked[0].id : null
})

/** Kdo pozvánku přijal a ještě nehlasoval. */
const waiting = computed(() => {
  const candidates = poll.value?.candidates ?? []
  return props.resource.invites
    .filter((invite) => invite.status === 'accepted')
    .filter((invite) => !candidates.some((c) => c.votes.some((v) => v.userId === invite.userId)))
    .map((invite) => invite.name)
})

const deadlineText = computed(() => {
  const value = poll.value?.deadline
  if (!value) return null
  const date = new Date(value)
  const text = new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return date <= props.now ? `Hlasování skončilo (${text}).` : `Hlasovat jde do: ${text}.`
})
</script>

<template>
  <!-- Organizátor chystá hlasování -->
  <section
    v-if="!poll && resource.isOrganizer && draft.length > 0"
    aria-labelledby="poll-title"
    class="flex flex-col gap-3 rounded-xl border-2 border-accent bg-white p-4"
  >
    <h2 id="poll-title" class="text-base font-semibold">Hlasování o termínu</h2>
    <p class="text-muted">
      Účastníci u každého termínu odpoví, jestli můžou. Odpověď jim předvyplníme podle rozpisu.
    </p>
    <ul class="flex flex-col">
      <li
        v-for="slot in draft"
        :key="`${slot.date} ${slot.start}`"
        class="flex items-center justify-between gap-3 border-t border-line py-1.5"
      >
        <span class="first-letter:uppercase">{{ describe(slot) }}</span>
        <UiButton
          variant="ghost"
          :aria-label="`Odebrat z hlasování: ${describe(slot)}`"
          @click="emit('removeDraft', slot)"
        >
          Odebrat
        </UiButton>
      </li>
    </ul>
    <label class="flex flex-col gap-1.5">
      <span class="font-medium">Hlasovat do (nepovinné)</span>
      <input v-model="deadline" type="datetime-local" class="field-input" />
    </label>
    <div class="flex flex-wrap gap-2">
      <UiButton variant="primary" :disabled="busy" @click="start">
        {{ pending === 'poll' ? 'Spouštím…' : 'Spustit hlasování' }}
      </UiButton>
      <span v-if="draft.length < 2" class="self-center text-xs text-muted">
        Přidej klidně další termín, nejvýš tři.
      </span>
    </div>
  </section>

  <!-- Běžící hlasování -->
  <section
    v-else-if="poll"
    aria-labelledby="poll-title"
    class="flex flex-col gap-3 rounded-xl border-2 border-accent bg-white p-4"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="poll-title" class="text-base font-semibold">Hlasování o termínu</h2>
      <UiButton
        v-if="resource.isOrganizer"
        variant="ghost"
        :disabled="busy"
        @click="emit('cancel')"
      >
        Zrušit hlasování
      </UiButton>
    </div>
    <p v-if="deadlineText" class="text-muted">{{ deadlineText }}</p>

    <ul class="flex flex-col">
      <li
        v-for="candidate in poll.candidates"
        :key="candidate.id"
        class="flex flex-col gap-2 border-t border-line py-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-semibold first-letter:uppercase">
            {{ describe(candidate) }}
            <span
              v-if="resource.isOrganizer && candidate.id === recommended"
              class="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white"
            >
              Doporučeno
            </span>
          </span>
          <span class="text-muted">
            můžu {{ count(candidate, 'yes') }} · nutné {{ count(candidate, 'maybe') }} · nemůžu
            {{ count(candidate, 'no') }}
          </span>
        </div>
        <p v-if="candidate.votes.length" class="text-xs text-muted">
          <template v-if="count(candidate, 'yes')">Můžu: {{ voters(candidate, 'yes') }}. </template>
          <template v-if="count(candidate, 'maybe')">
            Když bude nutné: {{ voters(candidate, 'maybe') }}.
          </template>
          <template v-if="count(candidate, 'no')">Nemůžu: {{ voters(candidate, 'no') }}.</template>
        </p>

        <div
          v-if="resource.myStatus === 'accepted'"
          role="radiogroup"
          :aria-label="`Můj hlas: ${describe(candidate)}`"
          class="flex flex-wrap gap-1.5"
        >
          <button
            v-for="option in VOTES"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="myVotes[candidate.id] === option.value"
            :class="[
              'min-h-9 rounded-full border px-3 py-1 font-medium transition',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              myVotes[candidate.id] === option.value
                ? option.value === 'no'
                  ? 'border-warn bg-warn-soft text-warn'
                  : 'border-accent bg-accent text-white'
                : 'border-line bg-white hover:bg-panel',
            ]"
            @click="myVotes[candidate.id] = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <UiButton
          v-if="resource.isOrganizer"
          :variant="candidate.id === recommended ? 'primary' : 'secondary'"
          class="self-start"
          :disabled="busy"
          @click="emit('choose', candidate.id)"
        >
          Vybrat tento termín
        </UiButton>
      </li>
    </ul>

    <p v-if="resource.isOrganizer && waiting.length" class="text-muted">
      Ještě nehlasovali: {{ waiting.join(', ') }}
    </p>
    <div v-if="resource.myStatus === 'accepted'" class="flex flex-wrap items-center gap-2">
      <UiButton variant="primary" :disabled="busy || !complete" @click="sendVotes">
        {{ voted ? 'Změnit hlasy' : 'Odeslat hlasy' }}
      </UiButton>
      <span v-if="!voted" class="text-xs text-muted">
        Předvyplněno podle tvého rozpisu, zkontroluj a odešli.
      </span>
    </div>
    <p v-if="resource.myStatus === 'invited'" class="text-muted">
      Hlasovat půjde, až pozvánku přijmeš.
    </p>
  </section>
</template>
