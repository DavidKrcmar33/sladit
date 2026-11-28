<script setup lang="ts">
export type IconName =
  | 'calendar-days'
  | 'party-popper'
  | 'users-round'
  | 'hourglass'
  | 'circle-check'
  | 'clock'
  | 'circle-help'
  | 'vote'
  | 'upload'
  | 'user-plus'
  | 'mail'
  | 'link'
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
  'calendar-days': [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M8 14h.01',
    'M12 14h.01',
    'M16 14h.01',
    'M8 18h.01',
    'M12 18h.01',
    'M16 18h.01',
  ],
  'party-popper': [
    'M5.8 11.3 2 22l10.7-3.79',
    'M4 3h.01',
    'M22 8h.01',
    'M15 2h.01',
    'M22 20h.01',
    'M22 2l-2.24.75a2.9 2.9 0 0 0-1.96 3.12 2.9 2.9 0 0 1-2.2 3.19l-.5.13',
    'M22 13l-.82-.33a2.9 2.9 0 0 0-3.16.63l-.82.82',
    'M11 2l.33.82a2.9 2.9 0 0 1-.63 3.16l-.82.82',
    'M7.66 15.34c2.93 2.93 6.1 4.5 7.07 3.53s-.6-4.14-3.53-7.07-6.1-4.5-7.07-3.53.6 4.14 3.53 7.07z',
  ],
  'users-round': [
    'M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    'M2 21v-2a8 8 0 0 1 16 0v2',
    'M18 2a4 4 0 0 1 0 8',
    'M22 21v-2a8 8 0 0 0-3-6.24',
  ],
  hourglass: ['M5 2h14', 'M5 22h14', 'M6 2v6l6 4-6 4v6', 'M18 2v6l-6 4 6 4v6'],

  'circle-check': ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M8 12l3 3 5-6'],
  'circle-help': [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
    'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
  vote: ['M9 12l2 2 4-4', 'M5 7l7-5 7 5-7 10z', 'M5 13H3v8h18v-8h-2'],
  upload: ['M12 16V3', 'M7 8l5-5 5 5', 'M4 16v5h16v-5'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 6v6l4 2'],
  'user-plus': [
    'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    'M2 21v-2a6 6 0 0 1 12 0v2',
    'M19 8v6',
    'M16 11h6',
  ],
  mail: [
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M22 6l-10 7L2 6',
  ],
  link: [
    'M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.5 1.5',
    'M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5',
  ],
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
