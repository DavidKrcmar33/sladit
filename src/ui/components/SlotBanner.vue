<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ActionResource, ConfirmedSlot, SlotResponseRequest } from '@/contract/api'
import type { Proposal } from '@/core/schema'
import { formatMinutes, toMinutes } from '@/core/time'
import type { PendingWork } from '@/session'
import { formatDayLong, formatDayShort, formatTimeWindow } from '@/ui/format'
import UiButton from './UiButton.vue'
import UiIcon from './UiIcon.vue'

/**
 * Navržený termín akce. Organizátor vidí, kdo jde, a může přijmout jiný navržený termín.
 * Účastník odpoví „jdu“, „nejdu“, nebo navrhne jiný termín.
 */
const props = defineProps<{
  showAlternatives?: boolean
  resource: ActionResource
  /** Navržený termín. */
  proposed: ConfirmedSlot | null
  /** Moje id, abych mezi pozvánkami našel svůj návrh. */
  myUserId: string | null
  /** Další návrhy aplikace, ze kterých jde vybrat jiný termín. */
  alternatives: Proposal[]
  pending: PendingWork | null
  calendarConnected: boolean
  calendarPrompt: boolean
}>()
const emit = defineEmits<{
  toggleAlternatives: []
  respond: [request: SlotResponseRequest]
  adopt: [userId: string]
  withdraw: []
  addToCalendar: []
  removeFromCalendar: []
  downloadIcs: []
}>()

const changing = ref(false)
const choosingOther = ref(false)
const otherDate = ref('')
const otherStart = ref('')
const otherError = ref<string | null>(null)

const busy = computed(() => props.pending !== null)
const accepted = computed(() =>
  props.resource.invites.filter((invite) => invite.status === 'accepted'),
)
const counters = computed(() =>
  accepted.value.filter((invite) => invite.slot === 'counter' && invite.counter),
)

/** Kdo jde, kdo ne a kdo ještě neodpověděl. Organizátor jde vždy. */
const summary = computed(() => {
  const names = (slot: string) =>
    accepted.value.filter((invite) => invite.slot === slot).map((invite) => invite.name)
  const parts = [
    `Jdou: ${[props.resource.organizerName, ...names('going')].join(', ')}`,
    names('not-going').length ? `Nejdou: ${names('not-going').join(', ')}` : '',
    names('pending').length ? `Čeká: ${names('pending').join(', ')}` : '',
    names('counter').length ? `Jiný termín: ${names('counter').join(', ')}` : '',
  ]
  return parts.filter(Boolean).join(' · ')
})

const myCounter = computed(
  () => props.resource.invites.find((invite) => invite.userId === props.myUserId)?.counter ?? null,
)

function describe(slot: ConfirmedSlot): string {
  return `${formatDayShort(slot.date)} ${formatTimeWindow(slot.start, slot.end)}`
}

function respond(request: SlotResponseRequest) {
  emit('respond', request)
  changing.value = false
  choosingOther.value = false
}

function proposeOther(slot: ConfirmedSlot) {
  respond({ response: 'counter', counter: slot })
}

/** Vlastní termín: den a začátek, konec dopočítá délka akce. */
function proposeCustom() {
  const { details } = props.resource
  otherError.value = null
  if (!otherDate.value || !otherStart.value) {
    otherError.value = 'Vyber den a začátek.'
    return
  }
  const end = toMinutes(otherStart.value) + details.durationMinutes
  if (
    otherDate.value < details.from ||
    otherDate.value > details.to ||
    otherStart.value < details.windowStart ||
    end > toMinutes(details.windowEnd)
  ) {
    otherError.value = `Termín musí být mezi ${formatDayShort(details.from)} a ${formatDayShort(
      details.to,
    )} v čase ${formatTimeWindow(details.windowStart, details.windowEnd)}.`
    return
  }
  proposeOther({ date: otherDate.value, start: otherStart.value, end: formatMinutes(end) })
}
</script>

