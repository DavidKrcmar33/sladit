<script setup lang="ts">
import UiButton from './UiButton.vue'

defineProps<{ count: number }>()
const emit = defineEmits<{ showFirst: [] }>()
</script>

<template>
  <div
    role="status"
    class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft py-1.5 pr-1.5 pl-4 text-warn"
  >
    <p>
      <span class="font-semibold">Nejistá čtení: {{ count }}</span> · zkontroluj je podle podkladů
    </p>
    <UiButton variant="danger" @click="emit('showFirst')">Ukázat</UiButton>
  </div>
</template>
