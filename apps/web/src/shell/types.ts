import type { useSession } from "../hooks/useSession.js";

/** Everything the session hook offers. Every page works on this one session. */
export type SessionApi = ReturnType<typeof useSession>;
