// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { expect, it } from 'vitest'
import type { Group } from '@/contract/api'
import InvitePicker from './InvitePicker.vue'

const member = (userId: string, name: string, isYou = false) => ({
  userId,
  name,
  isOwner: isYou,
  isYou,
})

const group: Group = {
  id: 'g',
  name: 'Borci',
  isOwner: true,
  members: [member('me', 'Já', true), member('eva', 'Eva'), member('petr', 'Petr')],
  invites: [],
}

const contacts = [
  { userId: 'eva', name: 'Eva', isFriend: true, groupNames: ['Borci'] },
  { userId: 'petr', name: 'Petr', isFriend: false, groupNames: ['Borci'] },
]

it('marks the whole group as chosen and unchooses it on a second click', async () => {
  const selected = ref<string[]>([])
  const host = document.createElement('div')
  const app = createApp({
    render: () =>
      h(InvitePicker, {
        contacts,
        groups: [group],
        modelValue: selected.value,
        'onUpdate:modelValue': (value: string[]) => (selected.value = value),
      }),
  })
  app.mount(host)
  try {
    const chip = () => host.querySelector<HTMLButtonElement>('button[aria-pressed]')!
    expect(chip().getAttribute('aria-pressed')).toBe('false')

    chip().click()
    await nextTick()
    expect(selected.value).toEqual(['eva', 'petr'])
    expect(chip().getAttribute('aria-pressed')).toBe('true')

    // Jeden člen odebraný ručně: skupina už vybraná není a ukáže, kolik z ní zbývá.
    const eva = host.querySelector<HTMLInputElement>('input[type=checkbox]')!
    eva.checked = false
    eva.dispatchEvent(new Event('change'))
    await nextTick()
    expect(chip().getAttribute('aria-pressed')).toBe('false')
    expect(chip().textContent).toContain('1 z 2')

    chip().click()
    await nextTick()
    chip().click()
    await nextTick()
    expect(selected.value).toEqual([])
  } finally {
    app.unmount()
  }
})
