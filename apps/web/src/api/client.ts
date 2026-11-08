import { parsePublicRecognitionEvidence } from "./backend-contracts.js";
import { publicCapability } from "./public-connection.js";
/**
 * HoldBuddy Call Runtime HTTP Client.
 * Adheres strictly to docs/runtime/integration-contract.md.
 */
import type {
  ClarificationRequest,
  ConnectionConfig,
  CreateSessionRequest,
  HealthResponse,
  HttpErrorBody,
  HumanDecisionRequest,
  SessionView,
} from "../types.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RuntimeClient {
  private config: ConnectionConfig;

  constructor(config: ConnectionConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      userToken: config.userToken.trim(),
    };
  }

  updateConfig(config: Partial<ConnectionConfig>): void {
    if (config.baseUrl !== undefined) {
      this.config.baseUrl = config.baseUrl.replace(/\/+$/, "");
    }
    if (config.userToken !== undefined) {
      this.config.userToken = config.userToken.trim();
    }
  }

  getConfig(): Readonly<ConnectionConfig> {
    return { ...this.config };
  }

  private headers(includeAuth = true, extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(extraHeaders);
    if (includeAuth && this.config.userToken) {
      headers.set("Authorization", `Bearer ${this.config.userToken}`);
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    includeAuth = true,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = this.headers(false, options.headers);
    headers.set("Authorization", `Bearer ${await publicCapability()}`);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : "Network failure";
      throw new ApiError(0, "network_error", `Failed to reach runtime at ${this.config.baseUrl}: ${msg}`);
    }

    if (!response.ok) {
      let code = "unknown_error";
      let message = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson = (await response.json()) as HttpErrorBody;
        if (errorJson?.error) {
          code = errorJson.error.code || code;
          message = errorJson.error.message || message;
        }
      } catch {
        // Fallback to text status
      }
      throw new ApiError(response.status, code, message);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  }

  /** GET /v1/health */
  async getHealth(): Promise<HealthResponse> {
    const raw = await this.request<HealthResponse>("/v1/health", { method: "GET" });
    return { ok: raw.ok, protocolVersion: raw.protocolVersion, sttMode: raw.sttMode, recognitionEvidence: parsePublicRecognitionEvidence(raw.recognitionEvidence) };
  }

  /**
   * The health endpoint needs no token, so it can't say whether this one works. This asks for a session that
   * can't exist instead. The runtime checks the token first, so "not found" means it accepted the token.
   */
  async checkToken(): Promise<void> {
    try {
      await this.getSession("connection-check");
    } catch (err: unknown) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }

  /** POST /v1/sessions */
  async createSession(payload: CreateSessionRequest): Promise<SessionView> {
    return this.request<SessionView>("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /** GET /v1/sessions/:id */
  async getSession(sessionId: string): Promise<SessionView> {
    return this.request<SessionView>(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
    });
  }

  /** POST /v1/sessions/:id/stop */
  async stopSession(sessionId: string): Promise<SessionView> {
    return this.request<SessionView>(`/v1/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  /** POST /v1/sessions/:id/takeover */
  async takeOverSession(sessionId: string): Promise<SessionView> {
    return this.request<SessionView>(`/v1/sessions/${encodeURIComponent(sessionId)}/takeover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  /** POST /v1/sessions/:id/clarification */
  async answerClarification(sessionId: string, payload: ClarificationRequest): Promise<{ queued: boolean }> {
    return this.request<{ queued: boolean }>(`/v1/sessions/${encodeURIComponent(sessionId)}/clarification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /** POST /v1/sessions/:id/human-decision */
  async decideHuman(sessionId: string, payload: HumanDecisionRequest): Promise<SessionView> {
    return this.request<SessionView>(`/v1/sessions/${encodeURIComponent(sessionId)}/human-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}
