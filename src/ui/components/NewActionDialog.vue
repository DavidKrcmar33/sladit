<script setup lang="ts">
import { reactive, ref } from 'vue'
import { addDays } from '@/core/time'
import type { NewActionErrors, NewActionInput } from '@/core/newAction'
import type { DateString } from '@/core/schema'
import { formatDuration } from '@/ui/format'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

const props = defineProps<{
  errors: NewActionErrors
  /** Hodnoty upravované akce. Bez nich se zakládá nová. */
  initial?: NewActionInput
  /** Skupiny, do kterých jde novou akci založit. */
  groups?: { id: string; name: string }[]
  initialGroupId?: string | null
}>()
const emit = defineEmits<{
  submit: [input: NewActionInput, groupId: string | null]
  close: []
}>()

const groupId = ref<string | null>(props.initialGroupId ?? null)

const DURATION_OPTIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 30)
const DEFAULT_PERIOD_DAYS = 7

function localToday(): DateString {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const today = localToday()

const isEditing = props.initial !== undefined

const input = reactive<NewActionInput>(
  props.initial
    ? { ...props.initial }
    : {
        name: '',
        from: today,
        to: addDays(today, DEFAULT_PERIOD_DAYS - 1),
        durationMinutes: 180,
        windowStart: '16:00',
        windowEnd: '23:00',
      },
)
</script>

<template>
  <UiDialog :title="isEditing ? 'Upravit akci' : 'Nová akce'" @close="emit('close')">
    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="emit('submit', { ...input }, groupId)"
    >
      <div class="flex flex-col gap-1.5">
        <label for="action-name" class="font-medium">Název</label>
        <input id="action-name" v-model="input.name" class="field-input" autocomplete="off" />
        <p v-if="errors.name" class="text-xs text-warn">{{ errors.name }}</p>
      </div>

      <div v-if="!isEditing && groups && groups.length > 0" class="flex flex-col gap-1.5">
        <label for="action-group" class="font-medium">Kdo jde</label>
        <select id="action-group" v-model="groupId" class="field-input">
          <option :value="null">Já a lidé, které přidám</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            Skupina {{ group.name }}
          </option>
        </select>
        <p v-if="groupId" class="text-xs text-muted">
          Akce se ukáže všem členům a každý si do ní nahraje svůj rozpis.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <label for="action-from" class="font-medium">Od</label>
          <input id="action-from" v-model="input.from" type="date" class="field-input" />
          <p v-if="errors.from" class="text-xs text-warn">{{ errors.from }}</p>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="action-to" class="font-medium">Do</label>
          <input id="action-to" v-model="input.to" type="date" class="field-input" />
          <p v-if="errors.to" class="text-xs text-warn">{{ errors.to }}</p>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="action-duration" class="font-medium">Délka akce</label>
        <select id="action-duration" v-model.number="input.durationMinutes" class="field-input">
          <option v-for="minutes in DURATION_OPTIONS" :key="minutes" :value="minutes">
            {{ formatDuration(minutes) }}
          </option>
        </select>
        <p v-if="errors.durationMinutes" class="text-xs text-warn">{{ errors.durationMinutes }}</p>
      </div>

      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 font-medium">Kdy během dne</legend>
        <div class="grid grid-cols-2 gap-3">
          <input
            v-model="input.windowStart"
            aria-label="Nejdřív od"
            type="time"
            step="1800"
            class="field-input"
          />
          <input
            v-model="input.windowEnd"
            aria-label="Nejpozději do"
            type="time"
            step="1800"
            class="field-input"
          />
        </div>
        <p v-if="errors.windowEnd" class="text-xs text-warn">{{ errors.windowEnd }}</p>
      </fieldset>

      <div class="mt-2 flex justify-end gap-3">
        <UiButton @click="emit('close')">Zrušit</UiButton>
        <UiButton variant="primary" type="submit">
          {{ isEditing ? 'Uložit změny' : 'Založit akci' }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
