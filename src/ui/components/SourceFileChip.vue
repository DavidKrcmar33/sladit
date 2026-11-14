<script setup lang="ts">
import type { SourceFile, SourceFileKind } from '@/core/schema'
import UiIcon from './UiIcon.vue'

defineProps<{ file: SourceFile }>()
const emit = defineEmits<{ remove: [] }>()

const kindBadges: Record<SourceFileKind, { label: string; classes: string }> = {
  xlsx: { label: 'XLSX', classes: 'bg-accent-soft text-accent-dark' },
  image: { label: 'OBRÁZEK', classes: 'bg-warn-soft text-warn' },
  pdf: { label: 'PDF', classes: 'bg-panel text-ink' },
  text: { label: 'TEXT', classes: 'bg-panel text-ink' },
}
</script>

<template>
  <div
    class="flex h-11 max-w-full items-center gap-2 rounded-full border border-line bg-white pr-1 pl-3"
  >
    <span
      :class="['rounded px-1.5 py-0.5 text-[11px] font-semibold', kindBadges[file.kind].classes]"
    >
      {{ kindBadges[file.kind].label }}
    </span>
    <span class="truncate font-medium">{{ file.name }}</span>
    <button
      type="button"
      :aria-label="`Odebrat ${file.name}`"
      class="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel hover:text-ink"
      @click="emit('remove')"
    >
      <UiIcon name="close" />
    </button>
  </div>
</template>
