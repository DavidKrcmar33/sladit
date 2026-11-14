<template>
  <div class="flex h-screen min-h-160 bg-ground text-sm text-ink">
    <aside
      class="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-panel px-4 py-6"
    >
      <slot name="sidebar" />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <slot name="header" />
      <main class="min-h-0 flex-1">
        <slot />
      </main>
    </div>
  </div>
</template>
