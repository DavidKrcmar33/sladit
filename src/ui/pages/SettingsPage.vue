<script setup lang="ts">
import { useSession } from '@/session'
import CalendarCard from '@/ui/components/CalendarCard.vue'

const { state, calendarConnectUrl, setCalendarAutoWrite, syncCalendar, disconnectCalendar } =
  useSession()
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto px-8 py-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">Nastavení</h1>
      <p class="text-[15px] text-muted">Propojení s dalšími aplikacemi.</p>
    </div>
    <div class="flex max-w-md flex-col gap-4">
      <CalendarCard
        :status="state.calendar"
        :connect-url="calendarConnectUrl"
        @auto-write="setCalendarAutoWrite"
        @sync="syncCalendar"
        @disconnect="disconnectCalendar"
      />
      <p v-if="state.calendar?.state === 'unavailable'" class="text-muted">
        Google Kalendář teď připojit nejde, server ho nemá nastavený.
      </p>
    </div>
  </div>
</template>
