<script setup lang="ts">
import { ref } from 'vue'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'
import UiIcon from './UiIcon.vue'

defineProps<{
  collapsed: boolean
  name: string
  email: string
  demo: boolean
  settingsOpen: boolean
}>()
const emit = defineEmits<{ logout: []; settings: [] }>()

const confirmingLogout = ref(false)

function logout() {
  confirmingLogout.value = false
  emit('logout')
}
</script>

<template>
  <section
    aria-label="Účet"
    :class="[
      'mt-auto flex shrink-0 flex-col gap-1.5',
      collapsed ? '' : 'border-t border-white/20 pt-4',
    ]"
  >
    <template v-if="demo">
      <p v-if="!collapsed" class="px-2 font-semibold">Ukázka</p>
      <p v-if="!collapsed" class="px-2 sidebar-muted text-xs">
        Nic se neukládá a podklady se nečtou.
      </p>
      <a class="sidebar-link" href="/" aria-label="Přihlásit se" title="Přihlásit se">
        <UiIcon name="arrow-right" :size="18" class="shrink-0" />
        <span v-if="!collapsed">Přihlásit se</span>
      </a>
    </template>
    <div v-else class="flex flex-col gap-1.5">
      <div v-if="!collapsed" class="flex min-w-0 flex-col px-3 pb-2">
        <span class="truncate font-semibold">{{ name }}</span>
        <span class="truncate sidebar-muted text-xs">{{ email }}</span>
      </div>
      <button
        type="button"
        aria-label="Nastavení"
        title="Nastavení"
        :aria-current="settingsOpen ? 'page' : undefined"
        class="sidebar-link sidebar-link-plain"
        @click="emit('settings')"
      >
        <UiIcon name="settings" :size="18" class="shrink-0" />
        <span v-if="!collapsed">Nastavení</span>
      </button>
      <button
        type="button"
        aria-label="Odhlásit"
        title="Odhlásit"
        class="sidebar-link sidebar-link-plain"
        @click="confirmingLogout = true"
      >
        <UiIcon name="logout" :size="18" class="shrink-0" />
        <span v-if="!collapsed">Odhlásit</span>
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
