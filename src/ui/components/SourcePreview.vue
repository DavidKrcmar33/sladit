<script setup lang="ts">
import { computed, shallowRef, watchEffect } from 'vue'
import type { SourceFile } from '@/core/schema'

export interface PreviewSource {
  file: SourceFile
  blob: File | undefined
}

const props = defineProps<{ sources: PreviewSource[] }>()

interface PreviewItem {
  file: SourceFile
  url: string | null
}

const items = shallowRef<PreviewItem[]>([])

watchEffect((onCleanup) => {
  const created = props.sources.map(({ file, blob }) => ({
    file,
    url: blob ? URL.createObjectURL(blob) : null,
  }))
  items.value = created
  onCleanup(() => created.forEach((item) => item.url && URL.revokeObjectURL(item.url)))
})

const firstImage = computed(() =>
  items.value.find((item) => item.file.kind === 'image' && item.url),
)
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Podklady</h3>
    <img
      v-if="firstImage"
      :src="firstImage.url!"
      :alt="`Náhled: ${firstImage.file.name}`"
      class="max-h-44 w-full rounded-lg border border-line bg-panel object-contain"
    />
    <p v-if="items.length === 0" class="text-muted">Žádné podklady.</p>
    <ul class="flex flex-col gap-1">
      <li v-for="item in items" :key="item.file.id" class="truncate">
        <a
          v-if="item.url"
          :href="item.url"
          target="_blank"
          rel="noopener"
          class="font-medium underline underline-offset-2"
        >
          {{ item.file.name }}
        </a>
        <span v-else class="text-muted">{{ item.file.name }} (soubor není k dispozici)</span>
      </li>
    </ul>
  </div>
</template>
