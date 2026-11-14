<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { ShiftSchema, type DateString, type Shift } from '@/core/schema'
import { formatDayLong } from '@/ui/format'
import SourcePreview, { type PreviewSource } from './SourcePreview.vue'
import UiButton from './UiButton.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  personName: string
  date: DateString
  shifts: Shift[]
  isKnown: boolean
  sources: PreviewSource[]
}>()
const emit = defineEmits<{ save: [shifts: Shift[]]; close: [] }>()

interface ShiftRow {
  key: number
  label: string
  start: string
  end: string
  raw: string
}

let nextRowKey = 0
const rows = ref<ShiftRow[]>(
  props.shifts.map((shift) => ({
    key: nextRowKey++,
    label: shift.label,
    start: shift.start,
    end: shift.end,
    raw: shift.raw,
  })),
)
const error = ref<string | null>(null)
const editor = useTemplateRef<HTMLElement>('editor')

onMounted(() => editor.value?.scrollIntoView({ block: 'nearest' }))

const hasUncertainShift = computed(() => props.shifts.some((shift) => shift.uncertain))

function addRow() {
  rows.value.push({ key: nextRowKey++, label: '', start: '06:00', end: '14:00', raw: '' })
}

function removeRow(key: number) {
  rows.value = rows.value.filter((row) => row.key !== key)
}

function save() {
  const shifts: Shift[] = []
  for (const row of rows.value) {
    const result = ShiftSchema.safeParse({ ...row, date: props.date, uncertain: false })
    if (!result.success) {
      error.value = result.error.issues[0].message
      return
    }
    shifts.push(result.data)
  }
  emit('save', shifts)
}
</script>

<template>
  <section
    ref="editor"
    aria-labelledby="day-editor-title"
    class="flex flex-wrap gap-6 rounded-xl border-2 border-accent bg-white p-5"
  >
    <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-3">
      <div class="flex flex-col gap-0.5">
        <h2 id="day-editor-title" class="text-base font-semibold">{{ personName }}</h2>
        <p class="text-muted first-letter:uppercase">{{ formatDayLong(date) }}</p>
      </div>
      <SourcePreview :sources="sources" />
    </div>

    <form class="flex min-w-0 flex-[2_1_340px] flex-col gap-3" novalidate @submit.prevent="save">
      <div class="flex items-start justify-between gap-3">
        <p v-if="hasUncertainShift" class="leading-relaxed text-warn">
          Tuto směnu jsme nepřečetli jistě. Zkontroluj ji podle podkladu.
        </p>
        <p v-else-if="!isKnown" class="leading-relaxed text-muted">
          Pro tento den rozpis chybí. Doplň směnu, nebo označ den jako volný.
        </p>
        <p v-else-if="rows.length === 0" class="leading-relaxed text-muted">Tento den má volno.</p>
        <span v-else />
        <button
          type="button"
          aria-label="Zavřít"
          class="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel hover:text-ink"
          @click="emit('close')"
        >
          <UiIcon name="close" />
        </button>
      </div>

      <div v-if="rows.length > 0" class="grid grid-cols-[4.5rem_1fr_1fr_2.75rem] items-end gap-2">
        <span class="text-xs font-medium text-muted">Typ</span>
        <span class="text-xs font-medium text-muted">Od</span>
        <span class="text-xs font-medium text-muted">Do</span>
        <span />
        <template v-for="(row, index) in rows" :key="row.key">
          <input
            v-model="row.label"
            :aria-label="`Typ směny ${index + 1}`"
            maxlength="4"
            class="field-input"
          />
          <input
            v-model="row.start"
            :aria-label="`Začátek směny ${index + 1}`"
            type="time"
            class="field-input"
          />
          <input
            v-model="row.end"
            :aria-label="`Konec směny ${index + 1}`"
            type="time"
            class="field-input"
          />
          <button
            type="button"
            :aria-label="`Odebrat směnu ${index + 1}`"
            class="flex size-11 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-ink"
            @click="removeRow(row.key)"
          >
            <UiIcon name="close" />
          </button>
        </template>
      </div>

      <p v-if="error" role="alert" class="font-medium text-warn">{{ error }}</p>

      <div class="flex flex-wrap gap-2.5">
        <UiButton variant="primary" type="submit">Uložit</UiButton>
        <UiButton @click="emit('save', [])">Ten den nepracuje</UiButton>
        <UiButton variant="dashed" @click="addRow">
          <UiIcon name="plus" />
          Přidat směnu
        </UiButton>
      </div>
    </form>
  </section>
</template>
