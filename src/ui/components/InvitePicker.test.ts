// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, expect, it } from 'vitest'
import type { Group } from '@/contract/api'
import InvitePicker from './InvitePicker.vue'

const member = (userId: string, name: string, isYou = false) => ({
  userId,
  name,
  isOwner: isYou,
  isYou,
})

function group(id: string, name: string, ...members: [string, string][]): Group {
  return {
    id,
    name,
    isOwner: true,
    members: [member('me', 'Já', true), ...members.map(([userId, n]) => member(userId, n))],
    invites: [],
  }
}

const borci = group('g', 'Borci', ['eva', 'Eva'], ['petr', 'Petr'], ['jana', 'Jana'])
/** Menší skupina, celá uvnitř Borců. */
const kluci = group('k', 'Kluci', ['petr', 'Petr'], ['jana', 'Jana'])

const contacts = [
  { userId: 'eva', name: 'Eva', isFriend: true, groupNames: ['Borci'] },
  { userId: 'petr', name: 'Petr', isFriend: false, groupNames: ['Borci', 'Kluci'] },
  { userId: 'jana', name: 'Jana', isFriend: false, groupNames: ['Borci', 'Kluci'] },
]

let unmount = () => {}
afterEach(() => unmount())

function mount(initial: string[] = []) {
  const selected = ref<string[]>(initial)
  const host = document.createElement('div')
  const app = createApp({
    render: () =>
      h(InvitePicker, {
        contacts,
        groups: [borci, kluci],
        modelValue: selected.value,
        'onUpdate:modelValue': (value: string[]) => (selected.value = value),
      }),
  })
  app.mount(host)
  unmount = () => app.unmount()
  const chip = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((button) =>
      button.textContent?.includes(name),
    )!
  const pressed = (name: string) => chip(name).getAttribute('aria-pressed')
  async function uncheck(index: number) {
    const box = host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[index]
    box.checked = false
    box.dispatchEvent(new Event('change'))
    await nextTick()
  }
  return { selected, chip, pressed, uncheck }
}

it('marks only the group I clicked, not a smaller group inside it', async () => {
  const { selected, chip, pressed } = mount()
  chip('Borci').click()
  await nextTick()
  expect(selected.value).toEqual(['eva', 'petr', 'jana'])
  expect(pressed('Borci')).toBe('true')
  expect(pressed('Kluci')).toBe('false')

  // Odebrání menší skupiny nevezme lidi, kteří patří i do zvolené větší.
  chip('Kluci').click()
  await nextTick()
  chip('Kluci').click()
  await nextTick()
  expect(selected.value).toEqual(['eva', 'petr', 'jana'])
  expect(pressed('Kluci')).toBe('false')
})

it('shows how many are left when I remove someone, and unchooses the group on a click', async () => {
  const { selected, chip, pressed, uncheck } = mount()
  chip('Borci').click()
  await nextTick()
  await uncheck(0)
  expect(pressed('Borci')).toBe('true')
  expect(chip('Borci').textContent).toContain('2 z 3')

  chip('Borci').click()
  await nextTick()
  expect(selected.value).toEqual([])
  expect(pressed('Borci')).toBe('false')
})

it('starts with the largest group already chosen when its members come preselected', () => {
  const { pressed } = mount(['eva', 'petr', 'jana'])
  expect(pressed('Borci')).toBe('true')
  expect(pressed('Kluci')).toBe('false')
})
