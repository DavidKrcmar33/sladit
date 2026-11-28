<script setup lang="ts">
import { sectionIcons } from '@/ui/sectionIcons'
import { nextTick, ref, useTemplateRef } from 'vue'
import type { Group } from '@/contract/api'
import SidebarSection from './SidebarSection.vue'
import UiIcon from './UiIcon.vue'
import UiButton from './UiButton.vue'

defineProps<{ collapsed: boolean; groups: Group[]; selectedGroupId: string | null }>()
const emit = defineEmits<{ expand: []; select: [groupId: string]; create: [name: string] }>()

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
    :collapsed="collapsed"
    :selected-id="selectedGroupId"
    :icon="sectionIcons.groups"
    title="Skupiny"
    :count="groups.length"
    add-label="Přidat skupinu"
    @expand="emit('expand')"
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
    <ul class="flex flex-col gap-1.5">
      <li v-for="group in groups" :key="group.id">
        <button
          type="button"
          :aria-current="group.id === selectedGroupId ? 'page' : undefined"
          class="sidebar-link"
          :title="`${group.name} · Členové: ${group.members.length}`"
          @click="emit('select', group.id)"
        >
          <UiIcon :name="sectionIcons.groups" :size="18" class="shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ group.name }}</span>
        </button>
      </li>
    </ul>
  </SidebarSection>
</template>
