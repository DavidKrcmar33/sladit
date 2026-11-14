<script setup lang="ts">
import UiButton from './UiButton.vue'
import UiIcon from './UiIcon.vue'

defineProps<{ summary: string; actionLabel: string; blocker: string | null }>()
const emit = defineEmits<{ continue: [] }>()
</script>

<template>
  <footer
    class="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-white px-8 py-3.5"
  >
    <div class="flex flex-col gap-0.5">
      <p class="font-semibold">{{ summary }}</p>
      <p v-if="blocker" id="step-footer-blocker" class="text-muted">{{ blocker }}</p>
    </div>
    <UiButton
      variant="primary"
      :disabled="blocker !== null"
      :aria-describedby="blocker ? 'step-footer-blocker' : undefined"
      @click="emit('continue')"
    >
      {{ actionLabel }}
      <UiIcon name="arrow-right" :size="18" />
    </UiButton>
  </footer>
</template>
