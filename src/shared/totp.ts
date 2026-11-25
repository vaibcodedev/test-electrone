/**
 * Parsing of a 2FA (TOTP, RFC 6238) secret as people paste it: the base32 key a site shows under its QR code
 * («JBSW Y3DP EHPK 3PXP») or the `otpauth://totp/…?secret=…` link behind the QR code. Pure, so the form checks a
 * value the same way main does; the code itself (HMAC) is computed only in main (core/totp.ts).
 */

export type OtpAlgorithm = 'sha1' | 'sha256' | 'sha512'

export interface OtpParams {
  key: Uint8Array
  digits: number
  /** Seconds one code lives. */
  period: number
  algorithm: OtpAlgorithm
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32 → bytes; spaces, dashes, padding and case are ignored. null — not base32. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
  if (!clean || /[^A-Z2-7]/.test(clean)) return null
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** At least 80 bits (16 base32 characters): shorter keys aren't issued by real services and are usually a typo. */
const MIN_KEY_BYTES = 10

/**
 * A base32 key or an `otpauth://totp/` link → the parameters of the code; null when it is neither. The link may
 * set `algorithm` (SHA1 / SHA256 / SHA512), `digits` (6–8) and `period`; unknown values fall back to the defaults
 * every authenticator app uses: SHA-1, 6 digits, 30 s.
 */
export function parseOtpSecret(input: string): OtpParams | null {
  const text = input.trim()
  if (!text) return null
  let secret = text
  let digits = 6
  let period = 30
  let algorithm: OtpAlgorithm = 'sha1'
  if (/^otpauth:/i.test(text)) {
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return null
    }
    if (url.host.toLowerCase() !== 'totp') return null
    secret = url.searchParams.get('secret') ?? ''
    const d = Number(url.searchParams.get('digits'))
    if (Number.isInteger(d) && d >= 6 && d <= 8) digits = d
    const p = Number(url.searchParams.get('period'))
    if (Number.isInteger(p) && p >= 10 && p <= 300) period = p
    const a = (url.searchParams.get('algorithm') ?? '').toLowerCase()
    if (a === 'sha256' || a === 'sha512') algorithm = a
  }
  const key = base32Decode(secret)
  if (!key || key.length < MIN_KEY_BYTES) return null
  return { key, digits, period, algorithm }
}

/** Empty is fine (2FA is optional); anything else must be a key or an otpauth link. */
export function isLikelyOtpSecret(value: string): boolean {
  return !value.trim() || parseOtpSecret(value) !== null
}

export const OTP_ERROR =
  'Не схоже на ключ 2FA: вставте ключ із літер і цифр (під QR-кодом) або посилання otpauth://'
