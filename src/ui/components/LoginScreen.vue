<script setup lang="ts">
import { computed } from 'vue'
import UiButton from './UiButton.vue'

const props = defineProps<{ loginUrl: string; fakeGoogle: boolean }>()

const LOGIN_ERRORS: Record<string, string> = {
  chyba: 'Přihlášení se nepovedlo. Zkus to znovu.',
  nepovoleno: 'Tento účet zatím do aplikace nemá přístup.',
}

const loginError = computed(() => {
  const reason = new URLSearchParams(location.search).get('prihlaseni')
  return reason ? (LOGIN_ERRORS[reason] ?? null) : null
})

function login() {
  location.href = props.loginUrl
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-ground px-6 text-sm text-ink">
    <section class="flex max-w-md flex-col items-center gap-5 text-center">
      <h1 class="text-3xl font-semibold tracking-tight">Sladit</h1>
      <p class="text-base text-muted">
        Nahraj svůj rozpis směn nebo rozvrh v jakékoli podobě a najdi termín, kdy můžou všichni.
      </p>
      <p v-if="loginError" role="alert" class="font-medium text-warn">{{ loginError }}</p>
      <UiButton variant="primary" @click="login">Přihlásit přes Google</UiButton>
      <p v-if="fakeGoogle" class="text-muted">
        Vývojové přihlášení: místo Googlu se otevře falešný formulář.
      </p>
      <a class="text-accent-dark underline" href="/?ukazka">Prohlédnout ukázku bez přihlášení</a>
      <p class="text-xs text-muted">
        Z účtu Google aplikace použije jen jméno a e-mail. Ostatní ve skupině nikdy neuvidí tvé
        směny, jen zda v daný čas můžeš.
      </p>
    </section>
  </main>
</template>
