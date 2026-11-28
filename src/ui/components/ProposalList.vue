<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ConfirmedSlot } from '@/contract/api'
import type { Proposal } from '@/core/schema'
import type { Stability } from '@/core/sensitivity'
import { describeStability, formatDayLong, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'
import UiIcon from './UiIcon.vue'

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
  /**
   * Proč návrhy chybí: přihlášený nemá rozpis, ostatní ho nemají (nebo pozvánku nepřijali),
   * nebo se v okně akce nikdo nevešel.
   */
  emptyReason?: 'mine' | 'others' | 'conditions' | 'nofit'
  /** Termíny chystané do hlasování (jen organizátor). */
  pollDraft?: ConfirmedSlot[]
}>()
const emit = defineEmits<{
  confirm: [proposal: Proposal]
  upload: []
  togglePoll: [slot: ConfirmedSlot]
}>()

const scroller = ref<HTMLOListElement | null>(null)
const overflowing = ref(false)
const atStart = ref(true)
const atEnd = ref(true)
let observer: ResizeObserver | undefined

function updateScroll() {
  const el = scroller.value
  if (!el) return
  overflowing.value = el.scrollWidth > el.clientWidth + 2
  atStart.value = el.scrollLeft <= 2
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
}

watch(scroller, (el) => {
  observer?.disconnect()
  if (!el) {
    overflowing.value = false
    atStart.value = true
    atEnd.value = true
    return
  }
  observer = new ResizeObserver(updateScroll)
  observer.observe(el)
  updateScroll()
})
watch(
  () => props.proposals,
  async () => {
    await nextTick()
    updateScroll()
  },
  { deep: true },
)
onBeforeUnmount(() => observer?.disconnect())

function move(direction: number) {
  const el = scroller.value
  if (!el) return
  const cards = Array.from(el.children) as HTMLElement[]
  const step = cards.length > 1 ? cards[1]!.offsetLeft - cards[0]!.offsetLeft : el.clientWidth
  el.scrollBy({
    left: direction * step,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? -1 : 1)
  }
}

function isBest(proposal: Proposal): boolean {
  const best = props.stability?.winner ?? props.proposals[0]
  return !!best && keyOf(best) === keyOf(proposal)
}

function inPoll(proposal: Proposal): boolean {
  return (props.pollDraft ?? []).some(
    (slot) => slot.date === proposal.date && slot.start === proposal.start,
  )
}

function plain(proposal: Proposal): ConfirmedSlot {
  return { date: proposal.date, start: proposal.start, end: proposal.end }
}

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
  <section aria-labelledby="proposals-title" class="flex min-w-0 flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <h2 id="proposals-title" class="action-section-title">Návrhy termínů</h2>
      <div v-if="overflowing" class="flex shrink-0 gap-2">
        <UiButton aria-label="Předchozí návrhy" :disabled="atStart" @click="move(-1)">
          <UiIcon name="chevron-left" :size="20" />
        </UiButton>
        <UiButton aria-label="Další návrhy" :disabled="atEnd" @click="move(1)">
          <UiIcon name="chevron-right" :size="20" />
        </UiButton>
      </div>
    </div>

    <div
      v-if="proposals.length === 0"
      class="flex flex-col items-start gap-2 rounded-xl border border-dashed border-outline px-4 py-5"
    >
      <p class="font-semibold">Zatím žádné návrhy</p>
      <template v-if="emptyReason === 'mine'">
        <p class="text-muted">
          Návrhy se počítají z rozpisů. Ty zatím žádný nemáš, takže u tebe je všude „nevíme“.
        </p>
        <UiButton variant="primary" @click="emit('upload')">Nahrát můj rozvrh</UiButton>
      </template>
      <p v-else-if="emptyReason === 'others'" class="text-muted">
        Ostatní zatím nemají nahraný rozpis, nebo ještě nepřijali pozvánku. Jakmile ho nahrají,
        návrhy se objeví tady. Klidně jim napiš, ať to udělají.
      </p>
      <p v-else-if="emptyReason === 'conditions'" class="text-muted">
        Žádný termín nesplňuje podmínky akce: nezbytní lidé nebo nejmenší počet lidí. Uvolni je v
        úpravě akce nebo u účastníků.
      </p>
      <p v-else class="text-muted">
        V okně akce se nikdo nevešel. Zkus delší období, širší čas během dne nebo kratší akci.
      </p>
    </div>

    <ol
      v-else
      ref="scroller"
      :tabindex="overflowing ? 0 : undefined"
      aria-label="Návrhy termínů"
      class="flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-xl pb-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      @scroll="updateScroll"
      @keydown="onKeydown"
    >
      <li
        v-for="(proposal, index) in proposals"
        :key="keyOf(proposal)"
        :class="{ 'ring-2 ring-inset ring-accent': isBest(proposal) }"
        class="action-surface flex w-full max-w-full min-w-0 shrink-0 snap-start flex-col gap-3 break-words sm:w-80 lg:w-96"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p
            :class="
              isBest(proposal)
                ? 'rounded-full bg-cta px-2.5 py-1 text-sm font-semibold text-cta-ink'
                : 'text-sm font-medium text-muted'
            "
          >
            {{ isBest(proposal) ? 'Nejlepší termín' : `Návrh ${index + 1}` }}
          </p>
          <p class="text-xl font-semibold tracking-tight">
            {{ proposal.available.length }} z {{ people.length }}
          </p>
        </div>
        <p class="text-2xl font-semibold tracking-tight first-letter:uppercase">
          {{ formatDayLong(proposal.date) }}
        </p>
        <p class="text-xl font-semibold">{{ formatTimeWindow(proposal.start, proposal.end) }}</p>
        <p v-if="proposal.missing.length === 0 && proposal.unknown.length === 0" class="text-muted">
          Mohou všichni.
        </p>
        <p v-if="proposal.missing.length" class="text-muted">
          Chybí: {{ namesOf(proposal.missing) }}
        </p>
        <p v-if="proposal.unknown.length" class="text-muted">
          Neznámo: {{ namesOf(proposal.unknown) }}
        </p>
        <p v-if="isBest(proposal) && stabilityNote" class="border-t border-line pt-1.5 text-warn">
          {{ stabilityNote }}
        </p>
        <p v-if="isConfirmed(proposal)" class="font-semibold text-accent-dark">Navrženo</p>
        <div v-else-if="canConfirm" class="mt-auto flex flex-wrap gap-2 pt-3">
          <UiButton variant="primary" :disabled="busy" @click="confirm(proposal)">
            {{ confirming && clicked === keyOf(proposal) ? 'Navrhuji…' : 'Navrhnout tento termín' }}
          </UiButton>
          <UiButton
            v-if="pollDraft"
            variant="ghost"
            :aria-pressed="inPoll(proposal)"
            :disabled="busy || (!inPoll(proposal) && pollDraft.length >= 3)"
            @click="emit('togglePoll', plain(proposal))"
          >
            {{ inPoll(proposal) ? 'V hlasování ✓' : 'Do hlasování' }}
          </UiButton>
        </div>
      </li>
    </ol>
  </section>
</template>
