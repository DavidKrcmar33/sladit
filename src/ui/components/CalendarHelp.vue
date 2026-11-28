<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import CalendarLegend from './CalendarLegend.vue'
import UiButton from './UiButton.vue'
import UiIcon from './UiIcon.vue'

const open = ref(false)
const id = useId()
const root = useTemplateRef<HTMLElement>('root')

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false
}
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    root.value?.querySelector('button')?.focus()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div ref="root" class="relative">
    <UiButton :aria-expanded="open" :aria-controls="id" @click="open = !open">
      <UiIcon name="circle-help" /> Nápověda
    </UiButton>
    <div
      v-if="open"
      :id="id"
      role="region"
      aria-label="Legenda kalendáře"
      class="absolute top-full right-0 z-30 mt-2 w-72 max-w-[calc(100vw-4rem)] rounded-xl bg-white p-4 text-sm shadow-lg ring-1 ring-line"
    >
      <CalendarLegend />
    </div>
  </div>
</template>
