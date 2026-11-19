<script setup lang="ts">
import type { ParityQuestion } from '@/core/compose'
import { formatWeek } from '@/ui/format'
import UiButton from './UiButton.vue'

defineProps<{ questions: ParityQuestion[] }>()
const emit = defineEmits<{ answer: [question: ParityQuestion, odd: boolean] }>()
</script>

<template>
  <section
    aria-labelledby="parity-title"
    class="flex flex-col gap-2 rounded-xl border border-line bg-white p-4"
  >
    <h2 id="parity-title" class="font-semibold">Lichý a sudý týden</h2>
    <p class="text-muted">
      Rozvrh má bloky jen v lichých nebo jen v sudých týdnech. Fakulty je počítají různě, proto se
      ptáme. Dokud neodpovíš, počítá se s oběma.
    </p>
    <ul class="flex flex-col gap-2">
      <li
        v-for="question in questions"
        :key="`${question.sourceId}-${question.date}`"
        class="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span>
          <span class="font-semibold">{{ question.personName }}</span>: týden
          {{ formatWeek(question.date) }} je
        </span>
        <span class="flex gap-2">
          <UiButton
            :variant="question.answer === 'odd' ? 'primary' : 'secondary'"
            :aria-pressed="question.answer === 'odd'"
            @click="emit('answer', question, true)"
          >
            lichý
          </UiButton>
          <UiButton
            :variant="question.answer === 'even' ? 'primary' : 'secondary'"
            :aria-pressed="question.answer === 'even'"
            @click="emit('answer', question, false)"
          >
            sudý
          </UiButton>
        </span>
      </li>
    </ul>
  </section>
</template>
