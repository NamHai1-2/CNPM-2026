import { z } from 'zod';

const PLACEHOLDER = /REPLACE/i;

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().url(),
    // Master key for API secrets (AES-256-GCM, CR-07): exactly 32 bytes, base64.
    SECRET_ENCRYPTION_KEY: z
      .string()
      .refine((value) => !PLACEHOLDER.test(value) && Buffer.from(value, 'base64').length === 32, {
        message: 'must be 32 random bytes encoded as base64 (see .env.example)',
      }),
    SUI_RPC_URL: z.string().url().default('https://fullnode.testnet.sui.io:443'),
    SUI_PRIVATE_KEY: z.string().optional(),
    SUI_PACKAGE_ID: z.string().optional(),
    SUI_REGISTRY_ID: z.string().optional(),
    SUI_EXPLORER_TX_URL: z
      .string()
      .includes('{digest}', { message: 'must contain the {digest} placeholder' })
      .default('https://suiscan.xyz/testnet/tx/{digest}'),
    ENABLE_ANCHOR_WORKER: booleanString,
    ANCHOR_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
    ANCHOR_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((env, ctx) => {
    if (!env.ENABLE_ANCHOR_WORKER) return;
    for (const key of ['SUI_PRIVATE_KEY', 'SUI_PACKAGE_ID', 'SUI_REGISTRY_ID'] as const) {
      const value = env[key];
      if (!value || PLACEHOLDER.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'is required when ENABLE_ANCHOR_WORKER=true',
        });
      }
    }
  });

export type Config = z.infer<typeof schema>;

/** Validates the environment once at start-up and fails with a readable list of problems. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
