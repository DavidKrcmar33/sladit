<script setup lang="ts">
import { ref } from 'vue'
import UiButton from './UiButton.vue'

defineProps<{ name: string; email: string; demo: boolean }>()
const emit = defineEmits<{ logout: []; deleteAccount: [] }>()

const confirmingDelete = ref(false)
</script>

<template>
  <section aria-label="Účet" class="mt-auto flex flex-col gap-2 border-t border-line pt-4">
    <template v-if="demo">
      <p class="px-2 font-semibold">Ukázka</p>
      <p class="px-2 text-xs text-muted">Nic se neukládá a podklady se nečtou.</p>
      <a class="px-2 text-accent-dark underline" href="/">Přihlásit se</a>
    </template>
    <template v-else>
      <div class="flex flex-col px-2">
        <span class="font-semibold">{{ name }}</span>
        <span class="truncate text-xs text-muted">{{ email }}</span>
      </div>
      <UiButton variant="ghost" @click="emit('logout')">Odhlásit</UiButton>
      <UiButton v-if="!confirmingDelete" variant="danger" @click="confirmingDelete = true">
        Smazat účet
      </UiButton>
      <div v-else role="alertdialog" aria-label="Smazat účet" class="flex flex-col gap-2 px-2">
        <p class="text-warn">
          Smaže se účet, tvůj rozpis, hosté i akce. Skupiny, které vedeš, převezme další člen.
          Vrátit to nejde.
        </p>
        <div class="flex gap-2">
          <UiButton variant="danger" @click="emit('deleteAccount')">Smazat</UiButton>
          <UiButton @click="confirmingDelete = false">Nechat</UiButton>
        </div>
      </div>
    </template>
  </section>
</template>
