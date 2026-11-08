import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: {alias: {"@holdbuddy/call-runtime/protocol":fileURLToPath(new URL("../../packages/call-runtime/src/protocol.ts",import.meta.url))}},
  build: {outDir:"../../dist/public", emptyOutDir:true, sourcemap:false},
});
