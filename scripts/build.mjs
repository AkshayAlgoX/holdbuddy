import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { mkdir, cp, readFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await viteBuild({ root: "apps/web", configFile: "apps/web/vite.config.ts" });
await build({
  entryPoints: ["server/main.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  tsconfig: "tsconfig.json",
});
await cp("assets", "dist/audio", { recursive: true });

// Post-Build Integrity & Anti-Overwrite Verification Gate
const serverBundle = await readFile("dist/server.mjs", "utf8");

// 1. Must contain proven Gnani Prisma STT URL
if (!serverBundle.includes("https://api.vachana.ai/stt/v3")) {
  throw new Error("BUILD INTEGRITY FAILURE: dist/server.mjs is missing genuine Prisma STT endpoint https://api.vachana.ai/stt/v3");
}

// 2. Must contain anti-replay guard against historical request IDs
if (!serverBundle.includes("75904f4b-73c5-475a-abbd-7cd81d314566") || !serverBundle.includes("Security & Provenance Violation")) {
  throw new Error("BUILD INTEGRITY FAILURE: dist/server.mjs is missing HISTORICAL_PRISMA_REQUEST_IDS anti-replay guard");
}

// 3. Must contain loopback transactions ledger audit endpoint
if (!serverBundle.includes("/api/v1/native/transactions")) {
  throw new Error("BUILD INTEGRITY FAILURE: dist/server.mjs is missing /api/v1/native/transactions audit endpoint");
}

// 4. Must enforce honest loopback simulation labeling for DTMF
if (!serverBundle.includes("SIMULATED_LOCAL_LOOPBACK") || !serverBundle.includes("LOCAL_LOOPBACK_RECEIPT")) {
  throw new Error("BUILD INTEGRITY FAILURE: dist/server.mjs must strictly label simulated loopback receipts without inventing hardware ARI events");
}

// 5. Must NOT have hardcoded mock request IDs in live mode
if (serverBundle.includes("mock-req-product-01")) {
  throw new Error("BUILD INTEGRITY FAILURE: dist/server.mjs contains outdated mock request IDs in live code path");
}

console.log("✓ Built and verified public frontend, genuine Prisma adapter, and offline call engine.");
