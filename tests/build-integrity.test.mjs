import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

test('build integrity: dist/server.mjs contains genuine Prisma endpoint, anti-replay guards, and transparent provenance', () => {
  const serverPath = join(process.cwd(), 'dist', 'server.mjs');
  assert.ok(existsSync(serverPath), 'dist/server.mjs must exist');

  const bundle = readFileSync(serverPath, 'utf8');

  // 1. Prisma STT URL check
  assert.ok(
    bundle.includes('https://api.vachana.ai/stt/v3'),
    'Server binary must target https://api.vachana.ai/stt/v3',
  );
  assert.ok(
    !bundle.includes('/stt/v3/transcribe'),
    'Server binary must NOT use non-existent /stt/v3/transcribe endpoint',
  );

  // 2. Anti-replay guard
  assert.ok(
    bundle.includes('75904f4b-73c5-475a-abbd-7cd81d314566'),
    'Server binary must contain historical request ID blacklist',
  );
  assert.ok(
    bundle.includes('Security & Provenance Violation') || bundle.includes('historical request ID'),
    'Server binary must abort if provider returns historical request IDs',
  );

  // 3. Transactions ledger endpoint
  assert.ok(
    bundle.includes('/api/v1/native/transactions'),
    'Server binary must expose /api/v1/native/transactions audit endpoint',
  );

  // 4. Honest loopback labeling (no fake hardware ARI claims)
  assert.ok(
    bundle.includes('SIMULATED_LOCAL_LOOPBACK'),
    'Server binary must explicitly label simulated loopback execution',
  );
  assert.ok(
    bundle.includes('LOCAL_LOOPBACK_RECEIPT'),
    'Server binary must label receipts as LOCAL_LOOPBACK_RECEIPT',
  );

  // 5. No hardcoded mock request IDs in live path
  assert.ok(
    !bundle.includes('mock-req-product-01'),
    'Server binary must not contain mock-req-product-01',
  );
});
