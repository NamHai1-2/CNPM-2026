/**
 * T12 – tiêu chí nghiệm thu (docs/implementation-plan.md):
 *  - giao dịch mới → ANCHORED + digest
 *  - lỗi tạm thời: giữ PENDING_ANCHOR, attempt_count không đổi, dừng sau lỗi đầu, thử lại, rồi ANCHORED
 *  - lỗi khác: thử lại sau 1,2,4,8,16 phút, lần thất bại thứ 6 → FAILED; số dư không đổi
 *  - hai lần chạy đồng thời không xử lý cùng một dòng
 *  - E_DUPLICATE kết thúc ANCHORED với digest đã có
 *
 * Quy tắc repo: KHÔNG dùng DELETE/TRUNCATE để dọn bảng; mỗi file test dùng createTestDatabase().
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChainError, classifyExecutionFailure, extractAbortCode } from '../../src/services/anchoring/errors.js';
import { runAnchorOnce, type AnchorChain, type AnchorDb, type AnchorLogger } from '../../src/services/anchoring/run.js';
import { toAnchorDb } from '../../src/services/anchoring/db.js';
import { createTestDatabase } from '../helpers/db.js';

async function openDb(): Promise<{ db: AnchorDb; close: () => Promise<void> }> {
  const testDb = await createTestDatabase();
  return { db: toAnchorDb(testDb.sql), close: testDb.drop };
}

const silent: AnchorLogger = { info() {}, warn() {}, error() {} };
const HASH = 'fbf42511ae75ae2327bccf4fe9b4560825f52580379e7eaf8e6d340f649ee2a1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let db: AnchorDb;
let close: () => Promise<void>;
let merchantId: string;
let customerId: string;
let userId: string;
let seq = 0;

beforeAll(async () => {
  ({ db, close } = await openDb());
  [{ id: merchantId }] = (await db.query<{ id: string }>(
    `INSERT INTO merchants (code, name, status) VALUES ('MCH-ANCH01', 'Anchor Test', 'ACTIVE') RETURNING id`,
  )) as [{ id: string }];
  [{ id: userId }] = (await db.query<{ id: string }>(
    `INSERT INTO users (merchant_id, email, password_hash, full_name, role)
     VALUES ($1, 'owner@anchor.test', 'not-a-real-hash', 'Owner', 'MERCHANT_OWNER') RETURNING id`,
    [merchantId],
  )) as [{ id: string }];
  [{ id: customerId }] = (await db.query<{ id: string }>(
    `INSERT INTO customers (merchant_id, customer_code, name, balance) VALUES ($1, 'CUS001', 'A', 1000) RETURNING id`,
    [merchantId],
  )) as [{ id: string }];
});

afterAll(async () => {
  await close();
});

// Các dòng của test trước vẫn còn PENDING_ANCHOR (không được xoá) → đẩy hẹn giờ ra xa để không bị claim lại.
beforeEach(async () => {
  await db.query(`UPDATE transactions SET next_attempt_at = now() + interval '1 day' WHERE status = 'PENDING_ANCHOR'`);
});

async function insertTx(): Promise<{ id: string; code: string }> {
  seq += 1;
  const code = `TXN-20261101-${String(seq).padStart(8, '0')}`;
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO transactions
       (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after,
        performed_by_user_id, proof_hash, created_at)
     VALUES ($1, $2, $3, 'ISSUE', 100, 1000000, 10000, 100, $4, $5, $6) RETURNING id`,
    [code, merchantId, customerId, userId, HASH, new Date(Date.UTC(2026, 10, 1, 3, 15, 42, seq))],
  );
  return { id: (row as { id: string }).id, code };
}

interface TxState {
  status: string;
  sui_digest: string | null;
  attempt_count: number;
  last_error: string | null;
  secs_until_next: number;
}
async function state(id: string): Promise<TxState> {
  const [row] = await db.query<TxState>(
    `SELECT status, sui_digest, attempt_count, last_error,
            EXTRACT(EPOCH FROM (next_attempt_at - now()))::float8 AS secs_until_next
       FROM transactions WHERE id = $1`,
    [id],
  );
  return row as TxState;
}

function makeChain(handler: (code: string, callNo: number) => Promise<{ digest: string }>, findDigest?: AnchorChain['findDigest']) {
  const calls: string[] = [];
  const chain: AnchorChain = {
    async anchor(code) {
      calls.push(code);
      return handler(code, calls.length);
    },
    findDigest: findDigest ?? (async () => null),
  };
  return { chain, calls };
}

describe('anchoring worker (T12)', () => {
  it('nhận E_DUPLICATE từ thông báo dạng "abort code: 1" của SDK v2', () => {
  const msg =
    "Error: Transaction resolution failed: MoveAbort in 1st command, abort code: 1, in '0x9fb0::anchor::anchor' (instruction 24)";
    expect(extractAbortCode(msg)).toBe(1);
    expect(classifyExecutionFailure(new Error(msg)).kind).toBe('duplicate');
});
  it('anchors a new transaction and stores the digest without touching balances', async () => {
    const tx = await insertTx();
    const { chain, calls } = makeChain(async (code) => ({ digest: `DIGEST-${code}` }));

    const result = await runAnchorOnce({ db, chain, logger: silent });

    expect(result.anchored).toBe(1);
    expect(calls).toEqual([tx.code]);
    const after = await state(tx.id);
    expect(after.status).toBe('ANCHORED');
    expect(after.sui_digest).toBe(`DIGEST-${tx.code}`);
    const [customer] = await db.query<{ balance: string }>(`SELECT balance::text AS balance FROM customers WHERE id = $1`, [customerId]);
    expect(customer?.balance).toBe('1000');
  });

  it('keeps PENDING_ANCHOR on a temporary error, does not count it, stops the run, then recovers', async () => {
    const first = await insertTx();
    const second = await insertTx();
    let down = true;
    const { chain, calls } = makeChain(async (code) => {
      if (down) throw new ChainError('temporary', 'RPC unavailable', 'network');
      return { digest: `DIGEST-${code}` };
    });
    const fast = { temporaryRetrySeconds: 1, leaseSeconds: 1 };

    const broken = await runAnchorOnce({ db, chain, logger: silent }, fast);

    expect(broken.stoppedOnTemporaryError).toBe(true);
    expect(calls).toEqual([first.code]); // dừng sau lỗi đầu tiên
    const stuck = await state(first.id);
    expect(stuck.status).toBe('PENDING_ANCHOR');
    expect(stuck.attempt_count).toBe(0);
    expect(stuck.last_error).toContain('RPC unavailable');

    down = false;
    await sleep(1300); // qua thời gian hẹn lại và lease của dòng thứ hai
    const fixed = await runAnchorOnce({ db, chain, logger: silent }, fast);

    expect(fixed.anchored).toBe(2);
    expect((await state(first.id)).status).toBe('ANCHORED');
    expect((await state(second.id)).status).toBe('ANCHORED');
    expect((await state(first.id)).attempt_count).toBe(0);
  });

  it('does not count a gas shortage as an attempt', async () => {
    const tx = await insertTx();
    const { chain } = makeChain(async () => {
      throw new ChainError('temporary', 'InsufficientGas', 'gas');
    });
    await runAnchorOnce({ db, chain, logger: silent }, { temporaryRetrySeconds: 300 });
    const after = await state(tx.id);
    expect(after.status).toBe('PENDING_ANCHOR');
    expect(after.attempt_count).toBe(0);
    expect(after.secs_until_next).toBeGreaterThan(290);
    expect(after.secs_until_next).toBeLessThanOrEqual(300);
  });

  it('retries a non-temporary failure after 1, 2, 4, 8, 16 minutes and ends FAILED on the 6th', async () => {
    const tx = await insertTx();
    const { chain, calls } = makeChain(async () => {
      throw new ChainError('permanent', 'MoveAbort E_BAD_HASH');
    });
    const expectedDelays = [60, 120, 240, 480, 960];

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await db.query(`UPDATE transactions SET next_attempt_at = now() WHERE id = $1`, [tx.id]);
      await runAnchorOnce({ db, chain, logger: silent });
      const s = await state(tx.id);
      expect(s.status).toBe('PENDING_ANCHOR');
      expect(s.attempt_count).toBe(attempt);
      const delay = expectedDelays[attempt - 1] as number;
      expect(s.secs_until_next).toBeGreaterThan(delay - 10);
      expect(s.secs_until_next).toBeLessThanOrEqual(delay);
    }

    await db.query(`UPDATE transactions SET next_attempt_at = now() WHERE id = $1`, [tx.id]);
    await runAnchorOnce({ db, chain, logger: silent });
    const final = await state(tx.id);
    expect(final.status).toBe('FAILED');
    expect(final.attempt_count).toBe(6);
    expect(final.last_error).toContain('E_BAD_HASH');
    expect(calls).toHaveLength(6);

    // FAILED là trạng thái cuối: không bao giờ được claim lại.
    const again = await runAnchorOnce({ db, chain, logger: silent });
    expect(again.claimed).toBe(0);
    const [customer] = await db.query<{ balance: string }>(`SELECT balance::text AS balance FROM customers WHERE id = $1`, [customerId]);
    expect(customer?.balance).toBe('1000');
  });

  it('never processes the same row in two concurrent runs', async () => {
    const txs = await Promise.all(Array.from({ length: 10 }, () => insertTx()));
    const { chain, calls } = makeChain(async (code) => {
      await sleep(20);
      return { digest: `DIGEST-${code}` };
    });

    await Promise.all([runAnchorOnce({ db, chain, logger: silent }), runAnchorOnce({ db, chain, logger: silent })]);

    expect(calls).toHaveLength(10);
    expect(new Set(calls).size).toBe(10);
    for (const tx of txs) expect((await state(tx.id)).status).toBe('ANCHORED');
  });

  it('processes the oldest rows first and respects the batch size', async () => {
    const a = await insertTx();
    const b = await insertTx();
    const c = await insertTx();
    const { chain, calls } = makeChain(async (code) => ({ digest: `DIGEST-${code}` }));

    const result = await runAnchorOnce({ db, chain, logger: silent }, { batchSize: 2 });

    expect(result.claimed).toBe(2);
    expect(calls).toEqual([a.code, b.code]);
    expect((await state(c.id)).status).toBe('PENDING_ANCHOR');
  });

  it('ends ANCHORED with the existing digest on E_DUPLICATE', async () => {
    const tx = await insertTx();
    const { chain } = makeChain(
      async () => {
        throw new ChainError('duplicate', 'MoveAbort E_DUPLICATE');
      },
      async (code) => (code === tx.code ? 'EXISTING-DIGEST' : null),
    );

    const result = await runAnchorOnce({ db, chain, logger: silent });

    expect(result.anchored).toBe(1);
    const after = await state(tx.id);
    expect(after.status).toBe('ANCHORED');
    expect(after.sui_digest).toBe('EXISTING-DIGEST');
    expect(after.attempt_count).toBe(0);
  });

  it('counts E_DUPLICATE as a failure when the Anchored event cannot be found', async () => {
    const tx = await insertTx();
    const { chain } = makeChain(async () => {
      throw new ChainError('duplicate', 'MoveAbort E_DUPLICATE');
    });

    await runAnchorOnce({ db, chain, logger: silent });

    const after = await state(tx.id);
    expect(after.status).toBe('PENDING_ANCHOR');
    expect(after.attempt_count).toBe(1);
  });

  it('treats an unexpected thrown error as a counted failure', async () => {
    const tx = await insertTx();
    const { chain } = makeChain(async () => {
      throw new Error('something odd');
    });

    await runAnchorOnce({ db, chain, logger: silent });

    const after = await state(tx.id);
    expect(after.status).toBe('PENDING_ANCHOR');
    expect(after.attempt_count).toBe(1);
  });
  
});
