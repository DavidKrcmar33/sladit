<template>
  <ul class="flex flex-wrap gap-x-5 gap-y-2 text-muted">
    <li class="flex items-center gap-2">
      <span class="size-3.5 rounded-sm bg-free" />
      Může
    </li>
    <li class="flex items-center gap-2">
      <span class="size-3.5 rounded-sm border-2 border-accent-ring bg-white" />
      Může jen část okna
    </li>
    <li class="flex items-center gap-2">
      <span class="size-3.5 rounded-sm bg-shift" />
      Nemůže
    </li>
    <li class="flex items-center gap-2">
      <span class="size-3.5 rounded-sm border-2 border-dashed border-warn bg-shift" />
      Nejisté čtení
    </li>
    <li class="flex items-center gap-2">
      <span class="size-3.5 rounded-sm bg-hatch" />
      Rozpis chybí
    </li>
    <li>V buňce je směna z rozpisu a u částečně volného dne i čas, kdy se vejde.</li>
  </ul>
</template>
