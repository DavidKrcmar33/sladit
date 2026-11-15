<script setup lang="ts">
import type { CalendarDay, CalendarView, PersonDay } from '@/core/calendar'
import { describeCalendarDay, formatDayHeader, formatDayLong } from '@/ui/format'
import CalendarCell from './CalendarCell.vue'

const props = defineProps<{ calendar: CalendarView; selectedDay: PersonDay | null }>()
const emit = defineEmits<{ select: [day: PersonDay] }>()

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
          <th scope="row" class="max-w-28 truncate pr-2 text-left font-medium">
            {{ row.personName }}
          </th>
          <td v-for="(day, index) in row.days" :key="calendar.dates[index]">
            <CalendarCell
              :day="day"
              :label="cellLabel(row.personName, calendar.dates[index], day)"
              :selected="isSelected(row.personId, calendar.dates[index])"
              @select="emit('select', { personId: row.personId, date: calendar.dates[index] })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
