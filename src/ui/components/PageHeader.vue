<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import UiIcon, { type IconName } from './UiIcon.vue'

const props = defineProps<{
  surface?: boolean
  stableLayout?: boolean
  matchImageHeight?: boolean
  title: string
  titleId?: string
  subtitle?: string
  imageSrc?: string
  imageAlt?: string
  placeholderIcon?: IconName
}>()
const textBlock = useTemplateRef<HTMLElement>('textBlock')
const textHeight = ref(0)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!props.matchImageHeight || !textBlock.value) return
  observer = new ResizeObserver(([entry]) => {
    if (entry) textHeight.value = entry.contentRect.height
  })
  observer.observe(textBlock.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <header
    class="flex min-h-40 w-full shrink-0 flex-wrap gap-4 sm:gap-5"
    :class="
      surface ? 'action-surface items-center' : 'items-start border-b border-line py-5 lg:py-6'
    "
  >
    <div
      v-if="imageSrc || placeholderIcon"
      :style="
        matchImageHeight && textHeight
          ? {
              width: `min(${textHeight}px, 24vw, 12rem)`,
              height: `min(${textHeight}px, 24vw, 12rem)`,
            }
          : undefined
      "
      class="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-accent"
      :class="surface ? 'size-20 sm:size-24' : 'size-16 sm:size-20'"
    >
      <img v-if="imageSrc" :src="imageSrc" :alt="imageAlt ?? ''" class="size-full object-cover" />
      <UiIcon v-else-if="placeholderIcon" :name="placeholderIcon" :size="32" />
    </div>
    <div ref="textBlock" class="min-w-0 flex-1" :class="stableLayout ? 'basis-0' : 'basis-40'">
      <div class="flex items-start gap-3">
        <h1
          :id="titleId"
          :title="stableLayout ? title : undefined"
          :class="stableLayout ? 'h-9 truncate sm:h-10' : 'break-words'"
          class="min-w-0 text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
        >
          {{ title }}
        </h1>
        <div v-if="$slots.iconActions" class="flex shrink-0 items-center gap-2">
          <slot name="iconActions" />
        </div>
      </div>
      <p v-if="subtitle" class="mt-2 text-[15px] text-muted">{{ subtitle }}</p>
      <div v-if="$slots.meta" class="mt-2 flex flex-col gap-2 text-sm text-muted">
        <slot name="meta" />
      </div>
      <div v-if="$slots.status" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <slot name="status" />
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2 max-sm:basis-full">
      <slot name="actions" />
    </div>
  </header>
</template>
