import type { StackHint } from "./demo-scenarios.js";
export interface LaunchFragment { token?: string; stack: StackHint }
/** Public UI mode only. Capabilities remain tab-scoped and never appear in the URL. */
export function readLaunchFragment(): LaunchFragment {
  const classic = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "classic";
  return { stack: classic ? "audio" : "objectives" };
}
