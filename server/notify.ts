import type { ActionResource, ConfirmedSlot } from '@/contract/api'
import type { Store } from './db/store'
import type { Mail, Mailer } from './mail'

/**
 * E-mailová upozornění k akcím: pozvánka, navržený termín a domluveno. Bez nich se pozvaný
 * o akci dozví, až aplikaci sám otevře. E-mail nese jen název akce, jméno organizátora
 * a termín, nikdy rozpisy. Posílá se na pozadí: pomalá nebo nedostupná služba odpověď API
 * nezdrží a chyba se jen zapíše do logu.
 */

export interface Notifier {
  /** Organizátor pozval lidi do akce. */
  invited(action: ActionResource, userIds: string[]): void
  /** Organizátor navrhl termín (nebo přijal jiný). Ptá se těch, kdo pozvánku přijali. */
  proposed(action: ActionResource): void
  /** Termín je domluvený: jdou všichni, kdo pozvánku přijali. Dostane to i organizátor. */
  agreed(action: ActionResource, organizerId: string): void
  /** Počká, až se odešle, co je rozjeté (testy). */
  settled(): Promise<void>
}

const FOOTER = '\n\nUpozornění e-mailem vypneš v aplikaci v Nastavení.'

const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']

/** „pátek 27. 11. 19:00–21:00“. */
function slotText(slot: ConfirmedSlot): string {
  const [, month, day] = slot.date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(`${slot.date}T12:00:00Z`).getUTCDay()]
  return `${weekday} ${day}. ${month}. ${slot.start}–${slot.end}`
}

export function createNotifier(store: Store, mailer: Mailer | null, appOrigin: string): Notifier {
  const pending = new Set<Promise<void>>()

  function link(action: ActionResource): string {
    return `${appOrigin}/?akce=${encodeURIComponent(action.id)}`
  }

  /** Pošle e-mail každému z lidí, kdo upozornění nevypnul. */
  function send(userIds: string[], compose: (name: string) => Omit<Mail, 'to'>) {
    if (!mailer || userIds.length === 0) return
    const job = (async () => {
      const recipients = await store.notificationRecipients(userIds)
      await Promise.all(
        recipients.map((recipient) =>
          mailer
            .send({ to: recipient.email, ...compose(recipient.name) })
            .catch((error: unknown) => {
              console.error(
                'E-mail se nepodařilo poslat:',
                error instanceof Error ? error.message : error,
              )
            }),
        ),
      )
    })().catch((error: unknown) => {
      console.error('Upozornění selhalo:', error instanceof Error ? error.message : error)
    })
    pending.add(job)
    void job.finally(() => pending.delete(job))
  }

  return {
    invited(action, userIds) {
      const organizer = action.organizerName
      send(userIds, (name) => ({
        subject: `${organizer} tě zve do akce ${action.details.name}`,
        text:
          `Ahoj ${name},\n\n${organizer} tě zve do akce ${action.details.name}. ` +
          'Sladit podle rozpisů najde termín, kdy můžou všichni. Ostatní z tvého rozvrhu uvidí jen, ' +
          `kdy můžeš.\n\nPozvánku přijmeš tady: ${link(action)}` +
          FOOTER,
      }))
    },

    proposed(action) {
      if (!action.confirmed) return
      const slot = slotText(action.confirmed)
      const waiting = action.invites
        .filter((invite) => invite.status === 'accepted' && invite.slot === 'pending')
        .map((invite) => invite.userId)
      send(waiting, (name) => ({
        subject: `${action.details.name}: ${action.organizerName} navrhuje ${slot}`,
        text:
          `Ahoj ${name},\n\n${action.organizerName} navrhuje termín akce ${action.details.name}: ${slot}.\n\n` +
          `Odpověz, jestli jdeš, nebo navrhni jiný termín: ${link(action)}` +
          FOOTER,
      }))
    },

    agreed(action, organizerId) {
      if (!action.confirmed) return
      const slot = slotText(action.confirmed)
      const going = action.invites
        .filter((invite) => invite.status === 'accepted' && invite.slot === 'going')
        .map((invite) => invite.userId)
      // Organizátor sám se sebou se domlouvat nepotřebuje.
      if (going.length === 0) return
      send([organizerId, ...going], (name) => ({
        subject: `Domluveno: ${action.details.name} ${slot}`,
        text:
          `Ahoj ${name},\n\nakce ${action.details.name} je domluvená na ${slot}. Jdou všichni, kdo pozvánku přijali.\n\n` +
          `Do kalendáře si ji přidáš tady: ${link(action)}` +
          FOOTER,
      }))
    },

    async settled() {
      while (pending.size > 0) await Promise.all([...pending])
    },
  }
}
