/** Presentation-only extension for existing authenticated GET /api/v1/health.
 * Not a native controller contract or a new endpoint. A future server projector must
 * independently verify and approve every public field. The offline gateway supplies none. */
export type BackendTier = "simulated" | "live" | "unavailable";
export interface CapabilityMatrixItem { key: string; name: string; tier: BackendTier; summary: string; evidence: string; technicalBoundary: string }
export interface PublicRecognitionEvidence {
  schemaVersion: 1; scope: "past_backend_qualification"; dataSource: "REAL_API";
  transport: "REST"; model: "prisma-v3.0"; language: "en-IN" | "hi-IN";
  qualifiedAt: string; providerRequestId: string; providerRequestIdVerifiedByServer: true;
  localExecutionId?: string; recognitionComplete: true; playbackComplete: true;
  dtmfDispatched: 0; publicEvidenceApproved: true;
}
const KEYS = new Set(["schemaVersion", "scope", "dataSource", "transport", "model", "language", "qualifiedAt", "providerRequestId", "providerRequestIdVerifiedByServer", "localExecutionId", "recognitionComplete", "playbackComplete", "dtmfDispatched", "publicEvidenceApproved"]);
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
/** No local-ID fallback, arbitrary transcript, credential, URL or recording field. */
export function parsePublicRecognitionEvidence(value: unknown, now = Date.now()): Readonly<PublicRecognitionEvidence> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some(k => !KEYS.has(k)) || r.schemaVersion !== 1 || r.scope !== "past_backend_qualification" || r.dataSource !== "REAL_API" || r.transport !== "REST" || r.model !== "prisma-v3.0" || (r.language !== "en-IN" && r.language !== "hi-IN") || !identifier(r.providerRequestId) || r.providerRequestIdVerifiedByServer !== true || r.publicEvidenceApproved !== true || r.recognitionComplete !== true || r.playbackComplete !== true || r.dtmfDispatched !== 0 || (r.localExecutionId !== undefined && !identifier(r.localExecutionId)) || typeof r.qualifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(r.qualifiedAt) || !Number.isFinite(Date.parse(r.qualifiedAt)) || Date.parse(r.qualifiedAt) > now + 300000) return null;
  return Object.freeze({ schemaVersion: 1, scope: "past_backend_qualification", dataSource: "REAL_API", transport: "REST", model: "prisma-v3.0", language: r.language as "en-IN" | "hi-IN", qualifiedAt: r.qualifiedAt, providerRequestId: r.providerRequestId, providerRequestIdVerifiedByServer: true, ...(r.localExecutionId ? { localExecutionId: r.localExecutionId } : {}), recognitionComplete: true, playbackComplete: true, dtmfDispatched: 0, publicEvidenceApproved: true });
}
export function capabilityMatrix(evidence: Readonly<PublicRecognitionEvidence> | null): readonly CapabilityMatrixItem[] {
  const e = parsePublicRecognitionEvidence(evidence);
  return [
    { key: "ivr-navigation-simulator", name: "Hindi IVR demonstration", tier: "simulated", summary: "Complaint, payment help and refund refusal on the same fictional menu.", evidence: "Authentic Gnani Timbre v3.0 Shivani audio and prepared demo transcripts. The menu and goal determine the selected option.", technicalBoundary: "No telephone network or Gnani recognition request is used by these simulated calls." },
    { key: "gnani-prisma-rest", name: "Gnani Prisma REST evidence", tier: e ? "live" : "unavailable", summary: e ? "Genuine API evidence from a past backend qualification; not recognition in this web demo." : "Genuine backend evidence is not connected to this website.", evidence: e ? `${e.model} · ${e.language} · REST · qualified ${e.qualifiedAt.slice(0, 10)}. Gnani provider request ID: ${e.providerRequestId}.` : "No approved server evidence has been supplied. A local execution identifier is not a Gnani provider request ID.", technicalBoundary: e ? "Server-approved historical evidence only. No current-call recognition, streaming or telephone transfer is established." : "Requires a verified, privacy-approved server projection through the existing authenticated gateway." },
    { key: "streaming", name: "Real-time streaming recognition", tier: "unavailable", summary: "Not enabled or qualified on the public website.", evidence: "A REST file-recognition result does not establish streaming operation.", technicalBoundary: "The browser does not connect directly to speech providers." },
    { key: "calling", name: "Public telephone calling", tier: "unavailable", summary: "No public PSTN or external telephone calls.", evidence: "All calls shown here are fictional simulations.", technicalBoundary: "No public dialing control or telephone-provider credential is exposed." },
    { key: "handoff", name: "Telephone handover", tier: "unavailable", summary: "Confirmation ends the fictional demo; it does not connect a real agent.", evidence: "Simulated hold and a synthetic greeting are available in the studio.", technicalBoundary: "Stopping automation, closing a simulator and transferring a telephone call are separate outcomes." },
  ];
}
