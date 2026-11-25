<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { CALENDAR_CIRCLE, type ParityQuestion } from '@/core/compose'
import type { SourceAnswer } from '@/core/review'
import { SCHOOL_CIRCLE, WORK_CIRCLE, type Shift } from '@/core/schema'
import { addDays } from '@/core/time'
import { useSession } from '@/session'
import CalendarLegend from '@/ui/components/CalendarLegend.vue'
import DayEditor from '@/ui/components/DayEditor.vue'
import MonthGrid from '@/ui/components/MonthGrid.vue'
import ParityQuestions from '@/ui/components/ParityQuestions.vue'
import PasteTextDialog from '@/ui/components/PasteTextDialog.vue'
import ReadingWarnings from '@/ui/components/ReadingWarnings.vue'
import ReviewChat from '@/ui/components/ReviewChat.vue'
import SourceDropZone from '@/ui/components/SourceDropZone.vue'
import SourceFileChip from '@/ui/components/SourceFileChip.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UncertainNotice from '@/ui/components/UncertainNotice.vue'
import { editedDayOf } from '@/ui/editedDay'
import { formatDateRange } from '@/ui/format'

const {
  state,
  me,
  scheduleCalendar,
  scheduleComposed,
  scheduleParityQuestions,
  scheduleWarnings,
  scheduleUncertainDays,
  addFiles,
  addText,
  removePendingFile,
  readSchedule,
  selectDay,
  saveDayShifts,
  clearDayOverride,
  removeSource,
  changeSourceCircle,
  answerWeekParity,
  shiftSchedule,
  fileBlob,
  reviewSource,
  waitingReviews,
  openReview,
  closeReview,
  answerReview,
  sendReviewMessage,
  applyReviewProposal,
  discardReviewProposal,
  dismissWarning,
  warningSources,
} = useSession()

/** Třetí okruh pro druhou práci: její rozpis musí den pokrýt taky, jinak den neznáme. */
const EXTRA_CIRCLE = 'Další práce'

const dropZone = useTemplateRef<InstanceType<typeof SourceDropZone>>('dropZone')
const isPastingText = ref(false)
const fileError = ref<string | null>(null)

// Obsazenost z kalendáře je zdroj jen na čtení, ukazuje ji karta kalendáře.
const sources = computed(() =>
  (me.value?.sources ?? []).filter((source) => source.circle !== CALENDAR_CIRCLE),
)
const circleOptions = computed(() => [
  ...new Set([
    ...sources.value.map((source) => source.circle),
    WORK_CIRCLE,
    SCHOOL_CIRCLE,
    EXTRA_CIRCLE,
  ]),
])
/** Zatím žádný podklad ani ruční den: místo prázdné mřížky nejdřív výzva nahoře. */
const isEmpty = computed(
  () => sources.value.length === 0 && (me.value?.overrides.length ?? 0) === 0,
)
const period = computed(() => formatDateRange(state.scheduleFrom, addDays(state.scheduleFrom, 27)))

// Na lichý a sudý týden podkladu v okně doptání se ptá okno, u ostatních karta nad kalendářem.
const reviewParity = computed(() =>
  scheduleParityQuestions.value.filter((question) => question.sourceId === reviewSource.value?.id),
)
const otherParity = computed(() =>
  scheduleParityQuestions.value.filter((question) => question.sourceId !== reviewSource.value?.id),
)

function questionsLeft(count: number): string {
  if (count === 1) return 'zbývá 1 otázka'
  return count < 5 ? `zbývají ${count} otázky` : `zbývá ${count} otázek`
}

function answerReviewSource(answers: SourceAnswer[], echo: string) {
  if (reviewSource.value) void answerReview(reviewSource.value.id, answers, echo)
}

function sendReview(text: string) {
  if (reviewSource.value) void sendReviewMessage(reviewSource.value.id, text)
}

const editedDay = computed(() =>
  editedDayOf(
    state.selectedDay,
    me.value,
    scheduleComposed.value,
    scheduleCalendar.value,
    fileBlob,
  ),
)

function onFiles(files: File[]) {
  const rejected = addFiles(files)
  fileError.value = rejected.length ? `Tento formát neumíme přečíst: ${rejected.join(', ')}` : null
}

