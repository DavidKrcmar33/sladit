import { expect } from '@playwright/test'
import {
  acceptAction,
  actionButton,
  button,
  click,
  createAction,
  createGroup,
  email,
  fillAction,
  friends,
  googleLogin,
  groupButton,
  groupName,
  login,
  openAction,
  people,
  sendRequest,
  test,
} from './helpers'

test('přijetí po prvním přihlášení a odebrání přítele', async ({ page, guest }) => {
  await friends(page, guest)
  await click(page, 'Odebrat z přátel: Eva')
  await click(page, 'Odebrat')
  await expect(page.getByText(/Zatím tu nikdo není/)).toBeVisible()
  await guest.reload()
  await click(guest, /^Přátelé/)
  await expect(guest.getByText(/Zatím tu nikdo není/)).toBeVisible()
})

for (const cancel of [false, true]) {
  test(`${cancel ? 'zrušení odesílatelem' : 'odmítnutí příjemcem'}`, async ({
    page,
    guest,
  }) => {
    const address = email()
    await login(page)
    await sendRequest(page, address)
    await login(guest, 'Eva', address)
    await click(guest, 'Zobrazit')
    await expect(guest.getByRole('region', { name: 'Žádosti o přátelství' })).toContainText('Anna')
    if (cancel) await click(page, `Zrušit žádost: ${address}`)
    else await click(guest, 'Odmítnout')
    await expect(
      button(cancel ? page : guest, cancel ? `Zrušit žádost: ${address}` : 'Odmítnout'),
    ).toHaveCount(0)
    for (const user of [page, guest]) {
      await user.reload()
      await click(user, /^Přátelé/)
      await expect(user.getByText(/Zatím tu nikdo není/)).toBeVisible()
      await expect(
        user.getByRole('heading', { name: /^(Žádosti o přátelství|Odeslané žádosti)$/ }),
      ).toHaveCount(0)
    }
  })
}

for (const [kind, invalid] of [
  ['osobní', ''],
  ['skupinový', ''],
  ['osobní', 'odvolaný'],
  ['skupinový', 'prošlý'],
] as const) {
  test(`${kind} odkaz přes přihlášení${invalid ? ` (${invalid})` : ''}`, async ({
    page,
    guest,
    server,
  }) => {
    await login(page)
    const group = kind === 'skupinový'
    if (group) await createGroup(page)
    else await click(page, /^Přátelé/)
    await click(page, 'Vytvořit odkaz')
    const field = page.getByLabel(group ? 'Odkaz s pozvánkou' : 'Tvůj odkaz')
    await expect(field).toHaveValue(/\/pozvanka\//)
    const url = await field.inputValue()
    if (invalid === 'odvolaný') {
      await click(page, 'Zrušit')
      await expect(button(page, 'Zrušit')).toHaveCount(0)
    } else if (invalid === 'prošlý') {
      server.advanceDays(8)
    }
    await guest.goto(url)
    await expect(guest.getByRole('status')).toHaveText('Máš pozvánku. Přihlas se a hned ji uvidíš.')
    await googleLogin(guest, email(), 'Eva')
    const dialog = guest.getByRole('dialog')
    if (invalid) {
      await expect(dialog.getByRole('alert')).toContainText('Pozvánka neplatí')
      await click(guest, 'Zavřít')
    } else {
      await expect(dialog).toContainText(group ? groupName : 'Anna')
      await click(guest, group ? 'Přidat se' : 'Přidat do přátel')
      await expect(dialog).toHaveCount(0)
    }
    for (const user of [guest, page]) {
      await user.reload()
      await expect(button(user, 'Můj rozvrh')).toBeVisible()
      if (group) {
        if (invalid && user === guest) await expect(groupButton(user)).toHaveCount(0)
        else await expect(groupButton(user)).toContainText(invalid ? 'Členové: 1' : 'Členové: 2')
      } else {
        await click(user, /^Přátelé/)
        if (invalid) await expect(user.getByText(/Zatím tu nikdo není/)).toBeVisible()
        else
          await expect(
            button(user, `Odebrat z přátel: ${user === guest ? 'Anna' : 'Eva'}`),
          ).toBeVisible()
      }
    }
  })
}

test('role ve skupině, předvýběr členů a zachování akce', async ({ page, guest }) => {
  await friends(page, guest)
  await createGroup(page)
  await click(page, 'Přidat do skupiny: Eva')
  await expect(groupButton(page)).toContainText('Členové: 2')
  await guest.reload()
  await groupButton(guest).click()
  await expect(guest.getByRole('heading', { name: groupName })).toBeVisible()
  await expect(button(guest, 'Smazat skupinu')).toHaveCount(0)
  await expect(button(guest, /Odebrat ze skupiny/)).toHaveCount(0)
  await expect(button(page, 'Smazat skupinu')).toBeVisible()
  await expect(button(page, 'Odebrat ze skupiny: Eva')).toBeVisible()
  await click(page, 'Nová akce s celou skupinou')
  await expect(page.getByRole('checkbox', { name: /Eva/ })).toBeChecked()
  await fillAction(page)
  await click(page, 'Založit akci')
  await expect(people(page)).toContainText('Eva')
  await acceptAction(guest)
  await groupButton(guest).click()
  await click(guest, 'Odejít ze skupiny')
  await click(guest, 'Odejít')
  await expect(groupButton(guest)).toHaveCount(0)
  await openAction(page)
  await expect(people(page)).toContainText('Eva')
  await groupButton(page).click()
  await expect(groupButton(page)).toContainText('Členové: 1')
  await click(page, 'Smazat skupinu')
  await click(page, 'Smazat')
  await expect(groupButton(page)).toHaveCount(0)
  for (const user of [guest, page]) {
    await openAction(user)
    await expect(people(user)).toContainText('v akci')
    await expect(groupButton(user)).toHaveCount(0)
  }
})

test('změna jména, odvolání mazání a dopad smazání na účastníky', async ({ page, guest }) => {
  await friends(page, guest)
  await createAction(page, true)
  await acceptAction(guest)
  await click(guest, 'Nastavení')
  await click(guest, 'Změnit jméno')
  const name = guest.getByLabel('Jméno, pod kterým tě vidí ostatní')
  await name.fill('')
  await click(guest, 'Uložit')
  await expect(guest.getByRole('alert')).toHaveText('Jméno nesmí být prázdné.')
  await name.fill('Evelína')
  await click(guest, 'Uložit')
  await expect(
    guest.getByRole('region', { name: 'Účet', exact: true }).filter({ hasText: 'Ostatní tě vidí' }),
  ).toContainText('Evelína')
  await guest.reload()
  await click(guest, 'Nastavení')
  await expect(guest.getByText('Evelína', { exact: true }).last()).toBeVisible()
  await click(guest, 'Smazat účet')
  await click(guest, 'Nechat')
  await openAction(page)
  await expect(people(page)).toContainText('Evelína')
  await click(guest, 'Smazat účet')
  await click(guest, 'Smazat')
  await expect(button(guest, 'Přihlásit přes Google')).toBeVisible()
  await openAction(page)
  await expect(people(page).getByRole('listitem')).toHaveCount(1)
  await expect(people(page)).toContainText('Anna')
  await expect(actionButton(page)).toContainText('Lidé: 1')
})
