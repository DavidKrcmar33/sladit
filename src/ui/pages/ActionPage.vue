<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConfirmedSlot, Vote } from '@/contract/api'
import { CALENDAR_CIRCLE, type ParityQuestion } from '@/core/compose'
import type { Proposal, Shift } from '@/core/schema'
import { attendanceInSlot } from '@/core/scheduler'
import { eachDay } from '@/core/time'
import { useSession } from '@/session'
import ActionPeople from '@/ui/components/ActionPeople.vue'
import CalendarGrid from '@/ui/components/CalendarGrid.vue'
import CalendarHelp from '@/ui/components/CalendarHelp.vue'
import DayEditor from '@/ui/components/DayEditor.vue'
import DayPicker from '@/ui/components/DayPicker.vue'
import ParityQuestions from '@/ui/components/ParityQuestions.vue'
import PollPanel from '@/ui/components/PollPanel.vue'
import ProposalList from '@/ui/components/ProposalList.vue'
import QuickDays from '@/ui/components/QuickDays.vue'
import ReadingWarnings from '@/ui/components/ReadingWarnings.vue'
import SlotBanner from '@/ui/components/SlotBanner.vue'
import UiButton from '@/ui/components/UiButton.vue'
import UncertainNotice from '@/ui/components/UncertainNotice.vue'
import { editedDayOf } from '@/ui/editedDay'

const {
  state,
  me,
  selectedResource,
  participants,
  calendar,
  composedPeople,
  stability,
  proposals,
  dayBest,
  uncertainDays,
  pivotalUncertainCount,
  readingWarnings,
  parityQuestions,
  usesServerView,
  contacts,
  respondToAction,
  inviteToAction,
  cancelInvite,
  createActionLink,
  revokeActionLink,
  confirmSlot,
  respondToSlot,
  adoptCounter,
  selectDay,
  saveDayShifts,
  clearDayOverride,
  answerWeekParity,
  showSchedule,
  fileBlob,
  calendarPrompt,
  addToCalendar,
  removeFromCalendar,
  dismissCalendarPrompt,
  icsForSelectedAction,
  setRequired,
  remindParticipant,
  loadDaySlots,
  createPoll,
  deletePoll,
  vote,
  choosePoll,
  dismissWarning,
  warningSources,
} = useSession()

// Výběr vlastního času: den otevřený kliknutím na hlavičku kalendáře.
const pickedDate = ref<string | null>(null)
const pickedSlots = ref<Proposal[] | null>(null)

async function pickDay(date: string) {
  if (pickedDate.value === date) {
    pickedDate.value = null
    return
  }
  pickedDate.value = date
  pickedSlots.value = null
  const slots = await loadDaySlots(date)
  if (pickedDate.value === date) pickedSlots.value = slots
}

// Hlasování: termíny, které organizátor chystá (nejvýš tři).
const pollDraft = ref<ConfirmedSlot[]>([])

function togglePoll(slot: ConfirmedSlot) {
  const same = (item: ConfirmedSlot) => item.date === slot.date && item.start === slot.start
  pollDraft.value = pollDraft.value.some(same)
    ? pollDraft.value.filter((item) => !same(item))
    : [...pollDraft.value, slot].slice(0, 3)
}

async function startPoll(deadline: string | null) {
  await createPoll(
    [...pollDraft.value].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)),
    deadline,
  )
  if (resource.value.poll) pollDraft.value = []
}

/** Předvyplněný hlas podle mého rozpisu. */
function suggestVote(slot: ConfirmedSlot): Vote | null {
  const mine = composedPeople.value.find((person) => person.id === me.value?.id)
  const attendance = attendanceInSlot(mine?.schedule ?? null, slot)
  return attendance === 'available' ? 'yes' : attendance === 'busy' ? 'no' : null
}

// Rychlá odpověď bez rozpisu: ruční dny „můžu / nemůžu“.
const BUSY_LABEL = 'NEMŮŽU'
const hasReadSchedule = computed(
  () => (me.value?.sources ?? []).filter((source) => source.circle !== CALENDAR_CIRCLE).length > 0,
)
const quickStates = computed(() =>
  Object.fromEntries(
    (me.value?.overrides ?? []).map((override) => [
      override.date,
      override.shifts.length === 0
        ? ('free' as const)
        : override.shifts.some((shift) => shift.label === BUSY_LABEL)
          ? ('busy' as const)
          : null,
    ]),
  ),
)

