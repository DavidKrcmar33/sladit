<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarDay, CalendarView, PersonDay } from '@/core/calendar'
import { describeCalendarDay, formatDayLong } from '@/ui/format'
import CalendarCell from './CalendarCell.vue'

/** Můj rozvrh po týdnech: řádek je týden, sloupec den v týdnu. */
const props = defineProps<{ calendar: CalendarView; selectedDay: PersonDay | null }>()
const emit = defineEmits<{ select: [day: PersonDay] }>()

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

const row = computed(() => props.calendar.rows[0])

const weeks = computed(() => {
  const result: { date: string; day: CalendarDay }[][] = []
  props.calendar.dates.forEach((date, index) => {
    if (index % 7 === 0) result.push([])
    result.at(-1)!.push({ date, day: row.value.days[index] })
  })
  return result
})

function dayNumber(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(day)}. ${Number(month)}.`
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full table-fixed border-separate border-spacing-1 sm:border-spacing-1.5">
      <thead>
        <tr>
          <th
            v-for="weekday in WEEKDAYS"
            :key="weekday"
            scope="col"
            class="pb-1 text-center font-medium text-muted"
          >
            {{ weekday }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="week in weeks" :key="week[0].date">
          <td v-for="item in week" :key="item.date" class="align-top">
            <span class="block pb-0.5 text-center text-xs text-muted">
              {{ dayNumber(item.date) }}
            </span>
            <CalendarCell
              :day="item.day"
              :label="`${formatDayLong(item.date)}: ${describeCalendarDay(item.day)}`"
              :selected="selectedDay?.date === item.date"
              compact
              @select="emit('select', { personId: row.personId, date: item.date })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
