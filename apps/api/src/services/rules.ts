import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import type { LoyaltyRules, LoyaltyRulesView } from '../types.js';
import { writeAudit } from './audit.js';

/** Both values must be integers from 1 to this ceiling (BR-07, CR-02). */
export const RULE_MAX = 1_000_000;

/**
 * The merchant's rules, or null when they were never saved. The CALLER decides what null means
 * (issue and redeem answer MSG32): this function never throws for it.
 */
export async function getLoyaltyRules(db: Sql, merchantId: string): Promise<LoyaltyRules | null> {
  const rows = await db`
    SELECT earn_ratio, min_redemption_threshold FROM loyalty_rules WHERE merchant_id = ${merchantId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    earnRatio: Number(row.earn_ratio),
    minRedemptionThreshold: Number(row.min_redemption_threshold),
  };
}

export function toRulesView(rules: LoyaltyRules): LoyaltyRulesView {
  return { earn_ratio: rules.earnRatio, min_redemption_threshold: rules.minRedemptionThreshold };
}

function isValidRuleValue(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= RULE_MAX;
}

/**
 * Saves the merchant's rules (UC-06): the first save inserts, later saves replace the values. Applies to LATER
 * transactions only (BR-22): nothing already recorded is touched. Every save writes an audit row RULE_UPDATED
 * with the old values (null on the first save) and the new ones. The merchant row is locked first, so two
 * simultaneous saves run one after the other and each audit row shows a consistent old and new pair.
 * A value that is not an integer between 1 and 1,000,000 answers MSG33.
 */
export async function saveLoyaltyRules(
  sql: Sql,
  input: { merchantId: string; userId: string; rules: LoyaltyRules },
): Promise<LoyaltyRules> {
  const { earnRatio, minRedemptionThreshold } = input.rules;
  if (!isValidRuleValue(earnRatio) || !isValidRuleValue(minRedemptionThreshold)) throw new AppError('MSG33');

  await withTransaction(sql, async (tx) => {
    await tx`SELECT id FROM merchants WHERE id = ${input.merchantId} FOR UPDATE`;
    const old = await getLoyaltyRules(tx, input.merchantId);

    await tx`
      INSERT INTO loyalty_rules (merchant_id, earn_ratio, min_redemption_threshold, updated_by)
      VALUES (${input.merchantId}, ${earnRatio}, ${minRedemptionThreshold}, ${input.userId})
      ON CONFLICT (merchant_id) DO UPDATE SET
        earn_ratio = EXCLUDED.earn_ratio,
        min_redemption_threshold = EXCLUDED.min_redemption_threshold,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()`;

    await writeAudit(tx, {
      merchantId: input.merchantId,
      actorUserId: input.userId,
      action: 'RULE_UPDATED',
      entityType: 'loyalty_rules',
      entityId: input.merchantId,
      details: { old: old ? toRulesView(old) : null, new: toRulesView(input.rules) },
    });
  });

  return input.rules;
}
