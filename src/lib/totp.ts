import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_PERIOD_SECONDS = 30

function getEncryptionKey() {
  const encodedKey = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim()
  if (!encodedKey) throw new Error('TWO_FACTOR_ENCRYPTION_KEY is not configured.')

  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) throw new Error('TWO_FACTOR_ENCRYPTION_KEY must decode to 32 bytes.')
  return key
}

function encodeBase32(bytes: Buffer) {
  let value = 0
  let bits = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function decodeBase32(value: string) {
  let bits = 0
  let buffer = 0
  const output: number[] = []

  for (const character of value.toUpperCase().replace(/=+$/g, '')) {
    const digit = BASE32_ALPHABET.indexOf(character)
    if (digit < 0) throw new Error('Invalid authenticator secret.')
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(output)
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

function decryptSecret(value: string) {
  const [encodedIv, encodedTag, encodedCiphertext] = value.split('.')
  if (!encodedIv || !encodedTag || !encodedCiphertext) throw new Error('Invalid stored authenticator secret.')

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(encodedIv, 'base64url'))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function createTotpEnrollment(email: string) {
  const secret = encodeBase32(randomBytes(20))
  const label = encodeURIComponent(`Drive Storage:${email || 'account'}`)
  const issuer = encodeURIComponent('Drive Storage')
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`

  return { secret, encryptedSecret: encryptSecret(secret), otpauthUrl }
}

function createTotpCode(secret: Buffer, counter: number) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (digest[offset] & 0x7f) * 0x1000000
    + digest[offset + 1] * 0x10000
    + digest[offset + 2] * 0x100
    + digest[offset + 3]
  return String(binary % 1_000_000).padStart(6, '0')
}

export function verifyTotpCode(encryptedSecret: string, suppliedCode: string) {
  const code = suppliedCode.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return false

  const secret = decodeBase32(decryptSecret(encryptedSecret))
  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS)
  const supplied = Buffer.from(code)

  for (let window = -1; window <= 1; window += 1) {
    const expected = Buffer.from(createTotpCode(secret, currentCounter + window))
    if (timingSafeEqual(supplied, expected)) return true
  }

  return false
}