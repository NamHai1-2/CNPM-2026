/**
 * Shared types: the single source of truth for every shape that crosses a task boundary.
 *
 * Rules (also in docs/ai-prompts.md):
 *  - Types only. No runtime code and no imports, so any file can import this one.
 *  - "View" types are the JSON of docs/api-spec.md and use snake_case exactly like the API.
 *  - "Row", "Input" and "Context" types are internal and use camelCase.
 *  - Change this file only in a pull request that both the owner of the change and one other
 *    member approve, and update docs/api-spec.md or docs/db-schema.md in the same pull request.
 */

// ---- enums (same values as the CHECK constraints in db-schema.md; the UI shows them in title case) ----
export type Role = 'ADMIN' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF';
export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type ApiKeyStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type TxType = 'ISSUE' | 'REDEEM' | 'REVERSAL';
export type TxStatus = 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED';

// ---- who is calling ----
/** Set by requireSession on portal routes (c.var.auth). merchantId is null only for ADMIN. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  role: Role;
  merchantId: string | null;
  email: string;
  fullName: string;
}

/** Set by requireApiKey on external routes (c.var.apiKey). The merchant comes from the key only. */
export interface ApiKeyContext {
  apiKeyId: string;
  merchantId: string;
}

/** Who performed a point operation (stored in transactions.performed_by_*). */
export type Actor =
  | { kind: 'USER'; userId: string }
  | { kind: 'API_KEY'; apiKeyId: string };

/** Hono environment shared by every route module. `rawBody` is set by requireApiKey. */
export interface AppEnv {
  Variables: {
    requestId: string;
    auth: AuthContext;
    apiKey: ApiKeyContext;
    rawBody: Uint8Array;
  };
}

// ---- pagination ----
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

// ---- customers ----
export interface CustomerRow {
  id: string;
  merchantId: string;
  customerCode: string;
  name: string;
  phone: string | null;
  balance: number;
  isActive: boolean;
}

export interface CustomerView {
  id: string;
  customer_code: string;
  name: string;
  phone: string | null;
  balance: number;
  is_active: boolean;
}

// ---- loyalty rules ----
export interface LoyaltyRules {
  earnRatio: number;
  minRedemptionThreshold: number;
}

export interface LoyaltyRulesView {
  earn_ratio: number;
  min_redemption_threshold: number;
}

// ---- transactions ----
/** Result of a transactions query joined with customers.customer_code and the original's code. */
export interface TransactionRow {
  id: string;
  code: string;
  merchantId: string;
  customerId: string;
  customerCode: string;
  type: TxType;
  points: number;
  billAmount: number | null;
  earnRatio: number | null;
  balanceAfter: number;
  reversesTransactionId: string | null;
  reversesCode: string | null;
  performedBy: Actor;
  proofHash: string;
  status: TxStatus;
  suiDigest: string | null;
  createdAt: Date;
}

/** JSON of the "Transaction object" in docs/api-spec.md (section 0). */
export interface TransactionView {
  transaction_id: string;
  type: TxType;
  customer_code: string;
  points: number;
  balance_after: number;
  status: TxStatus;
  sui_digest: string | null;
  explorer_url: string | null;
  reverses_transaction_id: string | null;
  created_at: string;
}

/** Input of insertTransaction (services/transactions.ts). The caller has already locked the customer row. */
export interface NewTransaction {
  type: TxType;
  merchantId: string;
  customerId: string;
  customerCode: string;
  points: number;
  billAmount: number | null;
  earnRatio: number | null;
  balanceAfter: number;
  /** REVERSAL only: id and code of the original (the code goes into the proof hash). */
  reverses: { id: string; code: string } | null;
  actor: Actor;
}

/** Fields of the proof hash (db-schema.md section 4). reverses_transaction_id is present only for REVERSAL. */
export interface ProofFields {
  transaction_id: string;
  merchant_id: string;
  customer_code: string;
  type: TxType;
  points: number;
  created_at: string;
  reverses_transaction_id?: string;
}

// ---- idempotency ----
export type IdempotencyScope =
  | { kind: 'API_KEY'; apiKeyId: string }
  | { kind: 'USER'; userId: string };

// ---- audit (CR-04) ----
export type AuditAction =
  | 'RULE_UPDATED'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'MERCHANT_APPROVED'
  | 'MERCHANT_SUSPENDED'
  | 'STAFF_CREATED'
  | 'STAFF_DEACTIVATED'
  | 'CUSTOMER_DEACTIVATED'
  | 'CUSTOMER_REACTIVATED'
  | 'REVERSAL_CREATED'
  | 'PASSWORD_CHANGED';

export interface AuditEntry {
  merchantId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

// ---- API keys (gateway) ----
export interface ApiKeyAuthRecord {
  apiKeyId: string;
  merchantId: string;
  keyId: string;
  status: ApiKeyStatus;
  merchantStatus: MerchantStatus;
  /** Decrypted secret, only for computing the signature. Never log or return it. */
  secret: string;
}
