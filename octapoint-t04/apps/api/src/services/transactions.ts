import type { Sql } from '../db/client.js';
import { generateTxCode } from '../lib/codes.js';
import { computeProofHash } from '../lib/proof-hash.js';
import type { NewTransaction, ProofFields, TransactionRow, TransactionView } from '../types.js';

const MAX_CODE_TRIES = 5;

/** The Sui Explorer link of a digest, from the SUI_EXPLORER_TX_URL template (it contains {digest}). */
export function explorerUrl(template: string, digest: string): string {
  return template.replace('{digest}', digest);
}

/**
 * Writes one row of the ledger. The caller (issue, redeem, reversal) is already inside a transaction and has already
 * locked the customer row and updated the balance.
 * - The time is taken ONCE, in milliseconds, and used for the created_at column and for the proof hash, so the stored row
 *   always reproduces its own hash (db-schema.md section 4).
 * - The code is generated here. On a collision (the unique constraint on code) a new code is tried: ON CONFLICT DO NOTHING
 *   is used instead of catching the error, because an error would abort the surrounding transaction.
 * `deps.generateCode` exists so tests can force a collision.
 */
export async function insertTransaction(
  tx: Sql,
  input: NewTransaction,
  deps: { generateCode?: (now: Date) => string } = {},
): Promise<TransactionRow> {
  const generateCode = deps.generateCode ?? generateTxCode;
  const createdAt = new Date(); // milliseconds precision, UTC
  const createdAtIso = createdAt.toISOString();

  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt += 1) {
    const code = generateCode(createdAt);
    const fields: ProofFields = {
      transaction_id: code,
      merchant_id: input.merchantId,
      customer_code: input.customerCode,
      type: input.type,
      points: input.points,
      created_at: createdAtIso,
    };
    if (input.reverses) fields.reverses_transaction_id = input.reverses.code;
    const proofHash = computeProofHash(fields);

    const rows = await tx`
      INSERT INTO transactions
        (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after,
         reverses_transaction_id, performed_by_user_id, performed_by_api_key_id, proof_hash, created_at)
      VALUES
        (${code}, ${input.merchantId}, ${input.customerId}, ${input.type}, ${input.points}, ${input.billAmount},
         ${input.earnRatio}, ${input.balanceAfter}, ${input.reverses ? input.reverses.id : null},
         ${input.actor.kind === 'USER' ? input.actor.userId : null},
         ${input.actor.kind === 'API_KEY' ? input.actor.apiKeyId : null}, ${proofHash}, ${createdAt})
      ON CONFLICT (code) DO NOTHING
      RETURNING id`;
    if (rows.length === 0) continue; // the code was taken: try another one

    return {
      id: String(rows[0]!.id),
      code,
      merchantId: input.merchantId,
      customerId: input.customerId,
      customerCode: input.customerCode,
      type: input.type,
      points: input.points,
      billAmount: input.billAmount,
      earnRatio: input.earnRatio,
      balanceAfter: input.balanceAfter,
      reversesTransactionId: input.reverses ? input.reverses.id : null,
      reversesCode: input.reverses ? input.reverses.code : null,
      performedBy: input.actor,
      proofHash,
      status: 'PENDING_ANCHOR',
      suiDigest: null,
      createdAt,
    };
  }
  throw new Error('could not generate a unique transaction code');
}

/** The JSON of the "Transaction object" in docs/api-spec.md section 0. The explorer link exists only once the proof is ANCHORED. */
export function toTransactionView(row: TransactionRow, explorerUrlTemplate: string): TransactionView {
  return {
    transaction_id: row.code,
    type: row.type,
    customer_code: row.customerCode,
    points: row.points,
    balance_after: row.balanceAfter,
    status: row.status,
    sui_digest: row.suiDigest,
    explorer_url: row.status === 'ANCHORED' && row.suiDigest ? explorerUrl(explorerUrlTemplate, row.suiDigest) : null,
    reverses_transaction_id: row.reversesCode,
    created_at: row.createdAt.toISOString(),
  };
}
