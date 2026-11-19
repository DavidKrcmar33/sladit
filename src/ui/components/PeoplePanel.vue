<script setup lang="ts">
import { computed } from 'vue'
import { SCHOOL_CIRCLE, WORK_CIRCLE, type Person } from '@/core/schema'
import type { ReadStatus } from '@/session'
import UiButton from './UiButton.vue'

const props = defineProps<{
  people: Person[]
  /** Účastníci, jejichž rozpis přihlášený nevidí: jen jména. */
  others: { id: string; name: string; kind: 'member' | 'guest' }[]
  /** Člověk, který je přihlášený uživatel sám. */
  selfPersonId: string | null
  editingPersonId: string | null
  canEdit: boolean
  readStatuses: Record<string, ReadStatus>
  readErrors: Record<string, string>
  isReading: boolean
}>()
const emit = defineEmits<{
  edit: [personId: string]
  retry: [personId: string]
  changeCircle: [personId: string, sourceId: string, circle: string]
}>()

/** Třetí okruh pro druhou práci: její rozpis musí den pokrýt taky, jinak den neznáme. */
const EXTRA_CIRCLE = 'Další práce'

const STATUS_TEXT: Partial<Record<ReadStatus, string>> = {
  pending: 'čeká na přečtení',
  reading: 'čte se…',
  done: 'rozpis přečten',
}

const fileCount = computed(() =>
  props.people.reduce(
    (sum, person) =>
      sum +
      person.files.length +
      person.sources.reduce((count, source) => count + source.files.length, 0),
    0,
  ),
)

function circleOptions(person: Person): string[] {
  return [
    ...new Set([
      ...person.sources.map((source) => source.circle),
      WORK_CIRCLE,
      SCHOOL_CIRCLE,
      EXTRA_CIRCLE,
    ]),
  ]
}

function fileNames(files: { name: string }[]): string {
  return files.map((file) => file.name).join(', ')
}
</script>

<template>
  <section
    aria-labelledby="people-title"
    class="flex flex-col self-start rounded-xl border border-line bg-white p-5"
  >
    <div class="flex items-baseline justify-between gap-3 pb-2">
      <h2 id="people-title" class="text-base font-semibold">Kdo jde</h2>
      <p class="text-muted">
        Lidé: {{ people.length + others.length }} · Podklady: {{ fileCount }}
      </p>
    </div>

    <p v-if="people.length + others.length === 0" class="border-t border-line pt-3 text-muted">
      Zatím tu nikdo není.
    </p>

    <ul v-else>
      <li
        v-for="person in people"
        :key="person.id"
        class="flex items-center justify-between gap-3 border-t border-line py-2"
      >
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="font-semibold">
            {{ person.name }}
            <span v-if="person.id === selfPersonId" class="font-normal text-muted">(ty)</span>
          </span>
          <span
            v-for="source in person.sources"
            :key="source.id"
            class="flex min-w-0 items-center gap-2"
          >
            <select
              :value="source.circle"
              :disabled="!canEdit"
              :aria-label="`Okruh podkladu ${fileNames(source.files)}`"
              class="rounded border border-line bg-white px-1 py-0.5 text-xs"
              @change="
                emit(
                  'changeCircle',
                  person.id,
                  source.id,
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option v-for="circle in circleOptions(person)" :key="circle" :value="circle">
                {{ circle }}
              </option>
            </select>
            <span class="truncate text-muted">{{ fileNames(source.files) }}</span>
          </span>
          <span v-if="person.files.length > 0" class="truncate text-muted">
            Nové: {{ fileNames(person.files) }}
          </span>
          <span
            v-if="readStatuses[person.id] === 'error'"
            role="alert"
            class="font-medium text-warn"
          >
            {{ readErrors[person.id] }}
          </span>
          <span v-else-if="readStatuses[person.id]" class="text-muted" aria-live="polite">
            {{ STATUS_TEXT[readStatuses[person.id]] }}
          </span>
        </div>
        <span v-if="person.id === editingPersonId" class="shrink-0 font-medium text-accent-dark">
          upravuješ
        </span>
        <UiButton
          v-else-if="readStatuses[person.id] === 'error'"
          variant="secondary"
          :disabled="isReading"
          :aria-label="`Zkusit znovu: ${person.name}`"
          @click="emit('retry', person.id)"
        >
          Zkusit znovu
        </UiButton>
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
      <li
        v-for="other in others"
        :key="other.id"
        class="flex items-center justify-between gap-3 border-t border-line py-2"
      >
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="font-semibold">{{ other.name }}</span>
          <span class="text-muted">
            {{ other.kind === 'member' ? 'Ze skupiny' : 'Host organizátora' }} · rozpis nevidíš
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>
