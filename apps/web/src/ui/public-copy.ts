/** Presentation boundary: retain precise diagnostics in session state, never interpolate them into visitor copy. */
export function publicError(code: string): string {
  if (/stream_gap/.test(code)) return "Part of the call history is missing. Reconnect to check the current call before continuing.";
  if (/stream_error/.test(code)) return "The connection to your call was interrupted. Reconnect to check its status. A new call has not been started.";
  if (/cancel|abort/.test(code)) return "The request was cancelled. Check the call below before trying again.";
  if (/simulator|termination|stop_failed|stop_unconfirmed/.test(code)) return "The demo could not confirm that the previous call ended. A new call must wait until this is resolved.";
  if (/auth|unauthorized|forbidden|token/.test(code)) return "This demo connection has expired. Reload this page to reconnect. Existing simulated calls expire automatically.";
  if (/conflict|already_active|session_active/.test(code)) return "Another call may still be active. Check the current call before starting again.";
  if (/network|health|fetch|http_5|unavailable/.test(code)) return "The demo couldn't connect. Please try reconnecting in a moment.";
  return "The request didn't complete. Check the call's status, then reconnect if needed.";
}
export function recognitionSource(source: string): string {
  return source === "REAL_API" ? "recognized by Gnani" : source === "MOCK" ? "demo transcripts" : "unverified results";
}
export const terminationWarning = "The demo has not confirmed that the call ended. It may still be running. Reconnect to check before starting another call.";
