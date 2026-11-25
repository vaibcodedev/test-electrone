import { createHmac } from 'crypto'
import type { OtpAlgorithm, OtpParams } from '@shared/totp'

/** RFC 4226 HOTP: HMAC of the 8-byte counter, dynamic truncation, `digits` decimal digits. */
export function hotp(
  key: Uint8Array,
  counter: number,
  digits = 6,
  algorithm: OtpAlgorithm = 'sha1'
): string {
  const msg = Buffer.alloc(8)
  // Two 32-bit halves: the counter of a far date passes 2^32 and bit operations would cut it.
  msg.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
  msg.writeUInt32BE(counter >>> 0, 4)
  const mac = createHmac(algorithm, Buffer.from(key)).update(msg).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

/**
 * RFC 6238 TOTP at `at` (ms): the code and when it stops being valid. Main returns only this, never the key: the
 * renderer counts down to `expiresAt` and asks again.
 */
export function totp(p: OtpParams, at = Date.now()): { code: string; expiresAt: number; period: number } {
  const step = p.period * 1000
  const counter = Math.floor(at / step)
  return {
    code: hotp(p.key, counter, p.digits, p.algorithm),
    expiresAt: (counter + 1) * step,
    period: p.period
  }
}
