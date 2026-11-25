import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  acceptAction,
  actionName,
  button,
  click,
  createAction,
  email,
  friends,
  importShift,
  login,
  openAction,
  proposeWednesday,
  test,
} from './helpers'

async function consent(page: Page, allow = true) {
  await click(page, 'Nastavení')
  await click(page, 'Připojit Google Kalendář')
  await page.getByRole('link', { name: allow ? 'Povolit' : 'Zamítnout' }).click()
  await expect(page.getByRole('heading', { name: 'Nastavení' })).toBeVisible()
}

test('povolení, synchronizace obsazenosti a odpojení kalendáře', async ({ page, server }) => {
  const address = email()
  await login(page, 'Anna', address)
  await consent(page)
  const card = page.getByRole('region', { name: 'Google Kalendář' })
  await expect(card).toContainText('Připojeno.')
  const today = new Date().toISOString().slice(0, 10)
  server.calendar.busy.set(address, [{ start: today + 'T17:00:00Z', end: today + 'T19:00:00Z' }])
  await page.clock.setFixedTime(new Date(today + 'T12:00:00Z'))
  await page.reload()
  await click(page, 'Nastavení')
  const sync = page.waitForResponse('**/api/calendar/sync')
  await click(page, 'Načíst znovu')
  expect((await sync).ok()).toBe(true)
  await click(page, 'Můj rozvrh')
  const occupied = page.getByRole('table').getByRole('button', { name: /v kalendáři/i })
  await expect(occupied).toHaveCount(1)
  await click(page, 'Nastavení')
  await click(page, 'Odpojit')
  await expect(button(page, 'Připojit Google Kalendář')).toBeVisible()
  // Obnovení stránky zůstane v Nastavení, Můj rozvrh se otevře ručně.
  await page.reload()
  await click(page, 'Můj rozvrh')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(occupied).toHaveCount(0)
})

test('zamítnutý souhlas a vypršelé připojení', async ({ page, server }) => {
  const address = email()
  await login(page, 'Anna', address)
  await consent(page, false)
  await expect(page.getByRole('status')).toContainText('Připojení kalendáře bylo zamítnuto.')
  await consent(page)
  server.calendar.expire(address)
  await click(page, 'Načíst znovu')
  await expect(page.getByRole('alert')).toContainText('Přístup ke kalendáři vypršel.')
  await click(page, 'Připojit znovu')
  await page.getByRole('link', { name: 'Povolit' }).click()
  await expect(page.getByRole('region', { name: 'Google Kalendář' })).toContainText('Připojeno.')
})

test('integrace ve stavu unavailable', async ({ page }) => {
  await page.route('**/api/calendar', (route) =>
    route.fulfill({
      json: {
        calendar: {
          state: 'unavailable',
          autoWrite: false,
          canWrite: false,
          syncedAt: null,
        },
      },
    }),
  )
  await login(page)
  await click(page, 'Nastavení')
  await expect(
    page.getByText('Google Kalendář teď připojit nejde, server ho nemá nastavený.'),
  ).toBeVisible()
  await expect(button(page, 'Připojit Google Kalendář')).toHaveCount(0)
})

test('opakované kliknutí zapíše do falešného kalendáře jedinou událost', async ({
  page,
  server,
}) => {
  const address = email()
  await login(page, 'Anna', address)
  await consent(page)
  await click(page, 'Můj rozvrh')
  await importShift(page)
  await createAction(page)
  await proposeWednesday(page)
  await button(page, 'Přidat').dblclick()
  await expect(button(page, 'V kalendáři · odebrat')).toBeVisible()
  await openAction(page)
  await expect(button(page, 'V kalendáři · odebrat')).toBeVisible()
  const events = server.calendar.events.get(address)
  expect([...(events?.values() ?? [])]).toEqual([expect.objectContaining({ title: actionName })])
})

test('automatický zápis po Jdu a odstranění po Nejdu', async ({ page, guest, server }) => {
  const address = await friends(page, guest)
  await consent(guest)
  const auto = guest.getByRole('checkbox', { name: /automaticky/ })
  const saved = guest.waitForResponse(
    (r) => r.url().endsWith('/api/calendar') && r.request().method() === 'PATCH',
  )
  await auto.check()
  expect((await saved).ok()).toBe(true)
  await click(page, 'Můj rozvrh')
  await importShift(page)
  await createAction(page, true)
  await acceptAction(guest)
  await openAction(page)
  await proposeWednesday(page)
  await openAction(guest)
  await click(guest, 'Jdu')
  await expect(button(guest, 'V kalendáři · odebrat')).toBeVisible()
  const events = () => [...(server.calendar.events.get(address)?.values() ?? [])]
  expect(events()).toEqual([expect.objectContaining({ title: actionName })])
  await openAction(page)
  await expect(page.getByText('Domluveno', { exact: true })).toBeVisible()
  await click(guest, 'Změnit odpověď')
  await click(guest, 'Nejdu')
  await expect(button(guest, 'Změnit odpověď')).toBeVisible()
  expect(events()).toEqual([])
  await openAction(page)
  await expect(page.getByRole('status')).toContainText('Nejdou: Eva')
})

test('skutečné stažení ICS bez připojeného kalendáře', async ({ page }) => {
  await login(page)
  await importShift(page)
  await createAction(page)
  await proposeWednesday(page)
  const downloaded = page.waitForEvent('download')
  await click(page, 'Stáhnout .ics')
  const file = await downloaded
  expect(file.suggestedFilename()).toMatch(/\.ics$/)
  const lines = (await readFile((await file.path())!, 'utf8')).split('\r\n')
  const event = lines.slice(lines.indexOf('BEGIN:VEVENT') + 1, lines.indexOf('END:VEVENT'))
  expect(event).toEqual(
    expect.arrayContaining([
      'SUMMARY:' + actionName,
      'DTSTART;TZID=Europe/Prague:20261125T080000',
      'DTEND;TZID=Europe/Prague:20261125T110000',
    ]),
  )
})
