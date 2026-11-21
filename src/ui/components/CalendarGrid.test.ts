// @vitest-environment happy-dom
import { createApp } from 'vue'
import { expect, it, vi } from 'vitest'
import { privateRow, type CalendarView } from '@/core/calendar'
import CalendarGrid from './CalendarGrid.vue'

it('opens an owned day but keeps another participant’s day read-only', () => {
  const date = '2026-11-23'
  const calendar: CalendarView = {
    dates: [date],
    rows: [
      {
        personId: 'anna',
        personName: 'Anna',
        days: [
          { status: { kind: 'free' }, attendance: 'available', windows: [], isPartial: false },
        ],
      },
      privateRow('petr', 'Petr', [date], ['busy']),
    ],
  }
  const select = vi.fn()
  const host = document.createElement('div')
  const app = createApp(CalendarGrid, { calendar, selectedDay: null, onSelect: select })
  app.mount(host)
  try {
    const [own, foreign] = host.querySelectorAll('tbody tr')
    const privateCell = foreign.querySelector<HTMLElement>('[role="img"]')!
    expect(privateCell.textContent).toContain('nemůže')
    expect(foreign.querySelector('button')).toBeNull()
    privateCell.click()
    expect(select).not.toHaveBeenCalled()
    own.querySelector('td button')!.dispatchEvent(new MouseEvent('click'))
    expect(select).toHaveBeenCalledExactlyOnceWith({ personId: 'anna', date })
  } finally {
    app.unmount()
  }
})
