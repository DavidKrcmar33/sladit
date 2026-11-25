<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'
import type { CalendarDay, CalendarView, PersonDay } from '@/core/calendar'
import { describeCalendarDay, formatDayHeader, formatDayLong } from '@/ui/format'
import CalendarCell from './CalendarCell.vue'

const props = defineProps<{
  calendar: CalendarView
  selectedDay: PersonDay | null
  /** Den navrženého nebo nejlepšího termínu: jeho sloupec je zvýrazněný. */
  highlightDate?: string | null
  /** Kolik lidí nejvíc může v nějakém čase každého dne. Bez něj hlavička jen ukazuje den. */
  dayBest?: number[]
  /** Den otevřený ve výběru času. */
  pickedDate?: string | null
}>()
const emit = defineEmits<{
  select: [day: PersonDay]
  'edit-person': [personId: string]
  'pick-day': [date: string]
}>()

const scroller = useTemplateRef<HTMLElement>('scroller')

/** Na úzké obrazovce kalendář roluje do strany: sloupec termínu posune do záběru. */
async function revealHighlight() {
  await nextTick()
  const box = scroller.value
  const column = box?.querySelector<HTMLElement>('[data-highlight]')
  if (!box || !column || box.scrollWidth <= box.clientWidth) return
  box.scrollLeft = column.offsetLeft - (box.clientWidth - column.offsetWidth) / 2
}

onMounted(revealHighlight)
watch(() => props.highlightDate, revealHighlight)

function isSelected(personId: string, date: string): boolean {
  return props.selectedDay?.personId === personId && props.selectedDay.date === date
}

function cellLabel(personName: string, date: string, day: CalendarDay): string {
  return `${personName}, ${formatDayLong(date)}: ${describeCalendarDay(day)}`
}
</script>

<template>
  <div ref="scroller" class="overflow-x-auto">
    <table class="w-full border-separate border-spacing-1.5">
      <thead>
        <tr>
          <td class="sticky left-0 z-10 w-20 bg-ground" />
          <th
            v-for="date in calendar.dates"
            :key="date"
            scope="col"
            :data-highlight="date === highlightDate || undefined"
            :class="[
              'pb-1 text-center',
              date === highlightDate ? 'font-semibold text-accent-dark' : 'font-medium text-muted',
            ]"
          >
            <button
              v-if="dayBest"
              type="button"
              :aria-pressed="date === pickedDate"
              :aria-label="`Vybrat čas, ${formatDayLong(date)} (může nejvíc ${dayBest[calendar.dates.indexOf(date)] ?? 0} z ${calendar.rows.length})`"
              :class="[
                'mx-auto flex flex-col items-center rounded-lg px-2 py-0.5',
                'focus-visible:outline-2 focus-visible:outline-accent',
                date === pickedDate
                  ? 'bg-accent text-white hover:bg-accent-dark'
                  : date === highlightDate
                    ? 'bg-accent-soft hover:brightness-95'
                    : 'hover:bg-panel',
              ]"
              @click="emit('pick-day', date)"
            >
              <span>{{ formatDayHeader(date) }}</span>
              <span class="text-[11px] font-normal">
                {{ dayBest[calendar.dates.indexOf(date)] ?? 0 }}/{{ calendar.rows.length }}
              </span>
            </button>
            <span
              v-else
              :class="date === highlightDate && 'rounded-full bg-accent-soft px-2 py-0.5'"
              :title="date === highlightDate ? 'Den termínu' : undefined"
            >
              {{ formatDayHeader(date) }}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in calendar.rows" :key="row.personId">
          <th scope="row" class="sticky left-0 z-10 max-w-28 bg-ground pr-2 text-left font-medium">
            <span class="block truncate">{{ row.personName }}</span>
            <button
              v-if="!row.isPrivate"
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
              :highlighted="calendar.dates[index] === highlightDate"
              @select="emit('select', { personId: row.personId, date: calendar.dates[index] })"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
