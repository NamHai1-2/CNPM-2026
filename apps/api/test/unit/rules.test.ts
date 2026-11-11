import { describe, expect, it } from 'vitest';
import { RULE_MAX, toRulesView } from '../../src/services/rules.js';

describe('toRulesView', () => {
  it('maps the internal names to the JSON of api-spec.md', () => {
    expect(toRulesView({ earnRatio: 10000, minRedemptionThreshold: 50 })).toEqual({
      earn_ratio: 10000,
      min_redemption_threshold: 50,
    });
  });
});

describe('RULE_MAX', () => {
  it('is the 1,000,000 ceiling of BR-07 and CR-02', () => {
    expect(RULE_MAX).toBe(1_000_000);
  });
});
