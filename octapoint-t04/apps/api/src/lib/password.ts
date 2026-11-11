import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const COST = 12;

/**
 * BCrypt only reads the first 72 bytes, and a 64-character password can be longer than that in
 * UTF-8. The password is therefore pre-hashed with SHA-256 (44 base64 characters) so that every
 * character counts. Always use these two functions; never call bcrypt directly.
 */
function prehash(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('base64');
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(prehash(password), COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(prehash(password), hash);
}
