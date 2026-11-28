import type { IconName } from './components/UiIcon.vue'

export const sectionIcons = {
  schedule: 'calendar-days',
  actions: 'party-popper',
  friends: 'users',
  groups: 'users-round',
  settings: 'settings',
  logout: 'logout',
} as const satisfies Record<string, IconName>
