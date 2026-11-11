/**
 * T12 – Adapter Sui Testnet cho AnchorChain (docs/anchoring.md §1–3).
 *
 * LƯU Ý PHIÊN BẢN: @mysten/sui v2 đã bỏ JSON-RPC (SuiJsonRpcClient bị deprecate, sắp tắt) nên file này
 * dùng SuiGrpcClient để gửi giao dịch và GraphQL (fetch thuần) để tìm lại digest khi gặp E_DUPLICATE.
 * Những chỗ phụ thuộc phiên bản SDK được gom vào `readExecution` và `findDigest`; nếu `pnpm typecheck`
 * báo lỗi kiểu thì chỉ cần sửa trong hai hàm đó.
 */
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { ChainError, classifyExecutionFailure, classifyThrown, shortError } from './errors.js';
import type { AnchorChain } from './run.js';

export interface SuiChainConfig {
  /** SUI_RPC_URL, ví dụ https://fullnode.testnet.sui.io:443 (dùng cho gRPC). */
  rpcUrl: string;
  /** SUI_GRAPHQL_URL, ví dụ https://graphql.testnet.sui.io/graphql (chỉ dùng để sửa lỗi E_DUPLICATE). */
  graphqlUrl: string;
  /** SUI_PRIVATE_KEY (suiprivkey…). Không bao giờ log. */
  privateKey: string;
  /** SUI_PACKAGE_ID */
  packageId: string;
  /** SUI_REGISTRY_ID */
  registryId: string;
}

const CLOCK_OBJECT_ID = '0x6';
const EVENT_PAGE_SIZE = 50;
const EVENT_PAGES_MAX = 20;
const GRAPHQL_TIMEOUT_MS = 15_000;

function dig(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new ChainError('permanent', 'proof_hash is not 64 lowercase hex characters');
  return Uint8Array.from(hex.match(/../g) as string[], (byte) => parseInt(byte, 16));
}

/** Đọc kết quả signAndExecuteTransaction; ném ChainError nếu effects báo thất bại. */
function readExecution(result: unknown): string {
  const body = dig(result, 'Transaction') ?? dig(result, 'FailedTransaction') ?? result;
  const success = dig(result, '$kind') === 'Transaction' || dig(body, 'status', 'success') === true;
  if (!success) {
    const error = dig(body, 'status', 'error') ?? dig(body, 'effects', 'status', 'error') ?? body;
    throw classifyExecutionFailure(error);
  }
  const digest = dig(body, 'digest');
  if (typeof digest !== 'string' || digest.length === 0) {
    throw new ChainError('permanent', 'unexpected response from Sui: no transaction digest');
  }
  return digest;
}

export function createSuiChain(config: SuiChainConfig): AnchorChain {
  const client = new SuiGrpcClient({ baseUrl: config.rpcUrl, network: 'testnet' });
  const signer = Ed25519Keypair.fromSecretKey(config.privateKey);
  const address = signer.toSuiAddress();
  const eventType = `${config.packageId}::anchor::Anchored`;

  async function graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(config.graphqlUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
      });
    } catch (err) {
      throw classifyThrown(err);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ChainError('temporary', `GraphQL HTTP ${response.status}`, 'network');
    }
    if (!response.ok) throw new ChainError('permanent', `GraphQL HTTP ${response.status}`);
    const json: unknown = await response.json();
    const errors = dig(json, 'errors');
    if (Array.isArray(errors) && errors.length > 0) {
      throw new ChainError('permanent', `GraphQL error: ${shortError(errors[0])}`);
    }
    return json;
  }

  return {
    async anchor(txCode, proofHashHex) {
      const proofHash = hexToBytes(proofHashHex);
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.packageId}::anchor::anchor`,
        arguments: [
          tx.object(config.registryId),
          tx.pure.string(txCode),
          tx.pure.vector('u8', Array.from(proofHash)),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      let result: unknown;
            try {
        result = await client.signAndExecuteTransaction({ transaction: tx, signer, include: { effects: true } });
      } catch (err) {
        throw classifyExecutionFailure(err);
      }
            const digest = readExecution(result);
      // Đợi fullnode lập chỉ mục xong để giao dịch kế tiếp thấy đúng version mới của gas coin và registry.
      try {
        await client.waitForTransaction({ digest, timeout: 15_000 });
      } catch {
        // Giao dịch đã thành công; chỉ là bước đồng bộ không hoàn tất. Không được làm hỏng kết quả.
      }
      return { digest };
    },

    /** Bước 4: tìm sự kiện Anchored mới nhất trước, tối đa 20 trang × 50 sự kiện. */
    async findDigest(txCode) {
      const query = `query($type: String!, $last: Int!, $before: String) {
        events(last: $last, before: $before, filter: { type: $type }) {
          pageInfo { hasPreviousPage startCursor }
          nodes { contents { json } transaction { digest } }
        }
      }`;
      let before: string | null = null;
      for (let page = 0; page < EVENT_PAGES_MAX; page += 1) {
        const data = await graphql(query, { type: eventType, last: EVENT_PAGE_SIZE, before });
        const nodes = dig(data, 'data', 'events', 'nodes');
        if (Array.isArray(nodes)) {
          for (const node of nodes) {
            if (dig(node, 'contents', 'json', 'tx_id') === txCode) {
              const digest = dig(node, 'transaction', 'digest');
              if (typeof digest === 'string' && digest.length > 0) return digest;
            }
          }
        }
        if (dig(data, 'data', 'events', 'pageInfo', 'hasPreviousPage') !== true) return null;
        const cursor = dig(data, 'data', 'events', 'pageInfo', 'startCursor');
        if (typeof cursor !== 'string') return null;
        before = cursor;
      }
      return null;
    },

    async getGasBalanceMist() {
      const result: unknown = await client.getBalance({ owner: address });
      const raw = dig(result, 'balance', 'balance') ?? dig(result, 'balance', 'totalBalance') ?? dig(result, 'totalBalance');
      return typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint' ? BigInt(raw) : null;
    },
  };
}
