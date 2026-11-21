import { expect } from '@playwright/test'
import {
  acceptAction,
  actionButton,
  actionName,
  button,
  checkShift,
  click,
  createAction,
  day,
  fillAction,
  friends,
  importShift,
  login,
  openAction,
  people,
  proposeWednesday,
  test,
} from './helpers'

test('validace, úprava, vrácení a smazání akce', async ({ page }) => {
  await login(page)
  await click(page, 'Nová akce')
  await fillAction(page)
  await page.getByLabel('Délka akce').selectOption('240')
  await click(page, 'Založit akci')
  await expect(page.getByRole('dialog')).toContainText('Akce se do denního okna nevejde')
  await page.getByLabel('Délka akce').selectOption('180')
  await click(page, 'Založit akci')
  await expect(actionButton(page)).toHaveAttribute('aria-current', 'page')
  await expect(people(page).getByRole('listitem')).toHaveText(/Anna.*pořádá/s)
  await click(page, 'Upravit akci')
  await page.getByLabel('Název', { exact: true }).fill('Oběd')
  await page.getByLabel('Délka akce').selectOption('60')
  await click(page, 'Uložit změny')
  await expect(page.locator('header')).toContainText('Oběd')
  await click(page, 'Vrátit')
  await expect(page.locator('header')).toContainText(actionName)
  await click(page, 'Upravit akci')
  await expect(page.getByLabel('Délka akce')).toHaveValue('180')
  await click(page, 'Zrušit')
  await click(page, 'Smazat akci')
  await click(page, 'Smazat')
  await expect(page.getByRole('heading', { name: 'Můj rozvrh' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Zatím žádné akce.')).toBeVisible()
})

test('souhlas, odmítnutí a opětovná pozvánka', async ({ page, guest }) => {
  await friends(page, guest)
  await createAction(page, true)
  await openAction(guest)
  await click(guest, 'Přijmout')
  await click(guest, 'Zpět')
  await expect(button(guest, 'Přijmout')).toBeVisible()
  await openAction(page)
  await expect(people(page)).toContainText('pozvánka čeká')
  await expect(page.getByRole('rowheader', { name: /Eva/ })).toHaveCount(0)
  await click(guest, 'Odmítnout')
  await expect(actionButton(guest)).toHaveCount(0)
  await openAction(page)
  await expect(people(page)).toContainText('odmítnuto')
  await click(page, 'Pozvat další')
  await page.getByRole('checkbox', { name: /Eva/ }).check()
  await click(page, 'Pozvat')
  await expect(people(page)).toContainText('pozvánka čeká')
  await acceptAction(guest)
  await openAction(page)
  await expect(page.getByRole('rowheader', { name: /Eva/ })).toBeVisible()
  await expect(people(page)).toContainText('v akci')
})

test('vlastní editor a soukromí tří stavů v kalendáři a návrzích', async ({ page, guest }) => {
  await friends(page, guest)
  await click(guest, 'Můj rozvrh')
  await importShift(guest, 'soukromy-rozpis.txt')
  await click(page, 'Můj rozvrh')
  for (const date of [/neděle 22\. 11\.:/, /pondělí 23\. 11\.:/, /úterý 24\. 11\.:/]) {
    await click(page, date)
    await click(page, 'Ten den nepracuje')
    await expect(button(page, date)).not.toHaveAccessibleName(/chybí/)
  }
  await click(page, 'Nová akce')
  await fillAction(page, '2026-11-25')
  await page.getByLabel('Od', { exact: true }).fill('2026-11-22')
  await page.getByRole('checkbox', { name: /Eva/ }).check()
  await click(page, 'Založit akci')
  await expect(people(page)).toContainText('Eva')
  await acceptAction(guest)
  await checkShift(guest)
  await guest.getByLabel('Typ směny 1').fill('SOUK')
  await click(guest, 'Uložit')
  await expect(day(guest)).toContainText('SOUK')
  await openAction(page)
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Eva/ }) })
  for (const label of [
    'neděle 22. 11.: nevíme',
    'pondělí 23. 11.: nevíme',
    'středa 25. 11.: může',
    'úterý 24. 11.: nemůže',
  ]) {
    await expect(row.getByRole('img', { name: `Eva, ${label}`, exact: true })).toBeVisible()
  }
  await expect(row.getByRole('button')).toHaveCount(0)
  await row.getByRole('img').last().click()
  await expect(page.getByLabel('Typ směny 1')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/SOUK|soukromy-rozpis\.txt/)
  const proposals = page.getByRole('region', { name: 'Návrhy termínů' })
  await expect(proposals).toContainText('Chybí: Eva')
  await expect(proposals).toContainText('Neznámo: Eva')
})

test('odpovědi, protinávrh a zrušení dohody změnou období', async ({ page, guest }) => {
  await friends(page, guest)
  await click(page, 'Můj rozvrh')
  await importShift(page)
  await createAction(page, true, '2026-11-26')
  await proposeWednesday(page)
  const banner = page.getByRole('status').filter({ hasText: 'Navržený termín' })
  await expect(banner).not.toContainText('Domluveno')
  await acceptAction(guest)
  await click(guest, 'Jdu')
  await expect(guest.getByText('Domluveno', { exact: true })).toBeVisible()
  await openAction(page)
  await expect(banner).toContainText('Jdou: Anna, Eva')
  await click(guest, 'Změnit odpověď')
  await click(guest, 'Nejdu')
  await expect(guest.getByText('Nejdeš.', { exact: false }).first()).toBeVisible()
  await openAction(page)
  await expect(banner).toContainText('Nejdou: Eva')
  await expect(banner).not.toContainText('Domluveno')
  await click(guest, 'Změnit odpověď')
  await click(guest, 'Navrhnout jiný')
  await guest.getByLabel('Jiný den').fill('2026-11-26')
  await guest.getByLabel('Od', { exact: true }).fill('08:00')
  await click(guest, 'Navrhnout')
  await expect(guest.getByText(/Tvůj návrh:/)).toBeVisible()
  await openAction(page)
  await click(page, 'Přijmout tento termín')
  await expect(banner).toContainText('čtvrtek 26. 11.')
  await expect(banner).toContainText('Domluveno')
  await openAction(guest)
  await expect(guest.getByRole('status')).toContainText(/čtvrtek 26\. 11\..*Domluveno/s)
  await click(page, 'Upravit akci')
  await page.getByLabel('Do', { exact: true }).fill('2026-11-25')
  await click(page, 'Uložit změny')
  await expect(banner).toHaveCount(0)
  await openAction(guest)
  await expect(guest.getByText(/Anna navrhuje termín/)).toHaveCount(0)
  await proposeWednesday(page)
  await expect(banner).toContainText('Čeká: Eva')
  await openAction(guest)
  await expect(button(guest, 'Jdu')).toBeVisible()
})
