import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Config } from '../config.js';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

/** The 32-byte master key from SECRET_ENCRYPTION_KEY (config.ts has already checked the length). */
export function masterKeyFromConfig(config: Config): Buffer {
  return Buffer.from(config.SECRET_ENCRYPTION_KEY, 'base64');
}

/**
 * AES-256-GCM (CR-07). Output = nonce(12) || ciphertext || tag(16); the nonce is random for every call, so
 * encrypting the same text twice gives different results. Reversible on purpose: HMAC needs the raw secret.
 */
export function encryptSecret(plain: string, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]);
}

/** Throws when the key is wrong or the data was changed (GCM checks the tag). */
export function decryptSecret(blob: Buffer, key: Buffer): string {
  if (blob.length < NONCE_LENGTH + TAG_LENGTH) throw new Error('encrypted secret is too short');
  const nonce = blob.subarray(0, NONCE_LENGTH);
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  const ciphertext = blob.subarray(NONCE_LENGTH, blob.length - TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
