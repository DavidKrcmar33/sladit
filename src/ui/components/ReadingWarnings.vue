<script setup lang="ts">
import type { PersonWarnings } from '@/core/calendar'
import UiIcon from './UiIcon.vue'

defineProps<{
  items: PersonWarnings[]
  /** Poznámky z mých podkladů: text → id podkladu. Jen ty jde skrýt. */
  dismissable?: Record<string, string>
}>()
const emit = defineEmits<{ dismiss: [sourceId: string, warning: string] }>()
</script>

<template>
  <section
    aria-labelledby="reading-warnings-title"
    class="flex flex-col gap-1.5 rounded-lg bg-warn-soft px-4 py-3 text-warn"
  >
    <h2 id="reading-warnings-title" class="font-semibold">Poznámky ke čtení</h2>
    <ul class="flex flex-col gap-1">
      <template v-for="item in items" :key="item.personId">
        <li v-for="warning in item.warnings" :key="warning" class="flex items-start gap-2">
          <span class="min-w-0 flex-1">
            <span class="font-semibold">{{ item.personName }}:</span> {{ warning }}
          </span>
          <button
            v-if="dismissable?.[warning]"
            type="button"
            aria-label="Skrýt poznámku"
            title="Skrýt poznámku"
            class="-my-1 flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-warn"
            @click="emit('dismiss', dismissable[warning], warning)"
          >
            <UiIcon name="close" :size="14" />
          </button>
        </li>
      </template>
    </ul>
  </section>
</template>
