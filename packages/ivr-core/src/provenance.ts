import type { ObservationProvenance, ProvenanceAttestation, TranscriptionStatus } from "./contracts.js";

interface Issued {
  provenance: ObservationProvenance;
  transcript: string;
  status: TranscriptionStatus;
  consumed: boolean;
}

/**
 * Only objects issued here count, each for exactly one transcript and one accepted use. A caller can't
 * forge one with a plain object or JSON, swap in different words, or replay one. This holds within one
 * trusted server process; it is not a defence against code that imports internal modules.
 */
const issued = new WeakMap<object, Issued>();

/** Internal: not exported from the package. Only trusted adapter code may call this. */
export function issueAttestation(provenance: ObservationProvenance, transcript: string, status: TranscriptionStatus): ProvenanceAttestation {
  const attestation = Object.freeze({ provenance });
  issued.set(attestation, { provenance, transcript, status, consumed: false });
  return attestation;
}

/** Doesn't consume the token, so an event rejected for an unrelated reason can be sent again. */
export function verifiedProvenance(attestation: unknown, transcript: string, status: TranscriptionStatus): ObservationProvenance | undefined {
  if (typeof attestation !== "object" || attestation === null) return undefined;
  const record = issued.get(attestation);
  if (!record || record.consumed || record.transcript !== transcript || record.status !== status) return undefined;
  return record.provenance;
}

export function consumeAttestation(attestation: object): void {
  const record = issued.get(attestation);
  if (record) record.consumed = true;
}

/** The one label a caller may obtain directly, and the weakest: it claims nothing about audio. */
export function attestOfflineFixture(transcript: string, status: TranscriptionStatus = "transcribed"): ProvenanceAttestation {
  return issueAttestation("offline_fixture", transcript, status);
}
