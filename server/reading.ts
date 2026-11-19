import type { ReadingRequest } from '@/contract/api'
import type { PreparedSource } from '@/llm/ingest'

/**
 * Kontrola podkladů od prohlížeče, než se pošlou modelu. Server je na internetu a model platí tým,
 * takže přijme jen obrázky a PDF, které opravdu jsou obrázky a PDF, a jen do rozumné velikosti.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** Všechny soubory jednoho čtení dohromady. */
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024
/** Limit těla požadavku: base64 zvětší soubory o třetinu a přidá se JSON okolo. */
export const MAX_READING_BODY_BYTES = 36 * 1024 * 1024

/** Povolené typy a jak poznat, že soubor opravdu je takového typu (první bajty). */
const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'application/pdf': (bytes) => bytes.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (bytes) =>
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/webp': (bytes) =>
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/heic': (bytes) => bytes.subarray(4, 8).toString('latin1') === 'ftyp',
  'image/heif': (bytes) => bytes.subarray(4, 8).toString('latin1') === 'ftyp',
}

export class InvalidSourceError extends Error {}

export function validateParts(request: ReadingRequest): PreparedSource[] {
  let total = 0
  return request.parts.map(({ part, notes }, index) => {
    const name = request.files[index].name
    if ('text' in part) return { part, notes }
    const check = SIGNATURES[part.inlineData.mimeType]
    if (!check) throw new InvalidSourceError(`Soubor ${name} má nepodporovaný typ.`)
    const bytes = Buffer.from(part.inlineData.data, 'base64')
    if (bytes.length > MAX_FILE_BYTES) {
      throw new InvalidSourceError(`Soubor ${name} je větší než 10 MB.`)
    }
    total += bytes.length
    if (total > MAX_TOTAL_BYTES) {
      throw new InvalidSourceError('Podklady jsou dohromady větší než 25 MB.')
    }
    if (!check(bytes)) {
      throw new InvalidSourceError(`Soubor ${name} neodpovídá svému typu.`)
    }
    return { part, notes }
  })
}

/** Dnešní den v Praze, podle něj se počítají denní limity. */
export function pragueDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
}
