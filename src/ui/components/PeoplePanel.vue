<script setup lang="ts">
import { computed } from 'vue'
import type { Person } from '@/core/schema'
import UiButton from './UiButton.vue'

const props = defineProps<{
  people: Person[]
  editingPersonId: string | null
  canEdit: boolean
}>()
const emit = defineEmits<{ edit: [personId: string] }>()

const fileCount = computed(() => props.people.reduce((sum, person) => sum + person.files.length, 0))
</script>

<template>
  <section
    aria-labelledby="people-title"
    class="flex flex-col self-start rounded-xl border border-line bg-white p-5"
  >
    <div class="flex items-baseline justify-between gap-3 pb-2">
      <h2 id="people-title" class="text-base font-semibold">Kdo jde</h2>
      <p class="text-muted">Lidé: {{ people.length }} · Podklady: {{ fileCount }}</p>
    </div>

    <p v-if="people.length === 0" class="border-t border-line pt-3 text-muted">
      Zatím tu nikdo není.
    </p>

    <ul v-else>
      <li
        v-for="person in people"
        :key="person.id"
        class="flex items-center justify-between gap-3 border-t border-line py-2"
      >
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="font-semibold">{{ person.name }}</span>
          <span class="truncate text-muted">
            {{ person.files.map((file) => file.name).join(', ') }}
          </span>
        </div>
        <span v-if="person.id === editingPersonId" class="shrink-0 font-medium text-accent-dark">
          upravuješ
        </span>
        <UiButton
          v-else
          variant="ghost"
          :disabled="!canEdit"
          :aria-label="`Upravit: ${person.name}`"
          @click="emit('edit', person.id)"
        >
          Upravit
        </UiButton>
      </li>
    </ul>
  </section>
</template>
