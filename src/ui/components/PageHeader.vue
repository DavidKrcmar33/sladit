<script setup lang="ts">
import UiIcon, { type IconName } from './UiIcon.vue'

defineProps<{
  stableLayout?: boolean
  title: string
  titleId?: string
  subtitle?: string
  imageSrc?: string
  imageAlt?: string
  placeholderIcon?: IconName
}>()
</script>

<template>
  <header
    class="action-surface flex min-h-40 w-full shrink-0 flex-wrap items-center gap-4 sm:gap-5"
  >
    <div
      v-if="imageSrc || placeholderIcon"
      class="flex size-20 shrink-0 sm:size-24 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-accent"
    >
      <img v-if="imageSrc" :src="imageSrc" :alt="imageAlt ?? ''" class="size-full object-cover" />
      <UiIcon v-else-if="placeholderIcon" :name="placeholderIcon" :size="32" />
    </div>
    <div class="min-w-0 flex-1" :class="stableLayout ? 'basis-0' : 'basis-40'">
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
