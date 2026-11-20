<script setup lang="ts">
import type { CalendarStatus } from '@/contract/api'
import UiButton from './UiButton.vue'

const props = defineProps<{ status: CalendarStatus | null; connectUrl: string }>()
const emit = defineEmits<{ autoWrite: [value: boolean]; sync: []; disconnect: [] }>()

const syncedAt = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function connect() {
  location.href = props.connectUrl
}
</script>

<template>
  <section
    v-if="status && status.state !== 'unavailable'"
    aria-labelledby="calendar-card-title"
    class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
  >
    <h2 id="calendar-card-title" class="text-base font-semibold">Google Kalendář</h2>

    <template v-if="status.state === 'off'">
      <p class="text-muted">
        Aplikace z kalendáře čte jen časy, kdy v něm něco máš, bez názvů událostí. Potvrzené akce ti
        může zapsat do vlastního kalendáře „Sladit“.
      </p>
      <UiButton variant="primary" @click="connect">Připojit Google Kalendář</UiButton>
    </template>

    <template v-else-if="status.state === 'expired'">
      <p role="alert" class="text-warn">
        Přístup ke kalendáři vypršel. V testovacím režimu Googlu se to stává po 7 dnech. Obsazenost
        z něj se teď nepočítá.
      </p>
      <UiButton variant="primary" @click="connect">Připojit znovu</UiButton>
      <UiButton variant="ghost" @click="emit('disconnect')">Odpojit</UiButton>
    </template>

    <template v-else>
      <p class="text-muted">
        Připojeno. Obsazené časy z kalendáře jsou v rozpisu jako „Kalendář“ a ostatní z nich uvidí
        jen, že nemůžeš.
        <template v-if="status.syncedAt">
          Naposledy načteno {{ syncedAt.format(new Date(status.syncedAt)) }}.
        </template>
      </p>
      <label class="flex items-start gap-2">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="status.autoWrite"
          :disabled="!status.canWrite"
          @change="emit('autoWrite', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          Potvrzené akce zapisovat do kalendáře automaticky
          <span class="block text-xs text-muted">
            <template v-if="!status.canWrite">
              Při připojení nebyl povolený zápis. Připoj kalendář znovu a zápis povol.
            </template>
            <template v-else>Když je to vypnuté, aplikace se u každé akce zeptá.</template>
          </span>
        </span>
      </label>
      <div class="flex flex-wrap gap-2">
        <UiButton @click="emit('sync')">Načíst znovu</UiButton>
        <UiButton variant="ghost" @click="emit('disconnect')">Odpojit</UiButton>
      </div>
    </template>
  </section>
</template>
