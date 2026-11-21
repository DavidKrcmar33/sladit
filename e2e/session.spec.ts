import { expect } from '@playwright/test'
import { sampleAction } from '../src/core/fixtures'
import { STORAGE_KEY } from '../src/core/storage'
import {
  button,
  click,
  email,
  googleLogin,
  login,
  people,
  readButton,
  test,
  upload,
} from './helpers'

test.describe('Omezený přístup', () => {
  test.use({ serverEnv: { ALLOWED_EMAILS: 'povoleny@example.com' } })

  test('seznam povolených účtů a trvalé odhlášení', async ({ page, guest }) => {
    await login(page, 'Povolený', 'povoleny@example.com')
    await guest.goto('/')
    await googleLogin(guest, email(), 'Jiný účet')
    await expect(guest.getByRole('alert')).toHaveText('Tento účet zatím do aplikace nemá přístup.')
    await click(page, 'Odhlásit')
    await page.getByRole('dialog').getByRole('button', { name: 'Odhlásit' }).click()
    await expect(button(page, 'Přihlásit přes Google')).toBeVisible()
    await page.reload()
    await expect(button(page, 'Přihlásit přes Google')).toBeVisible()
  })
})

test('po vypršení aktivní relace zmizí osobní data', async ({
  page,
  server,
}) => {
  const address = email()
  await login(page, 'Soukromé jméno', address)
  await click(page, 'Nastavení')
  await click(page, 'Změnit jméno')
  await page.getByLabel('Jméno, pod kterým tě vidí ostatní').fill('Nové jméno')
  server.advanceDays(31)
  const response = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/people/'),
  )
  await click(page, 'Uložit')
  expect((await response).status()).toBe(401)
  await expect(button(page, 'Přihlásit přes Google')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(address)
  await expect(page.locator('body')).not.toContainText('Soukromé jméno')
  await expect(button(page, 'Můj rozvrh')).toHaveCount(0)
})

test('odložení a převzetí lokální akce bez původních osob', async ({ page }) => {
  await page.goto('/')
  const stored = JSON.stringify({
    actions: [sampleAction],
    selectedActionId: sampleAction.id,
    stepByActionId: {},
  })
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, stored])
  await googleLogin(page, email(), 'Organizátor')
  await click(page, 'Teď ne')
  await expect(button(page, 'Převzít')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(stored)
  await page.reload()
  await click(page, 'Převzít')
  const action = button(page, /^Vánoční deskovky/)
  await expect(action).toBeVisible()
  await page.reload()
  await action.click()
  await expect(button(page, 'Převzít')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  await expect(people(page).getByRole('listitem')).toHaveText(/Organizátor.*pořádá/s)
  await click(page, 'Upravit akci')
  for (const [field, value] of [
    ['Název', sampleAction.name],
    ['Od', sampleAction.from],
    ['Do', sampleAction.to],
    ['Nejdřív od', sampleAction.windowStart],
    ['Nejpozději do', sampleAction.windowEnd],
    ['Délka akce', String(sampleAction.durationMinutes)],
  ])
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(value)
})

test('ukázková akce, soukromé stavy, přátelé a odmítnutí čtení', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Prohlédnout ukázku bez přihlášení' }).click()
  await expect(page.locator('header')).toContainText(sampleAction.name)
  for (const state of ['může', 'nemůže', 'nevíme']) {
    await expect(page.getByRole('img', { name: new RegExp(`: ${state}$`) }).first()).toBeVisible()
  }
  await click(page, /^Přátelé/)
  for (const name of ['Eva', 'Jana', 'Petr', 'Tomáš'])
    await expect(page.getByRole('listitem').getByText(name, { exact: true })).toBeVisible()
  await click(page, 'Můj rozvrh')
  await upload(page)
  await click(page, readButton)
  await expect(page.getByRole('alert')).toContainText('V ukázce se podklady nečtou')
})

for (const signedIn of [true, false]) {
  test(`opakování inicializace ${signedIn ? 's účtem' : 'bez účtu'} bez obnovení stránky`, async ({
    page,
  }) => {
    if (signedIn) await login(page)
    await page.route('**/api/me', (route) => route.abort('failed'), { times: 1 })
    await page.goto('/')
    await expect(page.getByRole('alert')).toHaveText('Server je nedostupný. Zkontroluj připojení.')
    let navigations = 0
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations++
    })
    await click(page, 'Zkusit znovu')
    await expect(button(page, signedIn ? 'Můj rozvrh' : 'Přihlásit přes Google')).toBeVisible()
    expect(navigations).toBe(0)
  })
}
