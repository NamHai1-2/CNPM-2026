/**
 * T12 – Lõi của anchoring worker (docs/anchoring.md §3–4; BR-03, BR-11, BR-20).
 *
 * Một lần chạy = `runAnchorOnce`:
 *   1. Claim các dòng đến hạn bằng MỘT câu lệnh (FOR UPDATE SKIP LOCKED + lease) → hai lần chạy
 *      đồng thời không bao giờ xử lý cùng một dòng.
 *   2. Với từng dòng, lần lượt từng cái một: gọi chain.anchor(code, proof_hash).
 *   3. Cập nhật CHỈ các cột worker được phép đổi: status, sui_digest, attempt_count,
 *      next_attempt_at, last_error. Worker không bao giờ đụng vào số dư (BR-11).
 */
import { ChainError, classifyThrown, shortError } from './errors.js';

/** Giao diện DB tối thiểu để lõi không phụ thuộc `postgres` hay `pg`. */
export interface AnchorDb {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface AnchorChain {
  /** Gửi giao dịch anchor. Lỗi phải được ném dưới dạng ChainError (hoặc lỗi thường → permanent). */
  anchor(txCode: string, proofHashHex: string): Promise<{ digest: string }>;
  /** Tìm digest của sự kiện Anchored có tx_id = txCode (dùng khi gặp E_DUPLICATE). null = không thấy. */
  findDigest(txCode: string): Promise<string | null>;
  /** Tuỳ chọn: số dư ví nền tảng (MIST) để cảnh báo sớm. */
  getGasBalanceMist?(): Promise<bigint | null>;
}

export interface AnchorLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface AnchorDeps {
  db: AnchorDb;
  chain: AnchorChain;
  logger: AnchorLogger;
}

export interface AnchorOptions {
  /** ANCHOR_BATCH_SIZE */
  batchSize: number;
  /** Lease khi claim: dòng của worker bị crash sẽ quay lại sau khoảng này (anchoring.md §3.1: 2 phút). */
  leaseSeconds: number;
  /** Chờ sau lỗi hạ tầng tạm thời (5 phút). Cho phép đổi để test. */
  temporaryRetrySeconds: number;
  /** Độ trễ cho lần thử lại thứ 1..5 (1, 2, 4, 8, 16 phút). Lần thất bại thứ 6 → FAILED. */
  retryDelaysSeconds: readonly number[];
  /** Cảnh báo khi số dư ví thấp hơn ngưỡng (MIST). */
  lowGasThresholdMist: bigint;
}

export const DEFAULT_ANCHOR_OPTIONS: AnchorOptions = {
  batchSize: 20,
  leaseSeconds: 120,
  temporaryRetrySeconds: 5 * 60,
  retryDelaysSeconds: [60, 120, 240, 480, 960],
  lowGasThresholdMist: 50_000_000n, // 0.05 SUI
};

export interface AnchorRunResult {
  claimed: number;
  anchored: number;
  /** Thất bại có tính attempt nhưng sẽ thử lại. */
  retried: number;
  /** Chuyển sang FAILED (cuối cùng). */
  failed: number;
  /** Có gặp lỗi hạ tầng tạm thời → lần chạy đã dừng sớm. */
  stoppedOnTemporaryError: boolean;
}

interface ClaimedRow {
  id: string;
  code: string;
  proof_hash: string;
  attempt_count: number;
  created_at: Date | string;
}

type Outcome =
  | { kind: 'anchored'; digest: string }
  | { kind: 'temporary'; message: string; gas: boolean }
  | { kind: 'failed'; message: string };

const CLAIM_SQL = `
WITH due AS (
  SELECT id FROM transactions
  WHERE status = 'PENDING_ANCHOR' AND next_attempt_at <= now()
  ORDER BY created_at, id
  LIMIT $1
  FOR UPDATE SKIP LOCKED
)
UPDATE transactions t
   SET next_attempt_at = now() + ($2::double precision * interval '1 second')
  FROM due WHERE t.id = due.id
RETURNING t.id, t.code, t.proof_hash, t.attempt_count, t.created_at`;

const MARK_ANCHORED_SQL = `
UPDATE transactions
   SET status = 'ANCHORED', sui_digest = $2, last_error = NULL
 WHERE id = $1 AND status = 'PENDING_ANCHOR'`;

const MARK_TEMPORARY_SQL = `
UPDATE transactions
   SET next_attempt_at = now() + ($2::double precision * interval '1 second'), last_error = $3
 WHERE id = $1 AND status = 'PENDING_ANCHOR'`;

const MARK_RETRY_SQL = `
UPDATE transactions
   SET attempt_count = $2,
       next_attempt_at = now() + ($3::double precision * interval '1 second'),
       last_error = $4
 WHERE id = $1 AND status = 'PENDING_ANCHOR'`;

const MARK_FAILED_SQL = `
UPDATE transactions
   SET status = 'FAILED', attempt_count = $2, last_error = $3
 WHERE id = $1 AND status = 'PENDING_ANCHOR'`;

function byCreatedAtThenId(a: ClaimedRow, b: ClaimedRow): number {
  const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Gọi chain cho một dòng và quy kết quả về Outcome (chưa ghi DB). */
async function attemptChain(chain: AnchorChain, row: ClaimedRow): Promise<Outcome> {
  try {
    const { digest } = await chain.anchor(row.code, row.proof_hash);
    return { kind: 'anchored', digest };
  } catch (err) {
    const error = classifyThrown(err);
    if (error.kind === 'temporary') return { kind: 'temporary', message: error.message, gas: error.reason === 'gas' };
    if (error.kind === 'permanent') return { kind: 'failed', message: error.message };
    return resolveDuplicate(chain, row);
  }
}

/** Bước 4: E_DUPLICATE nghĩa là lần trước đã thành công → tìm lại digest. */
async function resolveDuplicate(chain: AnchorChain, row: ClaimedRow): Promise<Outcome> {
  try {
    const digest = await chain.findDigest(row.code);
    if (digest) return { kind: 'anchored', digest };
    return { kind: 'failed', message: 'E_DUPLICATE but no Anchored event found for this transaction' };
  } catch (err) {
    const error: ChainError = classifyThrown(err);
    if (error.kind === 'temporary') return { kind: 'temporary', message: error.message, gas: error.reason === 'gas' };
    return { kind: 'failed', message: error.message };
  }
}

async function warnIfLowGas(deps: AnchorDeps, opts: AnchorOptions): Promise<void> {
  if (!deps.chain.getGasBalanceMist) return;
  try {
    const balance = await deps.chain.getGasBalanceMist();
    if (balance !== null && balance < opts.lowGasThresholdMist) {
      deps.logger.warn('platform wallet balance too low', { balanceMist: balance.toString() });
    }
  } catch {
    // Kiểm tra số dư chỉ để cảnh báo sớm; lỗi ở đây không được làm hỏng lần chạy.
  }
}

export async function runAnchorOnce(
  deps: AnchorDeps,
  overrides: Partial<AnchorOptions> = {},
): Promise<AnchorRunResult> {
  const opts: AnchorOptions = { ...DEFAULT_ANCHOR_OPTIONS, ...overrides };
  const { db, chain, logger } = deps;
  const result: AnchorRunResult = { claimed: 0, anchored: 0, retried: 0, failed: 0, stoppedOnTemporaryError: false };

  const rows = await db.query<ClaimedRow>(CLAIM_SQL, [opts.batchSize, opts.leaseSeconds]);
  result.claimed = rows.length;
  if (rows.length === 0) return result;
  rows.sort(byCreatedAtThenId);

  await warnIfLowGas(deps, opts);

  // Ví nền tảng chỉ có một gas coin → gửi từng giao dịch một (anchoring.md §2).
  for (const row of rows) {
    const outcome = await attemptChain(chain, row);

    if (outcome.kind === 'anchored') {
      await db.query(MARK_ANCHORED_SQL, [row.id, outcome.digest]);
      result.anchored += 1;
      logger.info('transaction anchored', { code: row.code });
      continue;
    }

    if (outcome.kind === 'temporary') {
      // Bước 4b: KHÔNG đổi attempt_count; hẹn lại sau 5 phút; dừng cả lần chạy.
      const message = shortError(outcome.message);
      await db.query(MARK_TEMPORARY_SQL, [row.id, opts.temporaryRetrySeconds, message]);
      logger.warn(outcome.gas ? 'platform wallet balance too low' : 'temporary chain error, run stopped', {
        code: row.code,
        error: message,
      });
      result.stoppedOnTemporaryError = true;
      break; // các dòng còn lại tự quay về khi lease hết hạn
    }

    // Bước 4c: lỗi khác → tính attempt.
    const message = shortError(outcome.message);
    const attempt = row.attempt_count + 1;
    if (attempt <= opts.retryDelaysSeconds.length) {
      const delay = opts.retryDelaysSeconds[attempt - 1] as number;
      await db.query(MARK_RETRY_SQL, [row.id, attempt, delay, message]);
      result.retried += 1;
      logger.warn('anchor attempt failed, will retry', { code: row.code, attempt, retryInSeconds: delay, error: message });
    } else {
      await db.query(MARK_FAILED_SQL, [row.id, attempt, message]);
      result.failed += 1;
      logger.error('anchor failed permanently', { code: row.code, attempt, error: message });
    }
  }

  return result;
}
