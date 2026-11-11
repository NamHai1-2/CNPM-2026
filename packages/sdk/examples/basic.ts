// Run against a local API (see README.md):
//   OCTAPOINT_BASE_URL=http://localhost:3001 OCTAPOINT_API_KEY=oct_... OCTAPOINT_API_SECRET=... \
//   OCTAPOINT_CUSTOMER_CODE=CUS001 pnpm --filter @octapoint/sdk example
import { randomUUID } from 'node:crypto';
import { OctaPointClient, OctaPointError } from '../src/index.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} first (see README.md).`);
  return value;
}

const client = new OctaPointClient({
  baseUrl: required('OCTAPOINT_BASE_URL'),
  apiKey: required('OCTAPOINT_API_KEY'),
  apiSecret: required('OCTAPOINT_API_SECRET'),
});
const customerCode = process.env.OCTAPOINT_CUSTOMER_CODE ?? 'CUS001';

try {
  console.log('Balance before:', await client.getBalance(customerCode));

  // One key per intended operation. Sending it twice (a retry after a timeout) creates ONE transaction.
  const idempotencyKey = randomUUID();
  const first = await client.issuePoints({ customerCode, amount: 150000, idempotencyKey });
  const retry = await client.issuePoints({ customerCode, amount: 150000, idempotencyKey });
  console.log('Issued:', first.transactionId, first.status);
  console.log('Retry returned the same transaction:', retry.transactionId === first.transactionId);

  console.log('Balance after:', await client.getBalance(customerCode));
  const page = await client.listTransactions(customerCode, { page: 1 });
  for (const tx of page.items.slice(0, 5)) {
    console.log(tx.transactionId, tx.type, tx.points, tx.status, tx.explorerUrl ?? '(not anchored yet)');
  }
} catch (error) {
  if (error instanceof OctaPointError) {
    console.error(`API error ${error.code} (HTTP ${error.httpStatus}): ${error.message}`);
    if (error.code === 'MSG17') console.error('Server clock (Unix seconds):', error.serverTime);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
