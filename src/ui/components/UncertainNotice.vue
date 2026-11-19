<script setup lang="ts">
import UiButton from './UiButton.vue'

defineProps<{
  count: number
  /** Kolik z nich může změnit nejlepší termín. */
  pivotalCount: number
}>()
const emit = defineEmits<{ showFirst: [] }>()
</script>

<template>
  <div
    role="status"
    class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft py-1.5 pr-1.5 pl-4 text-warn"
  >
    <p>
      <span class="font-semibold">Nejistá čtení: {{ count }}</span> ·
      <template v-if="pivotalCount > 0">
        nejlepší termín závisí na {{ pivotalCount }} z nich, ukážeme je první
      </template>
      <template v-else>nejlepší termín na nich nestojí, i tak je zkontroluj</template>
    </p>
    <UiButton variant="danger" @click="emit('showFirst')">Ukázat</UiButton>
  </div>
</template>