function setQuickDay(date: string, value: 'free' | 'busy' | null) {
  if (value === null) void clearDayOverride(date)
  else if (value === 'free') void saveDayShifts(date, [])
  else {
    void saveDayShifts(date, [
      { date, start: '00:00', end: '23:59', label: BUSY_LABEL, raw: '', uncertain: false },
    ])
  }
}

const leaving = ref(false)
/** Přijetí pozvánky: nejdřív souhlas se sdílením toho, kdy můžu. */
const consenting = ref(false)

const resource = computed(() => selectedResource.value!)
const takesPart = computed(() => resource.value.myStatus !== 'invited')
const hasSchedule = computed(
  () => (me.value?.sources.length ?? 0) + (me.value?.overrides.length ?? 0) > 0,
)

const editedDay = computed(() =>
  editedDayOf(state.selectedDay, me.value, composedPeople.value, calendar.value, fileBlob),
)

function saveEditedDay(shifts: Shift[]) {
  if (!editedDay.value) return
  void saveDayShifts(editedDay.value.date, shifts)
  selectDay(null)
}

function resetEditedDay() {
  if (!editedDay.value) return
  void clearDayOverride(editedDay.value.date)
  selectDay(null)
}

function answerParity(question: ParityQuestion, odd: boolean) {
  void answerWeekParity(question.sourceId, question.date, odd)
}

