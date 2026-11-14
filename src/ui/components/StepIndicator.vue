<script setup lang="ts" generic="StepId extends string">
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  steps: { id: StepId; label: string; available: boolean }[]
  currentStepId: StepId
}>()
const emit = defineEmits<{ select: [stepId: StepId] }>()

const currentIndex = computed(() =>
  props.steps.findIndex((step) => step.id === props.currentStepId),
)
</script>

<template>
  <ol aria-label="Postup" class="flex flex-wrap items-center gap-2.5">
    <template v-for="(step, index) in steps" :key="step.id">
      <li v-if="index > 0" aria-hidden="true">
        <div :class="['h-0.5 w-7', index <= currentIndex ? 'bg-accent' : 'bg-line-strong']" />
      </li>
      <li>
        <span
          v-if="index === currentIndex"
          aria-current="step"
          class="flex min-h-11 items-center gap-2 font-semibold"
        >
          <span
            class="flex size-7 items-center justify-center rounded-full bg-accent text-xs text-white"
          >
            {{ index + 1 }}
          </span>
          {{ step.label }}
        </span>
        <button
          v-else
          type="button"
          :disabled="!step.available"
          :class="[
            'flex min-h-11 items-center gap-2 rounded-lg px-1 disabled:cursor-not-allowed',
            index < currentIndex ? 'font-medium text-ink hover:text-accent-dark' : 'text-muted',
          ]"
          @click="emit('select', step.id)"
        >
          <span
            v-if="index < currentIndex"
            class="flex size-7 items-center justify-center rounded-full bg-accent-soft text-accent-dark"
          >
            <UiIcon name="check" :size="14" />
            <span class="sr-only">Hotovo:</span>
          </span>
          <span
            v-else
            class="flex size-7 items-center justify-center rounded-full border-[1.5px] border-outline text-xs"
          >
            {{ index + 1 }}
          </span>
          {{ step.label }}
        </button>
      </li>
    </template>
  </ol>
</template>
