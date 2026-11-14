<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-full max-w-md rounded-xl border border-line bg-white p-0 text-sm text-ink shadow-xl"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-5 p-6">
      <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
      <slot />
    </div>
  </dialog>
</template>
