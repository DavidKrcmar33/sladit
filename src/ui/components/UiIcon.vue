<script setup lang="ts">
export type IconName = 'check' | 'close' | 'arrow-right' | 'plus'

const { name, size = 16 } = defineProps<{ name: IconName; size?: number }>()

const paths: Record<IconName, string[]> = {
  check: ['M5 12l5 5 9-10'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
}
</script>

<template>
  <svg
    aria-hidden="true"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path v-for="path in paths[name]" :key="path" :d="path" />
  </svg>
</template>