function submitText(text: string) {
  isPastingText.value = false
  addText(text)
}

function fileNames(files: { name: string }[]): string {
  return files.map((file) => file.name).join(', ')
}

function saveEditedDay(shifts: Shift[]) {
  if (!editedDay.value) return
  void saveDayShifts(editedDay.value.date, shifts)
  selectDay(null)
}

function resetEditedDay() {
  if (!editedDay.value) return
  void clearDayOverride(editedDay.value.date)
  selectDay(null)
}

function answerParity(question: ParityQuestion, odd: boolean) {
  void answerWeekParity(question.sourceId, question.date, odd)
}
</script>

<template>
  <div
    class="flex h-full flex-wrap content-start gap-6 overflow-auto px-4 py-5 sm:px-6 lg:gap-8 lg:px-8 lg:py-6"
  >
    <section
      aria-labelledby="schedule-title"
      class="flex min-w-0 flex-[999_1_560px] flex-col gap-4"
    >
      <div class="flex flex-col gap-1">
        <h1 id="schedule-title" class="text-2xl font-semibold tracking-tight">Můj rozvrh</h1>
        <p class="text-[15px] text-muted">
          Nahraj svůj rozpis směn, rozvrh nebo cokoli dalšího. AI ho přečte jednou a pak ho aplikace
          použije ve všech akcích. Ostatní z něj uvidí jen, kdy můžeš.
        </p>
      </div>

      <section
        v-if="isEmpty"
        aria-labelledby="empty-title"
        class="flex flex-col items-start gap-3 rounded-xl border-2 border-accent bg-white p-5"
      >
        <h2 id="empty-title" class="text-base font-semibold">Nahraj rozpis, ať víme, kdy můžeš</h2>
        <p class="text-muted">
          Stačí fotka, screenshot, PDF, Excel nebo zkopírovaný text. Dokud tu nic není, je u tebe
          každý den „nevíme“ a v akcích tě nejde započítat. Den můžeš zadat i ručně kliknutím do
          kalendáře.
        </p>
        <div class="flex flex-wrap gap-2">
          <UiButton variant="primary" @click="dropZone?.openFilePicker()">Nahrát rozpis</UiButton>
          <UiButton @click="isPastingText = true">Vložit rozpis jako text</UiButton>
        </div>
      </section>

      <ReviewChat
        v-if="reviewSource"
        :key="reviewSource.id"
        :file-names="fileNames(reviewSource.files)"
        :questions="reviewSource.questions ?? []"
        :parity-questions="reviewParity"
        :messages="state.review.messages[reviewSource.id] ?? []"
        :proposal="
          state.review.proposal?.sourceId === reviewSource.id ? state.review.proposal : null
        "
        :sending="state.review.sending"
        :error="state.review.error"
        @answer="answerReviewSource"
        @parity="answerParity"
        @send="sendReview"
        @apply="applyReviewProposal"
        @discard="discardReviewProposal"
        @close="closeReview"
      />
      <div
        v-for="source in waitingReviews"
        :key="source.id"
        role="status"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent-soft py-1.5 pr-1.5 pl-4 text-accent-dark"
      >
        <p>
          <span class="font-semibold">Doptání:</span> u podkladu {{ fileNames(source.files) }}
          {{ questionsLeft(source.questions?.length ?? 0) }}
        </p>
        <UiButton variant="ghost" @click="openReview(source.id)">Odpovědět</UiButton>
      </div>
      <UncertainNotice
        v-if="scheduleUncertainDays.length > 0"
        :count="scheduleUncertainDays.length"
        :pivotal-count="0"
        @show-first="selectDay(scheduleUncertainDays[0])"
      />
      <ParityQuestions
        v-if="otherParity.length > 0"
        :questions="otherParity"
        @answer="answerParity"
      />
      <ReadingWarnings
        v-if="scheduleWarnings.length > 0"
        :items="scheduleWarnings"
        :dismissable="warningSources"
        @dismiss="dismissWarning"
      />

      <div class="flex items-center justify-between gap-2">
        <UiButton variant="ghost" @click="shiftSchedule(-1)">
          ←<span class="max-sm:sr-only"> Předchozí týden</span>
        </UiButton>
        <p class="text-center font-medium">{{ period }}</p>
        <UiButton variant="ghost" @click="shiftSchedule(1)">
          <span class="max-sm:sr-only">Další týden </span>→
        </UiButton>
      </div>
      <template v-if="scheduleCalendar">
        <MonthGrid
          :calendar="scheduleCalendar"
          :selected-day="state.selectedDay"
          @select="selectDay($event)"
        />
        <CalendarLegend />
      </template>

      <DayEditor
        v-if="editedDay"
        :key="editedDay.key"
        :person-name="editedDay.personName"
        :date="editedDay.date"
        :shifts="editedDay.shifts"
        :is-known="editedDay.isKnown"
        :has-override="editedDay.hasOverride"
        :sources="editedDay.sources"
        :warnings="editedDay.warnings"
        :availability-note="editedDay.availabilityNote"
        @save="saveEditedDay"
        @reset="resetEditedDay"
        @close="selectDay(null)"
      />
    </section>

    <aside class="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-sm">
      <section
        aria-labelledby="upload-title"
        class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="upload-title" class="text-base font-semibold">Nahrát podklady</h2>
        <SourceDropZone ref="dropZone" compact @files="onFiles" />
        <div class="flex flex-wrap gap-2">
          <UiButton @click="dropZone?.openFilePicker()">Vybrat soubory</UiButton>
          <UiButton @click="isPastingText = true">Vložit text</UiButton>
        </div>
        <p class="text-muted">Excel, fotka, screenshot, PDF i text. Klidně víc najednou.</p>
        <ul v-if="state.pendingFiles.length > 0" class="flex flex-wrap gap-2">
          <li v-for="file in state.pendingFiles" :key="file.id" class="max-w-full">
            <SourceFileChip :file="file" @remove="removePendingFile(file.id)" />
          </li>
        </ul>
        <p v-if="fileError" role="alert" class="font-medium text-warn">{{ fileError }}</p>
        <p v-if="state.readError" role="alert" class="font-medium text-warn">
          {{ state.readError }}
        </p>
        <UiButton
          variant="primary"
          :disabled="state.pendingFiles.length === 0 || state.reading"
          @click="readSchedule"
        >
          {{ state.reading ? 'Čtu podklady…' : 'Přečíst podklady' }}
        </UiButton>
      </section>

      <section
        aria-labelledby="sources-title"
        class="flex flex-col rounded-xl border border-line bg-white p-5"
      >
        <h2 id="sources-title" class="pb-2 text-base font-semibold">
          Přečtené podklady: {{ sources.length }}
        </h2>
        <p v-if="sources.length === 0" class="text-muted">Zatím žádné.</p>
        <p v-else class="pb-2 text-muted">
          Okruh říká, co podklad pokrývá. Den je známý, jen když ho pokrývá každý okruh, třeba práce
          i škola.
        </p>
        <ul>
          <li
            v-for="source in sources"
            :key="source.id"
            class="flex items-center justify-between gap-2 border-t border-line py-2"
          >
            <div class="flex min-w-0 flex-col gap-1">
              <select
                :value="source.circle"
                :aria-label="`Okruh podkladu ${fileNames(source.files)}`"
                class="w-fit rounded border border-line bg-white px-1 py-0.5 text-xs"
                @change="changeSourceCircle(source.id, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="circle in circleOptions" :key="circle" :value="circle">
                  {{ circle }}
                </option>
              </select>
              <span class="truncate text-muted">{{ fileNames(source.files) }}</span>
            </div>
            <div class="flex shrink-0">
              <UiButton
                v-if="source.questions"
                variant="ghost"
                :aria-label="`Upřesnit podklad ${fileNames(source.files)}`"
                @click="openReview(source.id)"
              >
                Upřesnit
              </UiButton>
              <UiButton
                variant="danger"
                :aria-label="`Odebrat podklad ${fileNames(source.files)}`"
                @click="removeSource(source.id)"
              >
                Odebrat
              </UiButton>
            </div>
          </li>
        </ul>
      </section>
    </aside>

    <PasteTextDialog v-if="isPastingText" @submit="submitText" @close="isPastingText = false" />
  </div>
</template>
