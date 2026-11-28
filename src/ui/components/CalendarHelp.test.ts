// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, expect, it } from 'vitest'
import CalendarHelp from './CalendarHelp.vue'

let cleanup = () => {}
afterEach(() => cleanup())

it('toggles the legend and closes on outside interaction or Escape', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(CalendarHelp)
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  const button = host.querySelector('button')!
  const legend = () => host.querySelector('[role="region"]')
  expect(legend()).toBeNull()
  button.click()
  await nextTick()
  expect(legend()).not.toBeNull()
  expect(button.getAttribute('aria-expanded')).toBe('true')
  legend()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await nextTick()
  expect(legend()).not.toBeNull()
  button.click()
  await nextTick()
  expect(legend()).toBeNull()
  button.click()
  await nextTick()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await nextTick()
  expect(legend()).toBeNull()
  button.click()
  await nextTick()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await nextTick()
  expect(legend()).toBeNull()
  expect(document.activeElement).toBe(button)
  expect(button.getAttribute('aria-expanded')).toBe('false')
})
