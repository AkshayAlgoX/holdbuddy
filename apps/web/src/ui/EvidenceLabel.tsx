/** Runtime provenance stays precise internally; visitor labels explain its meaning. */
import React from "react";

export type EvidenceKind = "MOCK" | "LOCAL_REPLAY" | "REAL_API" | "GENUINE_PAST_RUN";

export const EVIDENCE: Record<EvidenceKind, { cls: string; label: string; short: string; long: string }> = {
  MOCK: {
    cls: "hb-ev-mock", label: "Demo transcript",
    short: "No recognition happened",
    long: "The demo uses a prepared transcript. No speech recognition happened during this call.",
  },
  LOCAL_REPLAY: {
    cls: "hb-ev-replay", label: "Recorded audio",
    short: "New synthetic demo audio played on this device",
    long: "A previously recorded audio file played on this device. No real phone line or speech generated now.",
  },
  REAL_API: {
    cls: "hb-ev-real", label: "Recognized by Gnani",
    short: "Recognised by Gnani during this call",
    long: "Gnani Prisma recognised this audio during this call, in a separately authorised paid run. Only the runtime can assign this label.",
  },
  GENUINE_PAST_RUN: {
    cls: "hb-ev-past", label: "Past experiment",
    short: "Historical aggregate results",
    long: "Measurements from a past genuine Gnani experiment. Nothing on this page makes a new recognition request.",
  },
};

export function EvidenceLabel({ kind, className = "" }: { kind: EvidenceKind; className?: string }) {
  const def = EVIDENCE[kind];
  return (
    <span className={`hb-ev ${def.cls} ${className}`} aria-label={`${def.label}: ${def.short}`} data-evidence={kind}>
      {def.label}
    </span>
  );
}
