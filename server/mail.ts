/**
 * Odesílání e-mailů. V produkci přes Resend (RESEND_API_KEY), ve vývoji se e-mail jen vypíše
 * do konzole a v testech se uloží do pole. Bez klíče v produkci se upozornění neposílají,
 * zbytek aplikace běží.
 */

export interface Mail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(mail) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Resend odpověděl ${response.status}`)
    },
  }
}

/** Vývoj: e-mail se nepošle, jen vypíše. Adresa se zkrátí, ať v logu není celá. */
export function consoleMailer(): Mailer {
  return {
    async send(mail) {
      const [name, domain] = mail.to.split('@')
      console.log(
        `E-mail (jen vývoj) pro ${name.slice(0, 2)}…@${domain}: ${mail.subject}\n${mail.text}`,
      )
    },
  }
}

/** Testy: odeslané e-maily zůstanou v poli. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return {
    sent,
    async send(mail) {
      sent.push(mail)
    },
  }
}
