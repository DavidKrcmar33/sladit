<script setup lang="ts">
import type { PersonWarnings } from '@/core/calendar'

defineProps<{ items: PersonWarnings[] }>()
</script>

<template>
  <section
    aria-labelledby="reading-warnings-title"
    class="flex flex-col gap-1.5 rounded-lg bg-warn-soft px-4 py-3 text-warn"
  >
    <h2 id="reading-warnings-title" class="font-semibold">Poznámky ke čtení</h2>
    <ul class="flex flex-col gap-1">
      <template v-for="item in items" :key="item.personId">
        <li v-for="warning in item.warnings" :key="warning">
          <span class="font-semibold">{{ item.personName }}:</span> {{ warning }}
        </li>
      </template>
    </ul>
  </section>
</template>
