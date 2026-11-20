import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Šifrování obnovovacích tokenů ke kalendáři (AES-256-GCM). Klíč je jen v proměnné prostředí
 * TOKEN_ENCRYPTION_KEY, v databázi je jen zašifrovaný token. Kdo by získal zálohu databáze,
 * do kalendářů se nedostane.
 */
export interface TokenCipher {
  encrypt(plain: string): string
  decrypt(sealed: string): string
}

const VERSION = 'v1'

export function tokenCipher(key: Buffer): TokenCipher {
  if (key.length !== 32) throw new Error('Klíč k šifrování tokenů musí mít 32 bajtů')
  return {
    encrypt(plain) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return `${VERSION}:${Buffer.concat([iv, tag, data]).toString('base64url')}`
    },
    decrypt(sealed) {
      const [version, payload] = sealed.split(':')
      if (version !== VERSION || !payload) throw new Error('Neznámý formát zašifrovaného tokenu')
      const bytes = Buffer.from(payload, 'base64url')
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    },
  }
}

/** Klíč jen pro vývoj s falešným Googlem. V produkci se nepoužije (config.ts). */
export function developmentKey(): Buffer {
  return createHash('sha256').update('sladit-jen-pro-vyvoj').digest()
}
