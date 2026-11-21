import { expect } from '@playwright/test'
import {
  button,
  checkShift,
  click,
  createAction,
  day,
  importShift,
  login,
  readButton,
  test,
  upload,
} from './helpers'

test('ručně uložená směna zůstane v osobním kalendáři po obnovení stránky', async ({ page }) => {
  await login(page)

  const day = page.getByRole('table').getByRole('button').first()
  await day.click()
  await page.getByRole('button', { name: 'Přidat směnu' }).click()
  await page.getByLabel('Typ směny 1').fill('TEST')
  await page.getByLabel('Začátek směny 1').fill('08:15')
  await page.getByLabel('Konec směny 1').fill('16:45')
  await page.getByRole('button', { name: 'Uložit', exact: true }).click()
  await expect(day).toContainText('TEST')

  await page.reload()
  await expect(day).toContainText('TEST')
  await day.click()
  await expect(page.getByLabel('Typ směny 1')).toHaveValue('TEST')
  await expect(page.getByLabel('Začátek směny 1')).toHaveValue('08:15')
  await expect(page.getByLabel('Konec směny 1')).toHaveValue('16:45')
})

test('import souboru a textu zachová předchozí podklad i opravu', async ({ page }) => {
  await login(page)
  await importShift(page)
  await click(page, /Další týden/)
  await expect(page.getByText('23. 11. – 20. 12. 2026')).toBeVisible()
  await checkShift(page)
  await page.reload()
  await checkShift(page)
  await page.getByLabel('Typ směny 1').fill('OPRA')
  await click(page, 'Uložit')
  await expect(day(page)).toContainText('OPRA')
  await click(page, 'Vložit text')
  await page.getByLabel('Rozpis jako text', { exact: false }).fill('Další rozpis')
  await click(page, 'Vložit')
  await click(page, readButton)
  await expect(page.getByRole('heading', { name: 'Přečtené podklady: 2' })).toBeVisible()
  await page.reload()
  const sources = page.getByRole('region', { name: 'Přečtené podklady: 2' })
  await expect(sources).toContainText('rozpis.txt')
  await expect(sources).toContainText('Vložený text.txt')
  await checkShift(page, 'OPRA')
})

test('ruční volno a návrat k importované směně platí i v akci', async ({ page }) => {
  await login(page)
  await importShift(page)
  await checkShift(page)
  await click(page, 'Ten den nepracuje')
  await expect(day(page)).not.toContainText('R')
  await page.reload()
  await day(page).click()
  await expect(page.getByText('Tento den má volno.')).toBeVisible()
  await click(page, 'Vrátit podle podkladů')
  await expect(day(page)).toContainText('R')
  await checkShift(page)
  await click(page, 'Zavřít')
  await createAction(page)
  await checkShift(page)
})

test('odmítnutý formát obsahuje název souboru', async ({ page }) => {
  await login(page)
  await importShift(page)
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'archiv.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') })
  await expect(page.getByRole('alert')).toHaveText('Tento formát neumíme přečíst: archiv.zip')
  await expect(button(page, readButton)).toBeDisabled()
  await checkShift(page)
})

for (const scenario of [
  {
    content: 'Nečitelný rozpis',
    status: 422,
    message: 'Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.',
  },
  { content: 'Model je vytížený', status: 503, message: 'Došel limit, zkus to za chvíli.' },
  {
    content: 'Osobní limit',
    status: 429,
    message: 'Dnešní limit čtení je vyčerpaný, zkus to zítra.',
    limit: 'READ_LIMIT_PER_USER_PER_DAY',
  },
  {
    content: 'Celkový limit',
    status: 429,
    message: 'Aplikace dnes vyčerpala limit čtení, zkus to zítra.',
    limit: 'READ_LIMIT_TOTAL_PER_DAY',
  },
]) {
  test.describe(scenario.content, () => {
    test.use({ serverEnv: scenario.limit ? { [scenario.limit]: '1' } : {} })
    test('chyba čtení zachová rozpis', async ({ page }) => {
      await login(page)
      await importShift(page)
      await upload(page, 'dalsi.txt', scenario.content)
      const result = page.waitForResponse('**/readings')
      await click(page, readButton)
      expect((await result).status()).toBe(scenario.status)
      await expect(page.getByRole('alert')).toHaveText(scenario.message)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Přečtené podklady: 1' })).toBeVisible()
      await checkShift(page)
    })
  })
}

test('druhé kliknutí během čtení neodešle další požadavek', async ({ page }) => {
  await login(page)
  await upload(page)
  let requests = 0
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/readings', async (route) => {
    requests++
    await hold
    await route.continue()
  })
  try {
    await click(page, readButton)
    const pending = button(page, 'Čtu podklady…')
    await expect(pending).toBeDisabled()
    await expect.poll(() => requests).toBe(1)
    await pending.click({ force: true })
  } finally {
    release()
  }
  await expect(page.getByRole('heading', { name: 'Přečtené podklady: 1' })).toBeVisible()
  expect(requests).toBe(1)
})

test('doptání, parita a zahození nebo použití navržené opravy', async ({ page }) => {
  await login(page)
  await upload(page, 'stridavy.txt', 'Lichá úterý R? 06:00–14:00')
  await click(page, readButton)
  const dialog = page.getByRole('dialog', { name: 'Doptání k podkladu' })
  await expect(dialog).toContainText('R?')
  await click(page, 'Zavřít')
  await click(page, 'Odpovědět')
  await click(page, 'Ano')
  await click(page, 'Lichý')
  await expect(dialog).toContainText('Díky, víc se ptát nemusím')
  const laterTuesday = button(page, /úterý 1\. 12\.:/)
  for (const decision of ['Zahodit', 'Použít změny']) {
    await page.getByLabel('Odpověď vlastními slovy').fill('Směna začíná v 07:00.')
    await click(page, 'Poslat')
    await expect(dialog).toContainText('Co se změní')
    await click(page, decision)
    await expect(button(page, decision)).toHaveCount(0)
    await click(page, 'Zavřít')
    await page.reload()
    await expect(laterTuesday).not.toContainText('R')
    await day(page).click()
    await expect(page.getByLabel('Začátek směny 1')).toHaveValue(
      decision === 'Zahodit' ? '06:00' : '07:00',
    )
    await click(page, 'Zavřít')
    if (decision === 'Zahodit') await click(page, 'Upřesnit podklad stridavy.txt')
  }
})
