<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import type { Group } from '@/contract/api'
import SidebarSection from './SidebarSection.vue'
import UiButton from './UiButton.vue'

defineProps<{ groups: Group[]; selectedGroupId: string | null }>()
const emit = defineEmits<{ select: [groupId: string]; create: [name: string] }>()

const creating = ref(false)
const name = ref('')
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

async function startCreating() {
  creating.value = true
  await nextTick()
  nameInput.value?.focus()
}

function submit() {
  emit('create', name.value)
  name.value = ''
  creating.value = false
}
</script>

<template>
  <SidebarSection
    id="group-list"
    title="Skupiny"
    :count="groups.length"
    add-label="Nová skupina"
    @add="startCreating"
  >
    <form v-if="creating" class="flex flex-col gap-2 pb-1" @submit.prevent="submit">
      <label for="group-name" class="px-2 font-medium">Název skupiny</label>
      <input
        id="group-name"
        ref="nameInput"
        v-model="name"
        class="field-input"
        autocomplete="off"
        maxlength="60"
      />
      <div class="flex gap-2">
        <UiButton variant="primary" type="submit">Založit</UiButton>
        <UiButton @click="creating = false">Zrušit</UiButton>
      </div>
    </form>
    <p v-if="groups.length === 0 && !creating" class="px-2 text-muted">
      Skupina je seznam lidí, které pozveš do akce najednou.
    </p>
    <ul class="flex flex-col gap-1">
      <li v-for="group in groups" :key="group.id">
        <button
          type="button"
          :aria-current="group.id === selectedGroupId ? 'page' : undefined"
          :class="[
            'flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left',
            group.id === selectedGroupId
              ? 'border-line bg-white'
              : 'border-transparent hover:bg-white/60',
          ]"
          @click="emit('select', group.id)"
        >
          <span class="font-semibold">{{ group.name }}</span>
          <span class="text-xs text-muted">Členové: {{ group.members.length }}</span>
        </button>
      </li>
    </ul>
  </SidebarSection>
</template>
