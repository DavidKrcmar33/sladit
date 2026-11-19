<script setup lang="ts">
import { computed } from 'vue'
import { dayStatus } from '@/core/calendar'
import type { ParityQuestion } from '@/core/compose'
import type { Shift } from '@/core/schema'
import { useSession } from '@/session'
import CalendarGrid from '@/ui/components/CalendarGrid.vue'
import CalendarLegend from '@/ui/components/CalendarLegend.vue'
import DayEditor from '@/ui/components/DayEditor.vue'
import ParityQuestions from '@/ui/components/ParityQuestions.vue'
import ProposalList from '@/ui/components/ProposalList.vue'
import { describeAvailability } from '@/ui/format'
import ReadingWarnings from '@/ui/components/ReadingWarnings.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UncertainNotice from '@/ui/components/UncertainNotice.vue'

const {
  state,
  selectedAction,
  calendar,
  composedPeople,
  stability,
  uncertainDays,
  pivotalUncertainCount,
  readingWarnings,
  proposals,
  parityQuestions,
  selectDay,
  saveDayShifts,
  clearDayOverride,
  answerWeekParity,
  editPersonInIntake,
  goToStep,
  fileBlob,
} = useSession()

const people = computed(() => selectedAction.value?.people ?? [])

const editedDay = computed(() => {
  const day = state.selectedDay
  const person = day && people.value.find((candidate) => candidate.id === day.personId)
  const composed = day && composedPeople.value.find((candidate) => candidate.id === day.personId)
  if (!day || !person || !composed) return null

  const status = dayStatus(composed.schedule, day.date)
  const row = calendar.value?.rows.find((candidate) => candidate.personId === person.id)
  const calendarDay = row?.days[calendar.value!.dates.indexOf(day.date)]
  const files = person.sources.flatMap((source) => source.files)
  return {
    key: `${person.id}-${day.date}`,
    person,
    date: day.date,
    shifts: 'shifts' in status ? status.shifts : [],
    isKnown: status.kind !== 'unknown',
    hasOverride: person.overrides.some((override) => override.date === day.date),
    warnings: composed.schedule?.warnings ?? [],
    availabilityNote: calendarDay ? describeAvailability(calendarDay) : null,
    sources: files.map((file) => ({ file, blob: fileBlob(file.id) })),
  }
})

function saveEditedDay(shifts: Shift[]) {
  if (!editedDay.value) return
  saveDayShifts(editedDay.value.person.id, editedDay.value.date, shifts)
  selectDay(null)
}

function resetEditedDay() {
  if (!editedDay.value) return
  clearDayOverride(editedDay.value.person.id, editedDay.value.date)
  selectDay(null)
}

function answerParity(question: ParityQuestion, odd: boolean) {
  answerWeekParity(question.personId, question.sourceId, question.date, odd)
}
</script>

<template>
  <div class="flex h-full flex-wrap content-start gap-8 overflow-auto px-8 py-6">
    <section
      aria-labelledby="calendar-title"
      class="flex min-w-0 flex-[999_1_560px] flex-col gap-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h1 id="calendar-title" class="text-2xl font-semibold tracking-tight">Kalendář</h1>
          <p class="text-[15px] text-muted">
            Klikni na kterýkoli den a oprav ho. Pod jménem jde upravit podklady.
          </p>
        </div>
        <UiButton variant="dashed" @click="goToStep('intake')">
          <UiIcon name="plus" />
          Přidat člověka
        </UiButton>
      </div>

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

      <p v-if="people.length === 0" class="text-muted">V akci zatím nikdo není.</p>
      <template v-else-if="calendar">
        <CalendarGrid
          :calendar="calendar"
          :selected-day="state.selectedDay"
          @select="selectDay($event)"
          @edit-person="editPersonInIntake"
        />
        <CalendarLegend />
      </template>

      <DayEditor
        v-if="editedDay"
        :key="editedDay.key"
        :person-name="editedDay.person.name"
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

    <aside class="min-w-0 max-w-sm flex-[1_1_300px]">
      <ProposalList :proposals="proposals" :people="composedPeople" :stability="stability" />
    </aside>
  </div>
</template>
