<script setup lang="ts">
import { computed } from 'vue'
import { dayStatus } from '@/core/calendar'
import type { Shift } from '@/core/schema'
import { useSession } from '@/session'
import CalendarGrid from '@/ui/components/CalendarGrid.vue'
import CalendarLegend from '@/ui/components/CalendarLegend.vue'
import DayEditor from '@/ui/components/DayEditor.vue'
import ProposalList from '@/ui/components/ProposalList.vue'
import UncertainNotice from '@/ui/components/UncertainNotice.vue'

const {
  state,
  selectedAction,
  calendar,
  uncertainDays,
  proposals,
  selectDay,
  saveDayShifts,
  fileBlob,
} = useSession()

const people = computed(() => selectedAction.value?.people ?? [])

const editedDay = computed(() => {
  const day = state.selectedDay
  const person = day && people.value.find((candidate) => candidate.id === day.personId)
  if (!day || !person) return null

  const status = dayStatus(person.schedule, day.date)
  return {
    key: `${person.id}-${day.date}`,
    person,
    date: day.date,
    shifts: status.kind === 'working' ? status.shifts : [],
    isKnown: status.kind !== 'unknown',
    sources: person.files.map((file) => ({ file, blob: fileBlob(file.id) })),
  }
})

function saveEditedDay(shifts: Shift[]) {
  if (!editedDay.value) return
  saveDayShifts(editedDay.value.person.id, editedDay.value.date, shifts)
  selectDay(null)
}
</script>

<template>
  <div class="flex h-full flex-wrap content-start gap-8 overflow-auto px-8 py-6">
    <section
      aria-labelledby="calendar-title"
      class="flex min-w-0 flex-[999_1_560px] flex-col gap-4"
    >
      <div class="flex flex-col gap-1">
        <h1 id="calendar-title" class="text-2xl font-semibold tracking-tight">Kalendář</h1>
        <p class="text-[15px] text-muted">Klikni na kterýkoli den a oprav ho.</p>
      </div>

      <UncertainNotice
        v-if="uncertainDays.length > 0"
        :count="uncertainDays.length"
        @show-first="selectDay(uncertainDays[0])"
      />

      <p v-if="people.length === 0" class="text-muted">V akci zatím nikdo není.</p>
      <template v-else-if="calendar">
        <CalendarGrid
          :calendar="calendar"
          :selected-day="state.selectedDay"
          @select="selectDay($event)"
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
        :sources="editedDay.sources"
        @save="saveEditedDay"
        @close="selectDay(null)"
      />
    </section>

    <aside class="min-w-0 max-w-sm flex-[1_1_300px]">
      <ProposalList :proposals="proposals" :people="people" />
    </aside>
  </div>
</template>
