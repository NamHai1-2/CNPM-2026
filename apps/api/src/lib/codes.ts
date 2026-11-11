import { randomInt } from 'node:crypto';

/** Characters allowed in generated codes (CR-05): upper-case letters and digits. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomChars(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET.charAt(randomInt(ALPHABET.length));
  return out;
}

/** 'MCH-' + 6 characters. UNIQUE in the database: the caller retries with a new code on a collision. */
export function generateMerchantCode(): string {
  return `MCH-${randomChars(6)}`;
}

/**
 * 'TXN-' + YYYYMMDD (the date in UTC) + '-' + 8 characters. UNIQUE in the database: the caller retries with
 * a new code on a collision. The code is also the transaction id written on-chain.
 */
export function generateTxCode(now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `TXN-${year}${month}${day}-${randomChars(8)}`;
}
