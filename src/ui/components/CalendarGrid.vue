<script setup lang="ts">
import type { CalendarDay, CalendarView, PersonDay } from '@/core/calendar'
import { describeCalendarDay, formatDayHeader, formatDayLong } from '@/ui/format'
import CalendarCell from './CalendarCell.vue'

const props = defineProps<{ calendar: CalendarView; selectedDay: PersonDay | null }>()
const emit = defineEmits<{ select: [day: PersonDay]; 'edit-person': [personId: string] }>()

function isSelected(personId: string, date: string): boolean {
  return props.selectedDay?.personId === personId && props.selectedDay.date === date
}

function cellLabel(personName: string, date: string, day: CalendarDay): string {
  return `${personName}, ${formatDayLong(date)}: ${describeCalendarDay(day)}`
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full border-separate border-spacing-1.5">
      <thead>
        <tr>
          <td class="w-20" />
          <th
            v-for="date in calendar.dates"
            :key="date"
            scope="col"
            class="pb-1 text-center font-medium text-muted"
          >
            {{ formatDayHeader(date) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in calendar.rows" :key="row.personId">
          <th scope="row" class="max-w-28 pr-2 text-left font-medium">
            <span class="block truncate">{{ row.personName }}</span>
            <span v-if="row.isPrivate" class="block text-xs font-normal text-muted">
              jen může / nemůže
            </span>
            <button
              v-else
              type="button"
              :aria-label="`Upravit podklady: ${row.personName}`"
              class="text-xs font-normal text-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              @click="emit('edit-person', row.personId)"
            >
              Podklady
            </button>
          </th>
          <td v-for="(day, index) in row.days" :key="calendar.dates[index]">
            <CalendarCell
              :day="day"
              :label="cellLabel(row.personName, calendar.dates[index], day)"
              :selected="isSelected(row.personId, calendar.dates[index])"
              :readonly="row.isPrivate ?? false"
              @select="emit('select', { personId: row.personId, date: calendar.dates[index] })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
