<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { ClarifyResponse } from '@/contract/api'
import type { ParityQuestion } from '@/core/compose'
import { MAX_PERIOD_DAYS, questionId, type SourceAnswer } from '@/core/review'
import type { SourceQuestion } from '@/core/schema'
import { daysBetween } from '@/core/time'
import type { ReviewMessage } from '@/session'
import { formatDateRange, formatDayShort, formatWeek } from '@/ui/format'
import UiButton from './UiButton.vue'

/**
 * Okno doptání k jednomu podkladu. Ptá se postupně po jedné otázce. Odpovědět jde tlačítkem,
 * nebo vlastními slovy: tu větu převede AI na návrh změn a ten se uloží až po potvrzení.
 */
const props = defineProps<{
  fileNames: string
  questions: SourceQuestion[]
  parityQuestions: ParityQuestion[]
  messages: ReviewMessage[]
  proposal: ClarifyResponse | null
  sending: boolean
  error: string | null
}>()
const emit = defineEmits<{
  answer: [answers: SourceAnswer[], echo: string]
  parity: [question: ParityQuestion, odd: boolean]
  send: [text: string]
  apply: []
  discard: []
  close: []
}>()

type Current =
  { kind: 'source'; question: SourceQuestion } | { kind: 'parity'; question: ParityQuestion }

/** Na lichý a sudý týden se ptá až po otázkách k samotnému čtení. */
const openParity = computed(() => props.parityQuestions.filter((question) => !question.answer))
const current = computed<Current | null>(() => {
  const question = props.questions[0]
  if (question) return { kind: 'source', question }
  const parity = openParity.value[0]
  return parity ? { kind: 'parity', question: parity } : null
})
const remaining = computed(() => props.questions.length + openParity.value.length - 1)

const draft = ref('')
const periodFrom = ref('')
const periodTo = ref('')
const periodError = ref<string | null>(null)
const retiming = ref(false)
const newStart = ref('')
const newEnd = ref('')
const log = useTemplateRef<HTMLElement>('log')
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

// Okno přes stránku: modální dialog, zavře se i klávesou Esc.
onMounted(() => dialog.value?.showModal())

// Nová otázka začíná s předvyplněnými hodnotami z ní.
watch(
  () => (current.value?.kind === 'source' ? questionId(current.value.question) : null),
  () => {
    const question = current.value?.kind === 'source' ? current.value.question : null
    periodFrom.value = question?.kind === 'period' ? question.assumed.from : ''
    periodTo.value = question?.kind === 'period' ? question.assumed.to : ''
    periodError.value = null
    retiming.value = false
    newStart.value = question?.kind === 'shift' ? question.start : ''
    newEnd.value = question?.kind === 'shift' ? question.end : ''
  },
  { immediate: true },
)

// Nová zpráva se odroluje do pohledu.
watch(
  () => [props.messages.length, props.proposal, current.value],
  async () => {
    await nextTick()
    log.value?.scrollTo({ top: log.value.scrollHeight })
  },
)

function answer(answers: SourceAnswer[], echo: string) {
  emit('answer', answers, echo)
}

function skip(question: SourceQuestion) {
  answer([{ kind: 'skip', questionId: questionId(question) }], 'Nevím.')
}

function savePeriod() {
  const from = periodFrom.value
  const to = periodTo.value
  if (!from || !to || from > to) {
    periodError.value = 'Zadej začátek a konec, konec nesmí být dřív než začátek.'
    return
  }
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) {
    periodError.value = 'Období může být nejvýš rok dlouhé.'
    return
  }
  answer([{ kind: 'period', range: { from, to } }], `Platí ${formatDateRange(from, to)}.`)
}

function shiftAnswer(
  question: Extract<SourceQuestion, { kind: 'shift' }>,
  change: Extract<SourceAnswer, { kind: 'shift' }>['change'],
  echo: string,
) {
  answer(
    [{ kind: 'shift', raw: question.raw, start: question.start, end: question.end, change }],
    echo,
  )
}

