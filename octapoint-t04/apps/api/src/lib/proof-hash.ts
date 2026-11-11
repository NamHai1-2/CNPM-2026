import { createHash } from 'node:crypto';
import type { ProofFields } from '../types.js';

/**
 * The exact text that is hashed (docs/db-schema.md section 4): a JSON object with the keys in alphabetical order, no
 * whitespace. `reverses_transaction_id` is present only for a REVERSAL; a key whose value is undefined is left out.
 */
export function canonicalProofJson(fields: ProofFields): string {
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(Object.fromEntries(entries));
}

/** Lowercase hex SHA-256 of the canonical JSON (UTF-8). This is the proof written on-chain. */
export function computeProofHash(fields: ProofFields): string {
  return createHash('sha256').update(canonicalProofJson(fields), 'utf8').digest('hex');
}
