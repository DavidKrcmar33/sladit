<script setup lang="ts">
import { ref } from 'vue'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

const emit = defineEmits<{ submit: [text: string]; close: [] }>()

const text = ref('')
</script>

<template>
  <UiDialog title="Vložit text" @close="emit('close')">
    <form class="flex flex-col gap-4" @submit.prevent="emit('submit', text.trim())">
      <label for="pasted-text" class="font-medium">Rozpis jako text, třeba zpráva z chatu</label>
      <textarea
        id="pasted-text"
        v-model="text"
        rows="6"
        class="field-input h-auto py-2.5 leading-relaxed"
      />
      <div class="flex justify-end gap-3">
        <UiButton @click="emit('close')">Zrušit</UiButton>
        <UiButton variant="primary" type="submit" :disabled="!text.trim()">Vložit</UiButton>
      </div>
    </form>
  </UiDialog>
</template>