<template>
  <slot v-if="!resource.agreed" />
  <div
    v-if="resource.agreed"
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-3xl bg-accent-soft px-4 py-3 text-accent-dark sm:px-6"
  >
    <div class="flex min-w-0 items-center gap-2">
      <UiIcon name="check" :size="20" class="shrink-0" />
      <h2 class="text-base font-semibold">Termín je dohodnutý</h2>
    </div>
    <div class="flex items-center gap-1 [&>button]:size-9 [&>button]:p-0">
      <UiButton
        variant="ghost"
        title="Navrhnout jiné termíny"
        aria-label="Navrhnout jiné termíny"
        :aria-expanded="!!showAlternatives"
        :aria-pressed="!!showAlternatives"
        :class="showAlternatives ? 'bg-accent !text-white hover:!bg-accent-dark' : 'hover:!bg-line'"
        @click="emit('toggleAlternatives')"
      >
        <UiIcon name="calendar-search" :size="18" />
      </UiButton>
      <UiButton
        v-if="resource.isOrganizer || resource.mySlot === 'going'"
        variant="ghost"
        title="Stáhnout .ics"
        aria-label="Stáhnout .ics"
        class="hover:!bg-line"
        @click="emit('downloadIcs')"
      >
        <UiIcon name="download" :size="18" />
      </UiButton>
      <UiButton
        v-if="resource.isOrganizer"
        variant="ghost"
        title="Zrušit návrh"
        aria-label="Zrušit návrh"
        class="!text-danger hover:!bg-danger-soft"
        :disabled="busy"
        @click="emit('withdraw')"
      >
        <UiIcon name="close" :size="18" />
      </UiButton>
    </div>
  </div>
  <slot v-if="resource.agreed && showAlternatives" />
  <div
    v-if="proposed && (!resource.agreed || showAlternatives)"
    class="flex flex-col gap-3"
    :class="resource.agreed ? 'text-ink' : 'rounded-xl bg-accent-soft px-4 py-3 text-accent-dark'"
  >
    <div v-if="!resource.agreed" class="flex flex-wrap items-center gap-2">
      <p class="font-semibold">
        <template v-if="resource.isOrganizer">Navržený termín:</template>
        <template v-else>{{ resource.organizerName }} navrhuje termín:</template>
        {{ formatDayLong(proposed.date) }},
        {{ formatTimeWindow(proposed.start, proposed.end) }}
      </p>
    </div>
    <p v-if="!resource.agreed" class="text-ink">{{ summary }}</p>

    <template v-if="resource.mySlot !== null">
      <div v-if="resource.mySlot === 'pending' || changing" class="flex flex-wrap gap-2">
        <UiButton variant="primary" :disabled="busy" @click="respond({ response: 'going' })">
          {{ pending === 'slot' ? 'Ukládám…' : 'Jdu' }}
        </UiButton>
        <UiButton :disabled="busy" @click="respond({ response: 'not-going' })">Nejdu</UiButton>
        <UiButton :disabled="busy" @click="choosingOther = true">Navrhnout jiný</UiButton>
        <UiButton v-if="changing" variant="ghost" @click="changing = false">Zpět</UiButton>
      </div>
      <p v-else class="flex flex-wrap items-center gap-2 text-ink">
        <template v-if="resource.mySlot === 'going' && !resource.agreed">Jdeš.</template>
        <template v-else-if="resource.mySlot === 'not-going'">Nejdeš.</template>
        <template v-else-if="myCounter">
          Tvůj návrh: {{ describe(myCounter) }}. Čeká, co řekne {{ resource.organizerName }}.
        </template>
        <UiButton variant="ghost" :disabled="busy" @click="changing = true">
          Změnit odpověď
        </UiButton>
      </p>

      <div v-if="choosingOther" class="flex flex-col gap-2 action-surface text-ink">
        <p class="font-medium">Který termín by ti vyhovoval?</p>
        <div v-if="alternatives.length > 0" class="flex flex-wrap gap-2">
          <UiButton
            v-for="proposal in alternatives"
            :key="`${proposal.date}-${proposal.start}`"
            :disabled="busy"
            @click="proposeOther({ date: proposal.date, start: proposal.start, end: proposal.end })"
          >
            {{ describe(proposal) }}
          </UiButton>
        </div>
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="proposeCustom">
          <label class="flex flex-col gap-1 text-xs font-medium">
            Jiný den
            <input
              v-model="otherDate"
              type="date"
              class="field-input"
              :min="resource.details.from"
              :max="resource.details.to"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Od
            <input v-model="otherStart" type="time" class="field-input" />
          </label>
          <UiButton variant="primary" type="submit" :disabled="busy">Navrhnout</UiButton>
          <UiButton @click="choosingOther = false">Zpět</UiButton>
        </form>
        <p v-if="otherError" role="alert" class="text-warn">{{ otherError }}</p>
      </div>
    </template>

    <ul v-if="resource.isOrganizer && counters.length > 0" class="flex flex-col gap-2">
      <li
        v-for="invite in counters"
        :key="invite.userId"
        class="flex flex-wrap items-center justify-between gap-2 action-surface text-ink"
      >
        <span>
          <strong>{{ invite.name }}</strong> navrhuje {{ describe(invite.counter!) }}.
        </span>
        <UiButton variant="primary" :disabled="busy" @click="emit('adopt', invite.userId)">
          {{ pending === 'confirm' ? 'Ukládám…' : 'Přijmout tento termín' }}
        </UiButton>
      </li>
    </ul>

    <div
      v-if="
        (resource.isOrganizer || resource.mySlot === 'going') &&
        (!resource.agreed || resource.inMyCalendar || (calendarConnected && !calendarPrompt))
      "
      class="flex flex-wrap justify-center gap-2"
    >
      <UiButton
        v-if="resource.inMyCalendar"
        variant="ghost"
        :disabled="busy"
        @click="emit('removeFromCalendar')"
      >
        {{ pending === 'calendar' ? 'Odebírám z kalendáře…' : 'V kalendáři · odebrat' }}
      </UiButton>
      <UiButton
        v-else-if="calendarConnected && !calendarPrompt"
        variant="ghost"
        :disabled="busy"
        @click="emit('addToCalendar')"
      >
        {{ pending === 'calendar' ? 'Zapisuji do kalendáře…' : 'Přidat do kalendáře' }}
      </UiButton>
      <UiButton
        v-if="!resource.agreed && !resource.inMyCalendar"
        variant="ghost"
        @click="emit('downloadIcs')"
      >
        Stáhnout .ics
      </UiButton>
      <UiButton
        v-if="resource.isOrganizer && !resource.agreed"
        variant="ghost"
        :disabled="busy"
        @click="emit('withdraw')"
      >
        {{ pending === 'unconfirm' ? 'Ruším návrh…' : 'Zrušit návrh' }}
      </UiButton>
    </div>
  </div>
</template>