function saveTime(question: Extract<SourceQuestion, { kind: 'shift' }>) {
  if (!newStart.value || !newEnd.value || newStart.value === newEnd.value) return
  shiftAnswer(
    question,
    { type: 'time', start: newStart.value, end: newEnd.value },
    `Správně je ${newStart.value}–${newEnd.value}.`,
  )
}

function send() {
  const text = draft.value.trim()
  if (!text || props.sending) return
  emit('send', text)
  draft.value = ''
}

const bubbleApp = 'max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-panel px-3.5 py-2.5'
const bubbleMe = 'max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent px-3.5 py-2.5 text-white'
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="review-title"
    class="m-auto w-[min(40rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-line bg-white p-0 text-sm text-ink shadow-lg backdrop:bg-ink/40"
    @close="emit('close')"
  >
    <div class="flex max-h-[min(46rem,calc(100vh-2rem))] flex-col">
      <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div class="min-w-0">
          <h2 id="review-title" class="font-semibold">Doptání k podkladu</h2>
          <p class="truncate text-xs text-muted">{{ fileNames }}</p>
        </div>
        <UiButton variant="ghost" @click="dialog?.close()">Zavřít</UiButton>
      </header>

      <div
        ref="log"
        class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        <p :class="bubbleApp">
          Pár věcí jsem v podkladu nenašel jistě. Odpověz tlačítkem, nebo napiš vlastními slovy
          dole.
        </p>

        <p
          v-for="(message, index) in messages"
          :key="index"
          :class="message.from === 'me' ? bubbleMe : bubbleApp"
        >
          {{ message.text }}
        </p>

        <div v-if="proposal" :class="[bubbleApp, 'flex flex-col gap-2']">
          <p class="font-semibold">Co se změní:</p>
          <ul class="list-disc pl-5">
            <li v-for="change in proposal.changes" :key="change">{{ change }}</li>
            <li v-if="proposal.changes.length === 0">V rozpisu se nic viditelně nezmění.</li>
          </ul>
          <div class="flex flex-wrap gap-2">
            <UiButton variant="primary" :disabled="sending" @click="emit('apply')">
              Použít změny
            </UiButton>
            <UiButton :disabled="sending" @click="emit('discard')">Zahodit</UiButton>
          </div>
        </div>

        <template v-else-if="current?.kind === 'source'">
          <div
            v-if="current.question.kind === 'period'"
            :class="[bubbleApp, 'flex flex-col gap-2']"
          >
            <p>
              Podklad neuvádí, odkdy dokdy platí. Teď počítám s obdobím
              {{ formatDateRange(current.question.assumed.from, current.question.assumed.to) }}. Na
              jaké období platí?
            </p>
            <form class="flex flex-wrap items-end gap-2" @submit.prevent="savePeriod">
              <label class="flex flex-col gap-1 text-xs font-medium">
                Od
                <input v-model="periodFrom" type="date" class="field-input" />
              </label>
              <label class="flex flex-col gap-1 text-xs font-medium">
                Do
                <input v-model="periodTo" type="date" class="field-input" />
              </label>
              <UiButton variant="primary" type="submit" :disabled="sending">Uložit</UiButton>
              <UiButton :disabled="sending" @click="skip(current.question)">Nevím</UiButton>
            </form>
            <p v-if="periodError" role="alert" class="text-warn">{{ periodError }}</p>
          </div>

          <div
            v-else-if="current.question.kind === 'shift'"
            :class="[bubbleApp, 'flex flex-col gap-2']"
          >
            <p>
              {{ formatDayShort(current.question.firstDate) }} jsem přečetl „{{
                current.question.raw
              }}“ jako {{ current.question.start }}–{{ current.question.end
              }}<template v-if="current.question.count > 1">
                (v rozpisu {{ current.question.count }}×)</template
              >. Je to tak?
            </p>
            <form
              v-if="retiming"
              class="flex flex-wrap items-end gap-2"
              @submit.prevent="saveTime(current.question)"
            >
              <label class="flex flex-col gap-1 text-xs font-medium">
                Od
                <input v-model="newStart" type="time" class="field-input" />
              </label>
              <label class="flex flex-col gap-1 text-xs font-medium">
                Do
                <input v-model="newEnd" type="time" class="field-input" />
              </label>
              <UiButton variant="primary" type="submit" :disabled="sending">Uložit</UiButton>
              <UiButton :disabled="sending" @click="retiming = false">Zpět</UiButton>
            </form>
            <div v-else class="flex flex-wrap gap-2">
              <UiButton
                variant="primary"
                :disabled="sending"
                @click="shiftAnswer(current.question, { type: 'correct' }, 'Ano, je to tak.')"
              >
                Ano
              </UiButton>
              <UiButton :disabled="sending" @click="retiming = true">Jiný čas</UiButton>
              <UiButton
                :disabled="sending"
                @click="shiftAnswer(current.question, { type: 'remove' }, 'Není to směna.')"
              >
                Není to směna
              </UiButton>
              <UiButton :disabled="sending" @click="skip(current.question)">Nevím</UiButton>
            </div>
          </div>

          <div v-else :class="[bubbleApp, 'flex flex-col gap-2']">
            <p>
              Rozvrh vychází na státní svátek:
              {{
                current.question.holidays
                  .map((holiday) => `${formatDayShort(holiday.date)} (${holiday.name})`)
                  .join(', ')
              }}. Platí i ve svátek?
            </p>
            <div class="flex flex-wrap gap-2">
              <UiButton
                variant="primary"
                :disabled="sending"
                @click="answer([{ kind: 'holiday', applies: false }], 'Ve svátek neplatí.')"
              >
                Ve svátek neplatí
              </UiButton>
              <UiButton
                :disabled="sending"
                @click="answer([{ kind: 'holiday', applies: true }], 'Platí i ve svátek.')"
              >
                Platí
              </UiButton>
              <UiButton :disabled="sending" @click="skip(current.question)">Nevím</UiButton>
            </div>
          </div>
        </template>

        <div v-else-if="current?.kind === 'parity'" :class="[bubbleApp, 'flex flex-col gap-2']">
          <p>
            Rozvrh má bloky jen v lichých nebo jen v sudých týdnech. Týden
            {{ formatWeek(current.question.date) }} je lichý, nebo sudý? Dokud neodpovíš, počítám s
            oběma.
          </p>
          <div class="flex gap-2">
            <UiButton :disabled="sending" @click="emit('parity', current.question, true)">
              Lichý
            </UiButton>
            <UiButton :disabled="sending" @click="emit('parity', current.question, false)">
              Sudý
            </UiButton>
          </div>
        </div>

        <p v-else :class="bubbleApp">
          Díky, víc se ptát nemusím. Kdyby bylo potřeba něco upravit, napiš to dole.
        </p>

        <p v-if="current && !proposal && remaining > 0" class="self-start text-xs text-muted">
          Zbývá ještě {{ remaining }}
          {{ remaining === 1 ? 'otázka' : remaining < 5 ? 'otázky' : 'otázek' }}.
        </p>
        <p v-if="error" role="alert" class="self-start font-medium text-warn">{{ error }}</p>
      </div>

      <form class="flex gap-2 border-t border-line px-4 py-3" @submit.prevent="send">
        <label for="review-message" class="sr-only">Odpověď vlastními slovy</label>
        <input
          id="review-message"
          v-model="draft"
          class="field-input min-w-0 flex-1"
          maxlength="500"
          autocomplete="off"
          placeholder="Napiš vlastními slovy, třeba: platí do konce února, o Vánocích nepracuju"
          :disabled="sending"
        />
        <UiButton variant="primary" type="submit" :disabled="sending || !draft.trim()">
          {{ sending ? 'Pracuji…' : 'Poslat' }}
        </UiButton>
      </form>
    </div>
  </dialog>
</template>
