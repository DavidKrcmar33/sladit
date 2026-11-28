<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  /** Název otevřené stránky do horní lišty na úzké obrazovce. */
  title: string
  /** Mění se s každou navigací. Po ní se vysunutý panel sám zavře. */
  navKey: string
  /** Něco v panelu čeká na odpověď: tečka na tlačítku menu, aby v zavřeném panelu nezapadla. */
  attention?: boolean
}>()

const collapsed = ref(loadCollapsed())
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem('sladit:sidebar:collapsed') === 'true'
  } catch {
    return false
  }
}
watch(collapsed, (value) => {
  try {
    localStorage.setItem('sladit:sidebar:collapsed', String(value))
  } catch {
    /* Preference je volitelná, navigace funguje i bez úložiště. */
  }
})
function expandSidebar() {
  collapsed.value = false
}

/** Na úzké obrazovce je postranní panel schovaný a vysouvá se zleva. Na široké je vidět stále. */
const open = ref(false)
const drawer = useTemplateRef<HTMLElement>('drawer')
const menuButton = useTemplateRef<HTMLButtonElement>('menuButton')

async function openDrawer() {
  open.value = true
  await nextTick()
  drawer.value?.querySelector<HTMLElement>('button, a[href]')?.focus()
}

function closeDrawer(returnFocus = true) {
  if (!open.value) return
  open.value = false
  if (returnFocus) menuButton.value?.focus()
}

watch(
  () => props.navKey,
  () => closeDrawer(false),
)

function onKeydown(event: KeyboardEvent) {
  // Escape v otevřeném dialogu zavírá jen dialog, panel pod ním zůstane.
  if (event.key !== 'Escape' || !open.value || document.querySelector('dialog[open]')) return
  closeDrawer()
}

// Po roztažení okna na šířku desktopu nesmí panel zůstat „otevřený“ i se clonou přes stránku.
const wide = window.matchMedia('(min-width: 1024px)')
function onWide(event: MediaQueryListEvent) {
  if (event.matches) closeDrawer(false)
}
wide.addEventListener('change', onWide)
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  wide.removeEventListener('change', onWide)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="flex h-dvh bg-ground pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-sm text-ink"
  >
    <!-- Clona za vysunutým panelem: klepnutí mimo panel ho zavře. -->
    <div
      aria-hidden="true"
      :class="[
        'fixed inset-0 z-30 bg-ink/40 transition-opacity duration-200 lg:hidden',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      ]"
      @click="closeDrawer()"
    />
    <aside
      id="app-drawer"
      ref="drawer"
      :class="[
        'sidebar-panel flex min-h-0 shrink-0 flex-col gap-4 overflow-y-auto p-3',
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 ',
        'max-lg:pt-[max(0.75rem,env(safe-area-inset-top))] max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        'max-lg:transition-[width,translate,visibility] max-lg:duration-200 max-lg:ease-out motion-reduce:transition-none',
        open ? 'max-lg:shadow-xl' : 'max-lg:invisible max-lg:-translate-x-full',
        collapsed ? 'sidebar-collapsed' : '',
      ]"
    >
      <div :class="['flex items-center gap-2 p-1', collapsed ? 'flex-col' : '']">
        <p class="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold" aria-label="Sladit">
          <svg viewBox="0 0 32 32" aria-hidden="true" class="size-8 shrink-0">
            <circle cx="16" cy="16" r="15" class="fill-cta" />
            <circle cx="16" cy="16" r="8" class="fill-white" />
          </svg>
          <span v-if="!collapsed">Sladit</span>
        </p>
        <button
          type="button"
          class="sidebar-icon-button"
          :aria-label="collapsed ? 'Rozbalit navigaci' : 'Sbalit navigaci'"
          :title="collapsed ? 'Rozbalit navigaci' : 'Sbalit navigaci'"
          :aria-expanded="!collapsed"
          aria-controls="sidebar-navigation"
          @click="collapsed = !collapsed"
        >
          <UiIcon :name="collapsed ? 'chevron-right' : 'chevron-left'" :size="18" />
        </button>
      </div>
      <div
        id="sidebar-navigation"
        :class="['flex flex-1 flex-col', collapsed ? 'gap-1.5' : 'gap-4']"
      >
        <slot name="sidebar" :collapsed="collapsed" :expand="expandSidebar" />
      </div>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <div
        class="flex shrink-0 items-center gap-1 border-b border-line bg-ground pt-[env(safe-area-inset-top)] pr-4 pl-1 lg:hidden"
      >
        <button
          ref="menuButton"
          type="button"
          aria-label="Menu"
          aria-controls="app-drawer"
          :aria-expanded="open"
          class="relative flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent"
          @click="openDrawer"
        >
          <UiIcon name="menu" :size="22" />
          <span
            v-if="attention"
            class="absolute top-2 right-2 size-2.5 rounded-full border-2 border-ground bg-accent"
          />
        </button>
        <img src="/favicon.svg" alt="" class="size-5 shrink-0" />
        <p class="min-w-0 truncate py-3 pl-2 text-base font-semibold tracking-tight">
          {{ title }}
        </p>
      </div>
      <slot name="header" />
      <!-- Sloupec: upozornění nahoře zaberou místo a stránka pod nimi se zmenší a roluje sama,
           místo aby přetekla a rolovala se celá aplikace. -->
      <main class="flex min-h-0 flex-1 flex-col">
        <slot />
      </main>
    </div>
  </div>
</template>
