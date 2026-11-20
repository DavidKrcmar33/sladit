<template>
  <div class="flex h-screen min-h-160 bg-ground text-sm text-ink">
    <aside
      class="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-panel px-4 py-6"
    >
      <slot name="sidebar" />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <slot name="header" />
      <!-- Sloupec: upozornění nahoře zaberou místo a stránka pod nimi se zmenší a roluje sama,
           místo aby přetekla a rolovala se celá aplikace. -->
      <main class="flex min-h-0 flex-1 flex-col">
        <slot />
      </main>
    </div>
  </div>
</template>
