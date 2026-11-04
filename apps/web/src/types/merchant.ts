export type UserRole = 'ADMIN' | 'MERCHANT_OWNER' | 'STAFF';

export type AnchorStatus = 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED';

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string;
  points?: number;
}

export interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  secret?: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  txHash: string;
  amount: number;
  status: AnchorStatus;
  createdAt: string;
}