<script setup lang="ts">
import { ref } from 'vue'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'
import UiIcon from './UiIcon.vue'

defineProps<{ name: string; email: string; demo: boolean; settingsOpen: boolean }>()
const emit = defineEmits<{ logout: []; settings: [] }>()

const confirmingLogout = ref(false)

function logout() {
  confirmingLogout.value = false
  emit('logout')
}
</script>

<template>
  <section aria-label="Účet" class="mt-auto flex flex-col gap-2 border-t border-line pt-4">
    <template v-if="demo">
      <p class="px-2 font-semibold">Ukázka</p>
      <p class="px-2 text-xs text-muted">Nic se neukládá a podklady se nečtou.</p>
      <a class="px-2 text-accent-dark underline" href="/">Přihlásit se</a>
    </template>
    <div v-else class="flex items-center gap-1 pl-2">
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate font-semibold">{{ name }}</span>
        <span class="truncate text-xs text-muted">{{ email }}</span>
      </div>
      <button
        type="button"
        aria-label="Nastavení"
        title="Nastavení"
        :aria-current="settingsOpen ? 'page' : undefined"
        :class="[
          'flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          settingsOpen ? 'bg-white text-ink' : '',
        ]"
        @click="emit('settings')"
      >
        <UiIcon name="settings" :size="18" />
      </button>
      <button
        type="button"
        aria-label="Odhlásit"
        title="Odhlásit"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        @click="confirmingLogout = true"
      >
        <UiIcon name="logout" :size="18" />
      </button>
    </div>

    <UiDialog v-if="confirmingLogout" title="Odhlásit se?" @close="confirmingLogout = false">
      <p>Opravdu se chceš odhlásit? Data zůstanou v účtu, po přihlášení je tu najdeš.</p>
      <div class="flex justify-end gap-3">
        <UiButton @click="confirmingLogout = false">Zůstat</UiButton>
        <UiButton variant="primary" @click="logout">Odhlásit</UiButton>
      </div>
    </UiDialog>
  </section>
</template>
