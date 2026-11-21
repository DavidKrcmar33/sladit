import { expect, test as base, type Page } from '@playwright/test'
import type { startServer } from './server'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

export const email = () => `test-${randomUUID()}@example.com`
export const actionName = 'Společná snídaně'
export const groupName = 'Deskový klub'
export const button = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' })
export const click = (page: Page, name: string | RegExp) => button(page, name).click()
export const people = (page: Page) => page.getByRole('region', { name: 'Účastníci' })
export const actionButton = (page: Page) => button(page, /^Společná snídaně/)
export const groupButton = (page: Page) => button(page, /^Deskový klub/)
export const day = (page: Page) => button(page, /úterý 24\. 11\.:/i)
export const readButton = 'Přečíst podklady'

type TestServer = Awaited<ReturnType<typeof startServer>>
export const test = base.extend<{
  guest: Page
  server: TestServer
  serverEnv: Record<string, string>
}>({
  serverEnv: [{}, { option: true }],
  server: async ({ serverEnv }, use) => {
    const bundle = pathToFileURL(resolve('node_modules/.cache/sladit-e2e-server/server.mjs'))
    const { startServer } = (await import(bundle.href)) as typeof import('./server')
    const server = await startServer(serverEnv)
    try {
      await use(server)
    } finally {
      await server.close()
    }
  },
  baseURL: async ({ server }, use) => {
    await use(server.origin)
  },
  guest: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({ baseURL })
    try {
      await use(await context.newPage())
    } finally {
      await context.close()
    }
  },
})

export async function googleLogin(page: Page, address: string, name: string) {
  await click(page, 'Přihlásit přes Google')
  await page.getByLabel('E-mail').fill(address)
  await page.getByLabel('Jméno').fill(name)
  await click(page, 'Přihlásit')
}

export async function login(page: Page, name = 'Anna', address = email()) {
  await page.clock.setFixedTime(new Date('2026-11-21T12:00:00Z'))
  await page.goto('/')
  await googleLogin(page, address, name)
  await expect(button(page, 'Můj rozvrh')).toBeVisible()
}

export async function upload(page: Page, name = 'rozpis.txt', content = 'Úterý R 06:00–14:00') {
  await page
    .locator('input[type=file]')
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) })
}

export async function importShift(page: Page, name = 'rozpis.txt') {
  await upload(page, name)
  await click(page, readButton)
  await expect(page.getByRole('heading', { name: 'Přečtené podklady: 1' })).toBeVisible()
}

export async function checkShift(page: Page, label = 'R') {
  await day(page).click()
  await expect(page.getByLabel('Typ směny 1')).toHaveValue(label)
  await expect(page.getByLabel('Začátek směny 1')).toHaveValue('06:00')
  await expect(page.getByLabel('Konec směny 1')).toHaveValue('14:00')
}

export async function sendRequest(page: Page, address: string) {
  await click(page, /^Přátelé/)
  await click(page, 'Přidat přítele podle e-mailu')
  await page.getByLabel('E-mail kamaráda').fill(address)
  await click(page, 'Poslat žádost')
  await expect(button(page, `Zrušit žádost: ${address}`)).toBeVisible()
}

export async function friends(owner: Page, guest: Page) {
  const address = email()
  await login(owner)
  await sendRequest(owner, address)
  await login(guest, 'Eva', address)
  await expect(guest.getByRole('status')).toContainText('Anna tě chce přidat')
  await click(guest, 'Zobrazit')
  await click(guest, 'Přijmout')
  await expect(button(guest, 'Odebrat z přátel: Anna')).toBeVisible()
  await owner.reload()
  await click(owner, /^Přátelé/)
  await expect(button(owner, 'Odebrat z přátel: Eva')).toBeVisible()
  return address
}

export async function fillAction(page: Page, to = '2026-11-25') {
  await page.getByLabel('Název', { exact: true }).fill(actionName)
  await page.getByLabel('Od', { exact: true }).fill('2026-11-23')
  await page.getByLabel('Do', { exact: true }).fill(to)
  await page.getByLabel('Nejdřív od').fill('08:00')
  await page.getByLabel('Nejpozději do').fill('11:00')
}

export async function createAction(page: Page, invite = false, to?: string) {
  await click(page, 'Nová akce')
  await fillAction(page, to)
  if (invite) await page.getByRole('checkbox', { name: /Eva/ }).check()
  await click(page, 'Založit akci')
  await expect(people(page)).toContainText('pořádá')
}

export async function openAction(page: Page) {
  await page.reload()
  await actionButton(page).click()
  await expect(people(page)).toBeVisible()
}

export async function acceptAction(guest: Page) {
  await openAction(guest)
  await click(guest, 'Přijmout')
  await click(guest, 'Souhlasím, přijmout')
  await expect(button(guest, 'Odejít z akce')).toBeVisible()
}

export async function createGroup(page: Page) {
  await click(page, 'Nová skupina')
  await page.getByLabel('Název skupiny').fill(groupName)
  await click(page, 'Založit')
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
}

export async function proposeWednesday(page: Page) {
  const proposal = page.getByRole('listitem').filter({ hasText: 'středa 25. 11.' })
  await expect(proposal).toContainText('08:00–11:00')
  await proposal.getByRole('button', { name: 'Navrhnout tento termín' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Navržený termín' })).toContainText(
    'středa 25. 11., 08:00–11:00',
  )
}
