<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '@/session'
import CalendarCard from '@/ui/components/CalendarCard.vue'
import UiButton from '@/ui/components/UiButton.vue'

const {
  state,
  me,
  renameMe,
  calendarConnectUrl,
  setCalendarAutoWrite,
  syncCalendar,
  disconnectCalendar,
  deleteAccount,
  acceptLocalActions,
  setEmailNotifications,
} = useSession()

const confirmingDelete = ref(false)
const editingName = ref(false)
const nameDraft = ref('')
const nameError = ref<string | null>(null)

function startRename() {
  nameDraft.value = me.value?.name ?? ''
  nameError.value = null
  editingName.value = true
}

async function saveName() {
  nameError.value = await renameMe(nameDraft.value)
  if (!nameError.value) editingName.value = false
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">Nastavení</h1>
      <p class="text-[15px] text-muted">Propojení s dalšími aplikacemi a tvůj účet.</p>
    </div>
    <div class="flex max-w-md flex-col gap-4">
      <CalendarCard
        :status="state.calendar"
        :connect-url="calendarConnectUrl"
        @auto-write="setCalendarAutoWrite"
        @sync="syncCalendar"
        @disconnect="disconnectCalendar"
      />
      <p v-if="state.calendar?.state === 'unavailable'" class="text-muted">
        Google Kalendář teď připojit nejde, server ho nemá nastavený.
      </p>

      <section
        v-if="state.notifications && !state.demo"
        aria-labelledby="notifications-title"
        class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="notifications-title" class="text-base font-semibold">Upozornění e-mailem</h2>
        <label class="flex items-start gap-3">
          <input
            type="checkbox"
            class="mt-0.5 size-4 accent-accent"
            :checked="state.notifications.email"
            @change="setEmailNotifications(($event.target as HTMLInputElement).checked)"
          />
          <span>
            Poslat e-mail, když mě někdo pozve do akce, navrhne termín, nebo když je akce domluvená.
            <span class="block text-muted"
              >Na {{ state.user?.email }}. Rozpisy v e-mailu nejsou.</span
            >
          </span>
        </label>
      </section>

      <section
        v-if="state.localActions.length > 0"
        aria-labelledby="local-title"
        class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="local-title" class="text-base font-semibold">Akce z doby před účty</h2>
        <p class="text-muted">
          V tomto prohlížeči jsou uložené akce ({{ state.localActions.length }}). Převezmou se jen
          jejich parametry, lidi pozveš znovu.
        </p>
        <UiButton variant="primary" class="self-start" @click="acceptLocalActions">
          Převzít do účtu
        </UiButton>
      </section>

      <section
        aria-labelledby="account-title"
        class="flex flex-col gap-3 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="account-title" class="text-base font-semibold">Účet</h2>
        <div v-if="!editingName" class="flex flex-col gap-1">
          <span class="text-muted">Ostatní tě vidí jako</span>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <strong>{{ me?.name }}</strong>
            <UiButton variant="ghost" @click="startRename">Změnit jméno</UiButton>
          </div>
        </div>
        <form v-else class="flex flex-col gap-2" @submit.prevent="saveName">
          <label for="my-name" class="font-medium">Jméno, pod kterým tě vidí ostatní</label>
          <input id="my-name" v-model="nameDraft" class="field-input" maxlength="80" />
          <p v-if="nameError" role="alert" class="text-warn">{{ nameError }}</p>
          <div class="flex gap-2">
            <UiButton variant="primary" type="submit">Uložit</UiButton>
            <UiButton @click="editingName = false">Zrušit</UiButton>
          </div>
        </form>
        <p class="text-muted">Přihlášení přes Google: {{ state.user?.email }}</p>
        <UiButton
          v-if="!confirmingDelete"
          variant="danger"
          class="self-start"
          @click="confirmingDelete = true"
        >
          Smazat účet
        </UiButton>
        <div v-else role="alertdialog" aria-label="Smazat účet" class="flex flex-col gap-2">
          <p class="text-warn">
            Smaže se účet, tvůj rozpis, přátelství i akce, které pořádáš. Skupiny, které vedeš,
            převezme další člen. Google Kalendář se odpojí. Vrátit to nejde.
          </p>
          <div class="flex gap-2">
            <UiButton variant="danger" @click="deleteAccount">Smazat</UiButton>
            <UiButton @click="confirmingDelete = false">Nechat</UiButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
