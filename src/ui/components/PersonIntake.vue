<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { PersonDraft } from '@/session'
import PasteTextDialog from './PasteTextDialog.vue'
import SourceDropZone from './SourceDropZone.vue'
import SourceFileChip from './SourceFileChip.vue'
import UiButton from './UiButton.vue'

const props = defineProps<{ draft: PersonDraft; isDirty: boolean; error: string | null }>()
const emit = defineEmits<{
  rename: [name: string]
  addFiles: [files: File[]]
  addText: [text: string]
  removeFile: [fileId: string]
  save: []
  discard: []
  removePerson: []
}>()

const dropZone = useTemplateRef<InstanceType<typeof SourceDropZone>>('dropZone')
const isPastingText = ref(false)
const isEditing = computed(() => props.draft.editingPersonId !== null)

function submitText(text: string) {
  isPastingText.value = false
  emit('addText', text)
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <form
      class="flex min-h-0 flex-1 flex-col items-center gap-4"
      aria-labelledby="intake-title"
      @submit.prevent="emit('save')"
    >
      <div class="flex flex-col items-center gap-2 text-center">
        <h1 id="intake-title" class="text-2xl font-semibold tracking-tight">
          {{ isEditing ? 'Úprava člověka' : 'Čí rozpisy teď přidáváš?' }}
        </h1>
        <label for="person-name" class="text-muted">Jméno</label>
        <input
          id="person-name"
          :value="draft.name"
          autocomplete="off"
          class="w-64 border-0 border-b-2 border-accent bg-transparent py-1 text-center text-2xl font-semibold text-ink focus:bg-accent-soft/50 focus:outline-none"
          @input="emit('rename', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <SourceDropZone ref="dropZone" class="min-h-60 flex-1" @files="emit('addFiles', $event)" />

      <div class="flex flex-wrap items-center justify-center gap-3">
        <UiButton @click="dropZone?.openFilePicker()">Vybrat soubory</UiButton>
        <UiButton @click="isPastingText = true">Vložit text</UiButton>
        <p class="text-muted">Excel, fotka, screenshot, PDF i text. Klidně víc najednou.</p>
      </div>

      <div class="flex w-full max-w-2xl flex-col items-center gap-3 border-t border-line pt-3">
        <p class="font-semibold">Vložené podklady: {{ draft.files.length }}</p>
        <ul v-if="draft.files.length > 0" class="flex max-w-full flex-wrap justify-center gap-2">
          <li v-for="file in draft.files" :key="file.id" class="max-w-full">
            <SourceFileChip :file="file" @remove="emit('removeFile', file.id)" />
          </li>
        </ul>
        <p v-if="error" role="alert" class="font-medium text-warn">{{ error }}</p>
        <div class="flex flex-wrap justify-center gap-3">
          <UiButton v-if="isEditing" variant="danger" @click="emit('removePerson')">
            Odebrat člověka
          </UiButton>
          <UiButton v-if="isDirty" @click="emit('discard')">
            {{ isEditing ? 'Zrušit úpravy' : 'Zahodit' }}
          </UiButton>
          <UiButton variant="primary" type="submit">
            {{ isEditing ? 'Uložit změny' : 'Přidat člověka' }}
          </UiButton>
        </div>
      </div>
    </form>

    <PasteTextDialog v-if="isPastingText" @submit="submitText" @close="isPastingText = false" />
  </div>
</template>
