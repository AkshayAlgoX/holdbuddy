#!/usr/bin/env node
/**
 * HoldBuddy — Secure Owner-Run Local Telephony Server Launcher
 *
 * Security & Financial Guarantees:
 * 1. Prompts for GNANI_API_KEY with terminal echo disabled (raw mode).
 * 2. Key is kept in volatile process memory only (never written to disk, logs, git, or command history).
 * 3. Enforces loopback-only binding (127.0.0.1:10000) with strict same-origin checks.
 * 4. Displays explicit cash-charge warning before enabling genuine live mode.
 * 5. If no key is provided, gracefully starts in 100% offline qualified replay mode.
 */

import { createInterface } from 'node:readline';
import { createApplication } from '../dist/server.mjs';

function askHidden(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(query);

    if (!stdin.isTTY) {
      // Non-interactive fallback: read line normally
      const rl = createInterface({ input: stdin, output: stdout });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';

    const onData = (char) => {
      // Handle Ctrl+C
      if (char === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\nLauncher aborted by operator.\n');
        process.exit(130);
      }

      // Handle Enter / Return
      if (char === '\r' || char === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        resolve(input.trim());
        return;
      }

      // Handle Backspace
      if (char === '\u0008' || char === '\x7f') {
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
        return;
      }

      // Append printable characters
      input += char;
    };

    stdin.on('data', onData);
  });
}

async function main() {
  process.stdout.write('\n');
  process.stdout.write('====================================================================\n');
  process.stdout.write('   HOLDBUDDY — SECURE LOCAL TELEPHONY SERVER LAUNCHER\n');
  process.stdout.write('====================================================================\n');
  process.stdout.write(' Binding Address : http://127.0.0.1:10000 (Loopback only)\n');
  process.stdout.write(' Telephony Stack : Asterisk PBX 20 ARI + Gnani Prisma v3.0 STT\n');
  process.stdout.write(' Concurrency     : Single-session mutex (1 caller at a time)\n');
  process.stdout.write(' Request Cap     : 3 genuine provider requests max · 0 auto-retries\n');
  process.stdout.write('--------------------------------------------------------------------\n');
  process.stdout.write(' [SECURITY & FINANCIAL POLICY]\n');
  process.stdout.write(' - Entering GNANI_API_KEY enables Genuine Live Gnani Prisma mode.\n');
  process.stdout.write(' - Input is hidden (echo disabled, not logged, never written to disk).\n');
  process.stdout.write(' - Promotional credits may NOT prevent additional cash charges on\n');
  process.stdout.write('   your Gnani account. Each live run requires explicit browser consent.\n');
  process.stdout.write(' - Press ENTER without typing to run in safe OFFLINE REPLAY mode.\n');
  process.stdout.write('--------------------------------------------------------------------\n\n');

  const apiKey = await askHidden('Enter GNANI_API_KEY (hidden, press Enter to skip): ');

  if (apiKey && apiKey.length >= 10) {
    process.env.GNANI_API_KEY = apiKey;
    process.stdout.write('\n[OK] GNANI_API_KEY received in volatile memory. Genuine live mode ENABLED.\n');
    process.stdout.write('[NOTICE] Live mode is gated by phrase: "I AUTHORIZE 3 HINDI PRISMA REQUESTS AND ASTERISK ARI DTMF"\n\n');
  } else {
    delete process.env.GNANI_API_KEY;
    process.stdout.write('\n[INFO] No key supplied. Server running in OFFLINE QUALIFIED REPLAY mode.\n');
    process.stdout.write('[INFO] Live mode will be safely disabled in the browser UI.\n\n');
  }

  const port = Number(process.env.PORT ?? 10000);
  const origin = `http://127.0.0.1:${port}`;

  process.stdout.write(`Starting HoldBuddy local telephony server on ${origin}...\n`);

  const app = await createApplication({
    origin,
    port,
    host: '127.0.0.1',
    timingScale: 1,
    maxCallMs: 180000,
  });

  process.stdout.write('\n====================================================================\n');
  process.stdout.write(` ✓ HoldBuddy is live at: ${origin}\n`);
  process.stdout.write(` ✓ Developer Lab URL   : ${origin}/#/developer\n`);
  process.stdout.write('--------------------------------------------------------------------\n');
  process.stdout.write(' Press Ctrl+C in this terminal to stop the server at any time.\n');
  process.stdout.write('====================================================================\n\n');

  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    process.stdout.write('\nShutting down HoldBuddy local telephony server...\n');
    await app.close();
    process.stdout.write('Server closed cleanly. Goodbye.\n');
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main().catch((err) => {
  process.stderr.write(`\nFatal error launching local server: ${err.message}\n`);
  process.exit(1);
});
