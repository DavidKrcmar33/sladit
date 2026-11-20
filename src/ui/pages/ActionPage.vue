<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ParityQuestion } from '@/core/compose'
import type { Proposal, Shift } from '@/core/schema'
import { useSession } from '@/session'
import ActionPeople from '@/ui/components/ActionPeople.vue'
import CalendarGrid from '@/ui/components/CalendarGrid.vue'
import CalendarLegend from '@/ui/components/CalendarLegend.vue'
import DayEditor from '@/ui/components/DayEditor.vue'
import ParityQuestions from '@/ui/components/ParityQuestions.vue'
import ProposalList from '@/ui/components/ProposalList.vue'
import ReadingWarnings from '@/ui/components/ReadingWarnings.vue'
import SlotBanner from '@/ui/components/SlotBanner.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UncertainNotice from '@/ui/components/UncertainNotice.vue'
import { editedDayOf } from '@/ui/editedDay'

const {
  state,
  me,
  selectedResource,
  participants,
  calendar,
  composedPeople,
  stability,
  proposals,
  uncertainDays,
  pivotalUncertainCount,
  readingWarnings,
  parityQuestions,
  usesServerView,
  contacts,
  respondToAction,
  inviteToAction,
  cancelInvite,
  confirmSlot,
  respondToSlot,
  adoptCounter,
  selectDay,
  saveDayShifts,
  clearDayOverride,
  answerWeekParity,
  showSchedule,
  fileBlob,
  calendarPrompt,
  addToCalendar,
  removeFromCalendar,
  dismissCalendarPrompt,
  icsForSelectedAction,
} = useSession()

const leaving = ref(false)

const resource = computed(() => selectedResource.value!)
const takesPart = computed(() => resource.value.myStatus !== 'invited')
const hasSchedule = computed(
  () => (me.value?.sources.length ?? 0) + (me.value?.overrides.length ?? 0) > 0,
)

const editedDay = computed(() =>
  editedDayOf(state.selectedDay, me.value, composedPeople.value, calendar.value, fileBlob),
)

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

/** Stáhne potvrzený termín jako soubor .ics. */
function downloadIcs() {
  const file = icsForSelectedAction()
  if (!file) return
  const url = URL.createObjectURL(new Blob([file.content], { type: 'text/calendar' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** Ukládá se potvrzení nebo zápis do kalendáře: tlačítka kolem termínu počkají. */
const busy = computed(() => state.pending !== null)

const calendarConnected = computed(
  () => state.calendar?.state === 'connected' && state.calendar.canWrite,
)

/** Jiné termíny, které může účastník navrhnout místo navrženého. */
const alternatives = computed(() =>
  proposals.value.filter(
    (proposal) =>
      proposal.date !== resource.value.confirmed?.date ||
      proposal.start !== resource.value.confirmed?.start,
  ),
)

function confirm(proposal: Proposal) {
  void confirmSlot({ date: proposal.date, start: proposal.start, end: proposal.end })
}
</script>

<template>
  <div class="flex h-full flex-wrap content-start gap-8 overflow-auto px-8 py-6">
    <section
      aria-labelledby="calendar-title"
      class="flex min-w-0 flex-[999_1_560px] flex-col gap-4"
    >
      <div
        v-if="resource.myStatus === 'invited'"
        role="status"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-accent bg-white px-4 py-3"
      >
        <p>
          <strong>{{ resource.organizerName }}</strong> tě zve. Když pozvánku přijmeš, započítá se
          tvůj rozvrh a ostatní uvidí, kdy můžeš.
        </p>
        <div class="flex gap-2">
          <UiButton variant="primary" @click="respondToAction(true)">Přijmout</UiButton>
          <UiButton @click="respondToAction(false)">Odmítnout</UiButton>
        </div>
      </div>

      <SlotBanner
        v-if="resource.confirmed"
        :resource="resource"
        :proposed="resource.confirmed"
        :my-user-id="state.user?.id ?? null"
        :alternatives="alternatives"
        :pending="state.pending"
        :calendar-connected="calendarConnected"
        :calendar-prompt="calendarPrompt"
        @respond="respondToSlot"
        @adopt="adoptCounter"
        @withdraw="confirmSlot(null)"
        @add-to-calendar="addToCalendar"
        @remove-from-calendar="removeFromCalendar"
        @download-ics="downloadIcs"
      />

      <div
        v-if="calendarPrompt"
        role="status"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-accent bg-white px-4 py-3"
      >
        <p>Přidat termín do tvého Google Kalendáře?</p>
        <div class="flex gap-2">
          <UiButton variant="primary" :disabled="busy" @click="addToCalendar">
            {{ state.pending === 'calendar' ? 'Zapisuji…' : 'Přidat' }}
          </UiButton>
          <UiButton :disabled="busy" @click="dismissCalendarPrompt">Teď ne</UiButton>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <h1 id="calendar-title" class="text-2xl font-semibold tracking-tight">Kalendář</h1>
        <p class="text-[15px] text-muted">
          <template v-if="usesServerView">
            Svůj den opravíš kliknutím, platí pak ve všech akcích. U ostatních vidíš jen, zda můžou.
          </template>
          <template v-else>Svůj den opravíš kliknutím. Pozvi přátele, ať je s kým hledat.</template>
        </p>
      </div>

      <p v-if="takesPart && !hasSchedule" class="rounded-lg bg-warn-soft px-4 py-2 text-warn">
        Nemáš nahraný rozvrh, u tebe je všude „nevíme“.
        <button type="button" class="font-semibold underline" @click="showSchedule">
          Nahrát můj rozvrh
        </button>
      </p>

      <UncertainNotice
        v-if="uncertainDays.length > 0"
        :count="uncertainDays.length"
        :pivotal-count="pivotalUncertainCount"
        @show-first="selectDay(uncertainDays[0])"
      />
      <ParityQuestions
        v-if="parityQuestions.length > 0"
        :questions="parityQuestions"
        @answer="answerParity"
      />
      <ReadingWarnings v-if="readingWarnings.length > 0" :items="readingWarnings" />

      <template v-if="calendar && calendar.rows.length > 0">
        <CalendarGrid
          :calendar="calendar"
          :selected-day="state.selectedDay"
          @select="selectDay($event)"
          @edit-person="showSchedule"
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

      <div v-if="resource.myStatus === 'accepted'" class="border-t border-line pt-3">
        <div v-if="leaving" class="flex flex-wrap items-center gap-2">
          <span class="text-warn">Odejít z akce? Zmizí ti ze seznamu.</span>
          <UiButton variant="danger" @click="respondToAction(false)">Odejít</UiButton>
          <UiButton @click="leaving = false">Zůstat</UiButton>
        </div>
        <UiButton v-else variant="danger" @click="leaving = true">Odejít z akce</UiButton>
      </div>
    </section>

    <aside class="flex min-w-0 max-w-sm flex-[1_1_300px] flex-col gap-6">
      <ProposalList
        :proposals="proposals"
        :people="participants"
        :stability="stability"
        :can-confirm="resource.isOrganizer"
        :confirmed="resource.confirmed"
        :busy="state.pending !== null"
        :confirming="state.pending === 'confirm'"
        @confirm="confirm"
      />
      <ActionPeople
        :action="resource"
        :contacts="contacts"
        :groups="state.groups"
        @invite="inviteToAction"
        @cancel="cancelInvite"
      />
    </aside>
  </div>
</template>
