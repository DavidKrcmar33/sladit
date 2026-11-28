<script setup lang="ts">
import { sectionIcons } from '@/ui/sectionIcons'
import type { ConfirmedSlot } from '@/contract/api'
import PageHeader from './PageHeader.vue'
import UiIcon from './UiIcon.vue'
import type { Action } from '@/core/schema'
import { formatDayLong, formatTimeWindow } from '@/ui/format'

defineProps<{
  action: Action
  confirmed: ConfirmedSlot | null
  agreed: boolean
  participantCount: number
  participants: { id: string; name: string }[]
  voting: boolean
  /** Akci upravuje jen organizátor. Smazání je v dialogu úpravy. */
  isOrganizer: boolean
  organizerName: string
}>()
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toLocaleUpperCase('cs')
}
const emit = defineEmits<{ edit: [] }>()
</script>

<template>
  <div class="w-full min-w-0 px-4 pt-6 sm:px-6 lg:px-8">
    <PageHeader :title="action.name" :placeholder-icon="sectionIcons.actions" stable-layout>
      <template #iconActions>
        <button
          v-if="isOrganizer"
          type="button"
          class="page-header-icon-button"
          aria-label="Upravit akci"
          title="Upravit akci"
          @click="emit('edit')"
        >
          <UiIcon name="pencil" :size="18" />
        </button>
      </template>
      <template #meta>
        <div class="flex h-10 min-w-0 items-center text-ink sm:h-6">
          <p v-if="agreed && confirmed" class="flex min-w-0 items-center gap-2 font-medium">
            <UiIcon name="calendar" :size="18" class="shrink-0" />
            <span class="min-w-0 leading-5">
              <span class="block truncate sm:inline">{{ formatDayLong(confirmed.date) }}</span>
              <span class="block sm:ml-2 sm:inline">{{
                formatTimeWindow(confirmed.start, confirmed.end)
              }}</span>
            </span>
          </p>
          <span
            v-else
            class="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger"
          >
            <UiIcon v-if="!voting" name="circle-alert" :size="14" class="shrink-0" />
            {{ voting ? 'O termínu se hlasuje' : 'Termín není domluvený' }}
          </span>
        </div>
        <div class="flex h-16 min-w-0 flex-wrap content-center items-center gap-x-3 gap-y-1 sm:h-7">
          <span class="inline-flex shrink-0 items-center gap-2"
            ><UiIcon name="users" :size="18" />Účastníci: {{ participantCount }}</span
          >
          <div class="flex -space-x-2" aria-label="Účastníci akce">
            <span
              v-for="person in participants.slice(0, 5)"
              :key="person.id"
              :title="person.name"
              :aria-label="person.name"
              role="img"
              class="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-white bg-accent-soft text-[10px] font-semibold text-accent"
            >
              {{ initials(person.name) }}
            </span>
            <span
              v-if="participantCount > 5"
              :title="`Další účastníci: ${participantCount - 5}`"
              class="flex size-7 items-center justify-center rounded-full border-2 border-white bg-panel text-[10px] font-semibold text-ink"
              >+{{ participantCount - 5 }}</span
            >
          </div>
        </div>
      </template>
    </PageHeader>
  </div>
</template>