/** Stáhne potvrzený termín jako soubor .ics. */
function downloadIcs() {
  const file = icsForSelectedAction()
  if (!file) return
  const url = URL.createObjectURL(new Blob([file.content], { type: 'text/calendar' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** Ukládá se potvrzení nebo zápis do kalendáře: tlačítka kolem termínu počkají. */
const busy = computed(() => state.pending !== null)

const calendarConnected = computed(
  () => state.calendar?.state === 'connected' && state.calendar.canWrite,
)

/** Jiné termíny, které může účastník navrhnout místo navrženého. */
const alternatives = computed(() =>
  proposals.value.filter(
    (proposal) =>
      proposal.date !== resource.value.confirmed?.date ||
      proposal.start !== resource.value.confirmed?.start,
  ),
)

/**
 * Proč nejsou návrhy: plánovač nemá z čeho počítat, nebo se v okně akce nikdo nevešel.
 * Bez rozpisu je u člověka všude „nevíme“ a termín pro něj nejde najít.
 */
const proposalsEmpty = computed<'mine' | 'others' | 'conditions' | 'nofit'>(() => {
  if (takesPart.value && !hasSchedule.value) return 'mine'
  const others = (calendar.value?.rows ?? []).filter((row) => row.personId !== me.value?.id)
  const knowsSomething = others.some((row) => row.days.some((day) => day.attendance !== 'unknown'))
  if (!knowsSomething) return 'others'
  const conditions =
    resource.value.details.minPeople !== undefined ||
    resource.value.invites.some((invite) => invite.required)
  return conditions ? 'conditions' : 'nofit'
})

/** Sloupec, na který se má v kalendáři dívat: navržený, jinak nejlepší termín. */
const highlightDate = computed(
  () => resource.value.confirmed?.date ?? proposals.value[0]?.date ?? null,
)

const showAlternatives = ref(false)
watch(
  () => resource.value.agreed,
  () => {
    showAlternatives.value = false
  },
)

function confirm(proposal: Proposal) {
  void confirmSlot({ date: proposal.date, start: proposal.start, end: proposal.end })
}
</script>

<template>
  <div
    class="flex h-full min-w-0 flex-col gap-6 overflow-y-auto px-4 pt-6 pb-5 sm:px-6 lg:gap-8 lg:px-8 lg:pt-8 lg:pb-6"
  >
    <section aria-label="Domluva termínu" class="flex min-w-0 shrink-0 flex-col gap-4">
      <SlotBanner
        :show-alternatives="showAlternatives"
        :resource="resource"
        :proposed="resource.confirmed"
        :my-user-id="state.user?.id ?? null"
        :alternatives="alternatives"
        :pending="state.pending"
        :calendar-connected="calendarConnected"
        :calendar-prompt="calendarPrompt"
        @toggle-alternatives="showAlternatives = !showAlternatives"
        @respond="respondToSlot"
        @adopt="adoptCounter"
        @withdraw="confirmSlot(null)"
        @add-to-calendar="addToCalendar"
        @remove-from-calendar="removeFromCalendar"
        @download-ics="downloadIcs"
      >
        <PollPanel
          v-if="!resource.agreed || showAlternatives"
          class="action-detail-card"
          :resource="resource"
          :draft="pollDraft"
          :suggest="suggestVote"
          :pending="state.pending"
          :now="new Date()"
          @remove-draft="togglePoll"
          @start="startPoll"
          @cancel="deletePoll"
          @vote="vote"
          @choose="choosePoll"
        />

        <ProposalList
          v-if="!resource.poll && (!resource.agreed || showAlternatives)"
          :proposals="resource.agreed ? alternatives : proposals"
          :people="participants"
          :stability="stability"
          :can-confirm="resource.isOrganizer"
          :confirmed="resource.confirmed"
          :busy="state.pending !== null"
          :confirming="state.pending === 'confirm'"
          :empty-reason="proposalsEmpty"
          :poll-draft="
            resource.isOrganizer && !state.demo && !resource.poll ? pollDraft : undefined
          "
          @confirm="confirm"
          @upload="showSchedule"
          @toggle-poll="togglePoll"
        />
      </SlotBanner>
    </section>

    <section aria-label="Účastníci" class="flex w-full min-w-0 max-w-2xl shrink-0 flex-col gap-4">
      <div
        v-if="resource.myStatus === 'invited'"
        role="status"
        class="flex flex-wrap items-center justify-between gap-3 action-surface"
      >
        <template v-if="!consenting">
          <p>
            <strong>{{ resource.organizerName }}</strong> tě zve do akce
            <strong>{{ resource.details.name }}</strong>.
          </p>
          <div class="flex gap-2">
            <UiButton variant="primary" @click="consenting = true">Přijmout</UiButton>
            <UiButton @click="respondToAction(false)">Odmítnout</UiButton>
          </div>
        </template>
        <template v-else>
          <p>
            Souhlasíš se sdílením svého kalendáře v této akci? Ostatní uvidí jen, kdy můžeš (může /
            nemůže / nevíme). Tvé směny, události ani podklady neuvidí.
          </p>
          <div class="flex gap-2">
            <UiButton variant="primary" @click="respondToAction(true)">
              Souhlasím, přijmout
            </UiButton>
            <UiButton @click="consenting = false">Zpět</UiButton>
          </div>
        </template>
      </div>

      <ActionPeople
        :action="resource"
        :contacts="contacts"
        :groups="state.groups"
        :link-url="
          state.lastInvite?.target === `action:${resource.id}` ? state.lastInvite.url : null
        "
        :can-link="!state.demo"
        @invite="inviteToAction"
        @cancel="cancelInvite"
        @create-link="createActionLink"
        @revoke-link="revokeActionLink"
        @set-required="setRequired"
        @remind="remindParticipant"
      />
    </section>

    <section
      aria-labelledby="calendar-title"
      class="flex w-full min-w-0 max-w-5xl shrink-0 flex-col gap-4"
    >
      <h2 id="calendar-title" class="action-section-title">Kalendář</h2>
      <div class="action-surface flex min-w-0 flex-col gap-4">
        <div class="flex justify-end"><CalendarHelp /></div>
        <div
          v-if="calendarPrompt"
          role="status"
          class="flex flex-wrap items-center justify-between gap-3"
        >
          <p>Přidat termín do tvého Google Kalendáře?</p>
          <div class="flex gap-2">
            <UiButton variant="primary" :disabled="busy" @click="addToCalendar">
              {{ state.pending === 'calendar' ? 'Zapisuji…' : 'Přidat' }}
            </UiButton>
            <UiButton :disabled="busy" @click="dismissCalendarPrompt">Teď ne</UiButton>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <p class="text-sm text-muted">
            <template v-if="usesServerView">
              Svůj den opravíš kliknutím, platí pak ve všech akcích. U ostatních vidíš jen, zda
              můžou.
            </template>
            <template v-else
              >Svůj den opravíš kliknutím. Pozvi přátele, ať je s kým hledat.</template
            >
          </p>
        </div>

        <p v-if="takesPart && !hasSchedule" class="rounded-lg bg-warn-soft px-4 py-2 text-warn">
          Nemáš nahraný rozvrh, u tebe je všude „nevíme“.
          <button type="button" class="font-semibold underline" @click="showSchedule">
            Nahrát můj rozvrh
          </button>
        </p>

        <QuickDays
          v-if="takesPart && !hasReadSchedule && !state.demo"
          class="action-detail-card"
          :dates="eachDay(resource.details.from, resource.details.to)"
          :states="quickStates"
          :busy="false"
          @set="setQuickDay"
        />

        <UncertainNotice
          v-if="uncertainDays.length > 0"
          :count="uncertainDays.length"
          :pivotal-count="pivotalUncertainCount"
          @show-first="selectDay(uncertainDays[0])"
        />
        <ParityQuestions
          v-if="parityQuestions.length > 0"
          class="action-detail-card"
          :questions="parityQuestions"
          @answer="answerParity"
        />
        <ReadingWarnings
          v-if="readingWarnings.length > 0"
          :items="readingWarnings"
          :dismissable="warningSources"
          @dismiss="dismissWarning"
        />

        <template v-if="calendar && calendar.rows.length > 0">
          <CalendarGrid
            :calendar="calendar"
            :selected-day="state.selectedDay"
            :highlight-date="highlightDate"
            :day-best="dayBest.length ? dayBest : undefined"
            :picked-date="pickedDate"
            @select="selectDay($event)"
            @edit-person="showSchedule"
            @pick-day="pickDay"
          />
        </template>

        <p v-if="calendar && calendar.rows.length > 0 && !pickedDate" class="text-xs text-muted">
          Klikni na den v hlavičce a uvidíš všechny časy toho dne a kdo v nich může.
        </p>
        <DayPicker
          v-if="pickedDate"
          :key="pickedDate"
          class="action-detail-card"
          :date="pickedDate"
          :slots="pickedSlots"
          :people="participants"
          :is-organizer="resource.isOrganizer"
          :can-counter="resource.myStatus === 'accepted' && resource.confirmed !== null"
          :in-poll="pollDraft"
          :can-poll="!state.demo && !resource.poll"
          :busy="state.pending !== null"
          @propose="confirmSlot"
          @toggle-poll="togglePoll"
          @counter="respondToSlot({ response: 'counter', counter: $event })"
          @close="pickedDate = null"
        />

        <DayEditor
          v-if="editedDay"
          :key="editedDay.key"
          class="action-detail-card"
          :person-name="editedDay.personName"
          :date="editedDay.date"
          :shifts="editedDay.shifts"
          :is-known="editedDay.isKnown"
          :has-override="editedDay.hasOverride"
          :sources="editedDay.sources"
          :warnings="editedDay.warnings"
          :availability-note="editedDay.availabilityNote"
          @save="saveEditedDay"
          @reset="resetEditedDay"
          @close="selectDay(null)"
        />

        <div v-if="resource.myStatus === 'accepted'" class="border-t border-line pt-3">
          <div v-if="leaving" class="flex flex-wrap items-center gap-2">
            <span class="text-warn">Odejít z akce? Zmizí ti ze seznamu.</span>
            <UiButton variant="danger" @click="respondToAction(false)">Odejít</UiButton>
            <UiButton @click="leaving = false">Zůstat</UiButton>
          </div>
          <UiButton v-else variant="danger" @click="leaving = true">Odejít z akce</UiButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference "../../styles.css";
.action-detail-card {
  @apply action-surface border-0;
}
</style>
