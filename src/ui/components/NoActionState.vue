<script setup lang="ts">
import UiButton from './UiButton.vue'

const emit = defineEmits<{ create: []; openSample: [] }>()
</script>

<template>
  <section class="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
    <div class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold tracking-tight">Zatím tu není žádná akce</h1>
      <p class="max-w-md text-base text-muted">
        Založ akci a přidej lidi s jejich rozpisy směn. Pak ti ukážeme, kdy můžou všichni.
      </p>
    </div>
    <div class="flex flex-wrap justify-center gap-3">
      <UiButton variant="primary" @click="emit('create')">Nová akce</UiButton>
      <UiButton @click="emit('openSample')">Otevřít ukázkovou akci</UiButton>
    </div>
  </section>
</template>
