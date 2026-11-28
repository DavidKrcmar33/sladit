<script setup lang="ts">
export type IconName =
  | 'circle-alert'
  | 'calendar-search'
  | 'trash'
  | 'download'
  | 'pencil'
  | 'check'
  | 'close'
  | 'arrow-right'
  | 'plus'
  | 'settings'
  | 'logout'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'menu'
  | 'calendar'
  | 'users'

const { name, size = 16 } = defineProps<{ name: IconName; size?: number }>()

const paths: Record<IconName, string[]> = {
  'circle-alert': ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 8v4', 'M12 16h.01'],
  'calendar-search': [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M10 21H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5',
    'M17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    'M20 20l2 2',
  ],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 16v5h14v-5'],
  pencil: ['M16 4l4 4', 'M4 20l4-1L21 6a2.12 2.12 0 0 0-3-3L5 16z'],
  calendar: [
    'M8 3v4',
    'M16 3v4',
    'M3 10h18',
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  ],
  users: [
    'M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8',
    'M2 21v-2a6 6 0 0 1 12 0v2',
    'M17 4a4 4 0 0 1 0 8',
    'M22 21v-2a6 6 0 0 0-4-5.65',
  ],
  check: ['M5 12l5 5 9-10'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  // Ozubené kolo podle ikony „settings“ z Lucide (licence ISC).
  settings: [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  ],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
}
</script>

<template>
  <svg
    aria-hidden="true"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path v-for="path in paths[name]" :key="path" :d="path" />
  </svg>
</template>
