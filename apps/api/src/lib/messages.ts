// Application messages (SRS 5.3). Single source of truth for message codes, texts and HTTP statuses.
// HTTP statuses come from docs/api-spec.md ("Message code -> HTTP status"). Codes without `http` are
// success or informational messages that never become an error response.
// test/unit/messages.test.ts compares this file with both documents, so keep them in sync.

export interface MessageDef {
  /** Where the message is shown (SRS 5.3 Type column). */
  readonly type: string;
  /** Screen or area (SRS 5.3 Context column). */
  readonly context: string;
  /** Text with optional {placeholders}. */
  readonly text: string;
  /** HTTP status when the message is returned as an API error. */
  readonly http?: number;
}

export const MESSAGES = {
  MSG01: { type: 'Inline', context: 'Form validation', text: 'This field is required and cannot be left blank.', http: 400 },
  MSG02: { type: 'Inline', context: 'Login', text: 'Incorrect email or password. Please try again.', http: 401 },
  MSG03: { type: 'Toast (Success)', context: 'Login', text: 'Login successful. Welcome to OctaPoint!' },
  MSG04: { type: 'Toast (Error)', context: 'Authorization', text: 'Access denied. You do not have permission to perform this action.', http: 403 },
  MSG05: { type: 'Toast (Success)', context: 'Rule config', text: 'Loyalty rules have been updated successfully.' },
  MSG06: { type: 'Toast (Success)', context: 'Points', text: 'Successfully issued {points} points to customer {customer_code}.' },
  MSG07: { type: 'Toast (Success)', context: 'Points', text: 'Successfully redeemed {points} points. New balance: {new_balance}.' },
  MSG08: { type: 'Toast (Error)', context: 'Points', text: 'Insufficient point balance for this redemption.', http: 422 },
  MSG09: { type: 'Toast (Error)', context: 'Points', text: 'Redemption amount must be at least {min_points} points.', http: 422 },
  MSG10: { type: 'Toast (Success)', context: 'Developer Hub', text: 'API Key and Secret generated successfully.' },
  MSG11: { type: 'Toast (Warning)', context: 'Developer Hub', text: 'Please copy your API Secret now. It will not be shown again!' },
  MSG12: { type: 'Toast (Success)', context: 'Developer Hub', text: 'API Key has been revoked successfully.' },
  MSG13: { type: 'Toast (Success)', context: 'Admin', text: 'Merchant has been approved and activated.' },
  MSG14: { type: 'Toast (Warning)', context: 'Admin', text: 'Merchant has been suspended.' },
  MSG15: { type: 'Toast (Error)', context: 'Login', text: 'Your merchant account is suspended or pending approval.', http: 403 },
  MSG16: { type: 'API Error', context: 'Gateway', text: 'Invalid HMAC-SHA256 signature.', http: 401 },
  MSG17: { type: 'API Error', context: 'Gateway', text: 'Request timestamp is expired or outside the valid window.', http: 401 },
  MSG18: { type: 'API Error', context: 'Gateway', text: 'API Key is invalid, suspended or revoked.', http: 401 },
  MSG19: { type: 'Toast (Success)', context: 'Ledger', text: 'Reversal transaction {reversal_id} executed successfully.' },
  MSG20: { type: 'Toast (Info)', context: 'Anchoring', text: 'Transaction saved. Awaiting Sui Testnet proof anchoring.' },
  MSG21: { type: 'Status label (Ledger)', context: 'Anchoring', text: 'Transaction proof anchored on Sui Testnet.' },
  MSG22: { type: 'Toast / API Error', context: 'Customer lookup', text: 'Customer code not found.', http: 404 },
  MSG23: { type: 'Toast / API Error', context: 'System', text: 'An unexpected error occurred. Please try again later.', http: 500 },
  MSG24: { type: 'Toast (Error)', context: 'Points', text: 'The spend amount is too low to earn any point.', http: 422 },
  MSG25: { type: 'Toast (Error)', context: 'Ledger', text: 'Reversal rejected: the customer\'s balance would become negative.', http: 409 },
  MSG26: { type: 'Toast (Error)', context: 'Ledger', text: 'This transaction has already been reversed or cannot be reversed.', http: 409 },
  MSG27: { type: 'Inline', context: 'Customers', text: 'This customer code already exists.', http: 409 },
  MSG28: { type: 'Toast (Success)', context: 'Create', text: 'Add new {entity_name} successfully.' },
  MSG29: { type: 'Toast (Success)', context: 'Update', text: 'Update {entity_name} successfully.' },
  MSG30: { type: 'Toast (Success)', context: 'Registration', text: 'Registration submitted. Your account is pending approval.' },
  MSG31: { type: 'Inline', context: 'Registration / Staff', text: 'This email is already registered.', http: 409 },
  MSG32: { type: 'Toast / API Error', context: 'Points', text: 'Loyalty rules are not set yet.', http: 422 },
  MSG33: { type: 'API Error', context: 'Gateway', text: 'Request data is invalid.', http: 400 },
  MSG34: { type: 'API Error', context: 'Gateway', text: 'This Idempotency-Key was already used with a different request.', http: 409 },
  MSG35: { type: 'Toast (Error)', context: 'Session', text: 'Your session has ended. Please log in again.', http: 401 },
  MSG36: { type: 'Inline', context: 'Account Settings', text: 'The current password is incorrect.', http: 422 },
  MSG37: { type: 'Inline', context: 'Password', text: 'Password must be 8–64 characters and include at least one letter and one digit.', http: 400 },
  MSG38: { type: 'Inline', context: 'Customers', text: 'This phone number already exists.', http: 409 },
  MSG39: { type: 'Toast / API Error', context: 'Points', text: 'This customer is inactive.', http: 422 },
  MSG40: { type: 'Toast (Error)', context: 'Developer Hub', text: 'The maximum number of active API keys has been reached. Revoke one first.', http: 409 },
  MSG41: { type: 'Toast (Error)', context: 'Ledger', text: 'Reversal rejected: the customer\'s balance would exceed the maximum.', http: 409 },
} as const satisfies Record<string, MessageDef>;

export type MsgCode = keyof typeof MESSAGES;

export function isMsgCode(value: string): value is MsgCode {
  return Object.prototype.hasOwnProperty.call(MESSAGES, value);
}

/** Replaces {name} placeholders. Unknown placeholders are left untouched. */
export function formatMessage(
  code: MsgCode,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return MESSAGES[code].text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
