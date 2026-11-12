/**
 * T12 – Bộ lập lịch của anchoring worker (docs/anchoring.md §3).
 *
 * Chạy mỗi ANCHOR_INTERVAL_SECONDS (mặc định 30 giây), KHÔNG chồng lần: lần sau chỉ được hẹn
 * khi lần trước đã xong. Chỉ được bật trên ĐÚNG MỘT instance (ENABLE_ANCHOR_WORKER=true);
 * câu lệnh claim (SKIP LOCKED + lease) chỉ là lớp bảo vệ phụ nếu lỡ bật hai nơi.
 */
import { shortError } from './errors.js';
import { runAnchorOnce, type AnchorDeps, type AnchorOptions } from './run.js';

export interface AnchorWorkerHandle {
  /** Dừng hẹn lịch và đợi lần chạy đang dở (nếu có) kết thúc. */
  stop(): Promise<void>;
}

export function startAnchorWorker(
  deps: AnchorDeps,
  intervalSeconds: number,
  options: Partial<AnchorOptions> = {},
): AnchorWorkerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = async (): Promise<void> => {
    try {
      const result = await runAnchorOnce(deps, options);
      if (result.claimed > 0) deps.logger.info('anchor run finished', { ...result });
    } catch (err) {
      // Lỗi DB hoặc lỗi bất ngờ: ghi log, lần chạy sau tự thử lại. Dòng đã claim quay về khi lease hết hạn.
      deps.logger.error('anchor run crashed', { error: shortError(err) });
    } finally {
      if (!stopped) schedule();
    }
  };

  const schedule = (): void => {
    timer = setTimeout(() => {
      current = tick();
    }, intervalSeconds * 1000);
  };

  deps.logger.info('anchor worker started', { intervalSeconds });
  timer = setTimeout(() => {
    current = tick();
  }, 0);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await current;
    },
  };
}
