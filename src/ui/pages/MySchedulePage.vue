<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { CALENDAR_CIRCLE, type ParityQuestion } from '@/core/compose'
import { SCHOOL_CIRCLE, WORK_CIRCLE, type Shift } from '@/core/schema'
import { addDays } from '@/core/time'
import { useSession } from '@/session'
import CalendarLegend from '@/ui/components/CalendarLegend.vue'
import DayEditor from '@/ui/components/DayEditor.vue'
import MonthGrid from '@/ui/components/MonthGrid.vue'
import ParityQuestions from '@/ui/components/ParityQuestions.vue'
import PasteTextDialog from '@/ui/components/PasteTextDialog.vue'
import ReadingWarnings from '@/ui/components/ReadingWarnings.vue'
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
  renameMe,
  selectDay,
  saveDayShifts,
  clearDayOverride,
  removeSource,
  changeSourceCircle,
  answerWeekParity,
  shiftSchedule,
  fileBlob,
} = useSession()

/** Třetí okruh pro druhou práci: její rozpis musí den pokrýt taky, jinak den neznáme. */
const EXTRA_CIRCLE = 'Další práce'

const dropZone = useTemplateRef<InstanceType<typeof SourceDropZone>>('dropZone')
const isPastingText = ref(false)
const fileError = ref<string | null>(null)
const editingName = ref(false)
const nameDraft = ref('')
const nameError = ref<string | null>(null)

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
const period = computed(() => formatDateRange(state.scheduleFrom, addDays(state.scheduleFrom, 27)))

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

function startRename() {
  nameDraft.value = me.value?.name ?? ''
  nameError.value = null
  editingName.value = true
}

async function saveName() {
  nameError.value = await renameMe(nameDraft.value)
  if (!nameError.value) editingName.value = false
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
  <div class="flex h-full flex-wrap content-start gap-8 overflow-auto px-8 py-6">
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
        <div class="flex flex-wrap items-center gap-2 text-muted">
          <template v-if="!editingName">
            Ostatní tě vidí jako <strong class="text-ink">{{ me?.name }}</strong>
            <UiButton variant="ghost" @click="startRename">Změnit</UiButton>
          </template>
          <form v-else class="flex flex-wrap items-center gap-2" @submit.prevent="saveName">
            <label for="my-name">Jméno</label>
            <input id="my-name" v-model="nameDraft" class="field-input" maxlength="80" />
            <UiButton variant="primary" type="submit">Uložit</UiButton>
            <UiButton @click="editingName = false">Zrušit</UiButton>
            <span v-if="nameError" role="alert" class="text-warn">{{ nameError }}</span>
          </form>
        </div>
      </div>

      <UncertainNotice
        v-if="scheduleUncertainDays.length > 0"
        :count="scheduleUncertainDays.length"
        :pivotal-count="0"
        @show-first="selectDay(scheduleUncertainDays[0])"
      />
      <ParityQuestions
        v-if="scheduleParityQuestions.length > 0"
        :questions="scheduleParityQuestions"
        @answer="answerParity"
      />
      <ReadingWarnings v-if="scheduleWarnings.length > 0" :items="scheduleWarnings" />

      <div class="flex flex-wrap items-center justify-between gap-2">
        <UiButton variant="ghost" @click="shiftSchedule(-1)">← Předchozí týden</UiButton>
        <p class="font-medium">{{ period }}</p>
        <UiButton variant="ghost" @click="shiftSchedule(1)">Další týden →</UiButton>
      </div>
      <template v-if="scheduleCalendar">
        <MonthGrid
          :calendar="scheduleCalendar"
          :selected-day="state.selectedDay"
          @select="selectDay($event)"
        />
        <CalendarLegend />
      </template>
      <p v-if="sources.length === 0" class="text-muted">
        Zatím tu nic není: dny bez podkladu jsou „nevíme“. Nahraj podklad vpravo, nebo klikni na den
        a zadej ho ručně.
      </p>

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

    <aside class="flex min-w-0 max-w-sm flex-[1_1_300px] flex-col gap-4">
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
            <UiButton
              variant="danger"
              :aria-label="`Odebrat podklad ${fileNames(source.files)}`"
              @click="removeSource(source.id)"
            >
              Odebrat
            </UiButton>
          </li>
        </ul>
      </section>
    </aside>

    <PasteTextDialog v-if="isPastingText" @submit="submitText" @close="isPastingText = false" />
  </div>
</template>
