<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { ACCEPTED_FILE_TYPES } from '@/core/sourceFile'

const emit = defineEmits<{ files: [files: File[]] }>()

const zone = useTemplateRef<HTMLElement>('zone')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const isDraggingOver = ref(false)

function openFilePicker() {
  fileInput.value?.click()
}

function emitFiles(fileList: FileList | null | undefined) {
  const files = Array.from(fileList ?? [])
  if (files.length > 0) emit('files', files)
}

function onFileInputChange() {
  emitFiles(fileInput.value?.files)
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(event: DragEvent) {
  isDraggingOver.value = false
  emitFiles(event.dataTransfer?.files)
}

function onDragLeave(event: DragEvent) {
  if (!zone.value?.contains(event.relatedTarget as Node | null)) {
    isDraggingOver.value = false
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function onPaste(event: ClipboardEvent) {
  if (isTypingTarget(event.target) || !event.clipboardData?.files.length) return
  event.preventDefault()
  emitFiles(event.clipboardData.files)
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))

defineExpose({ openFilePicker })
</script>

<template>
  <div
    ref="zone"
    class="relative flex w-full max-w-xl items-center justify-center"
    @dragenter.prevent="isDraggingOver = true"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      aria-hidden="true"
      class="absolute inset-0 m-auto size-68 animate-orbit rounded-full border-[1.5px] border-dashed border-line-strong motion-reduce:animate-none"
    />
    <div
      aria-hidden="true"
      class="absolute inset-0 m-auto size-51 animate-orbit-reverse rounded-full border-[1.5px] border-dashed border-accent-ring motion-reduce:animate-none"
    />

    <div aria-hidden="true" class="pointer-events-none absolute inset-0">
      <div
        class="absolute top-[8%] left-[4%] flex w-36 -rotate-9 flex-col gap-2 rounded-lg border border-line-strong bg-white p-2.5 shadow-md"
      >
        <div class="h-12 rounded bg-hatch" />
        <div class="h-1.5 w-2/3 rounded bg-line" />
      </div>
      <div
        class="absolute top-[52%] left-[20%] grid w-20 rotate-24 grid-cols-3 gap-1 rounded-md border border-line-strong bg-white p-2 opacity-80"
      >
        <div class="h-3 bg-line" />
        <div class="h-3 bg-shift" />
        <div class="h-3 bg-accent" />
        <div class="h-3 bg-shift" />
        <div class="h-3 bg-line" />
        <div class="h-3 bg-line" />
      </div>
      <div
        class="absolute top-[12%] right-[20%] flex h-13 w-19 -rotate-20 flex-col justify-center gap-1.5 rounded-lg bg-ink px-2.5 opacity-85"
      >
        <div class="h-1.5 w-4/5 rounded bg-shift" />
        <div class="h-1.5 w-1/2 rounded bg-muted" />
      </div>
      <div
        class="absolute top-[50%] right-[3%] flex w-32 rotate-8 flex-col gap-1.5 rounded-lg border border-line-strong bg-white p-2.5 shadow-md"
      >
        <div class="h-1.5 w-2/3 bg-ink" />
        <div class="h-1 bg-line" />
        <div class="h-1 bg-line" />
        <div class="h-1 w-4/5 bg-line" />
      </div>
    </div>

    <button
      type="button"
      :class="[
        'relative flex size-36 flex-col items-center justify-center rounded-full text-center text-base leading-snug font-semibold text-white transition-transform',
        'bg-[radial-gradient(circle,#050b0a_0,var(--color-void)_55%,var(--color-accent)_100%)]',
        'shadow-[0_0_0_6px_var(--color-accent-soft),0_18px_40px_rgb(19_36_34/0.18)]',
        'focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent',
        isDraggingOver ? 'scale-110' : 'hover:scale-105',
      ]"
      @click="openFilePicker"
    >
      Pusť sem<br />rozpisy
    </button>

    <input
      ref="fileInput"
      type="file"
      multiple
      :accept="ACCEPTED_FILE_TYPES"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileInputChange"
    />
  </div>
</template>
