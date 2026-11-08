/** A reviewed static record of a completed local test. Never a live browser capability. */
export interface NativeEngineTurn {
  generation: number;
  source: "REAL_API";
  httpStatus: 200;
  model: "prisma-v3.0";
  language: "hi-IN";
  requestId: string;
  transcript: string;
  decision: { digit: string; label: string };
  receipt: { evidence: "ARI_IVR_EVENT"; digit: string; generation: number; duplicate: false };
}
export interface NativeEngineEvidence {
  schema: "holdbuddy.public.native-test.v1";
  scope: "completed_controlled_local_test";
  manifestSha256: string;
  sourceCommit: string;
  runLabel: string;
  recordedOn: string;
  transport: "REST";
  model: "prisma-v3.0";
  language: "hi-IN";
  audioSource: "Kokoro";
  freshRequests: 3;
  cleanup: "confirmed";
  endpoint: "fictional_complaint_assistance";
  websiteConnected: false;
  publicPstn: false;
  streaming: false;
  turns: readonly NativeEngineTurn[];
}

/**
 * A2 verified evidence from the controlled Asterisk 20 ARI + Gnani Prisma REST qualification.
 * Kept strictly in the developer laboratory; never exposed as a live browser capability.
 */
export const NATIVE_ENGINE_EVIDENCE: Readonly<NativeEngineEvidence> | null = Object.freeze({
  schema: "holdbuddy.public.native-test.v1" as const,
  scope: "completed_controlled_local_test" as const,
  manifestSha256: "6e747cc4d757de9c5f3d40bd346cd51bd47419a5c6f1f68296dec969771f7bf7",
  sourceCommit: "b995fd55289782cffc1e48a885ef743207b9c850",
  runLabel: "live-journey-three-fresh-two",
  recordedOn: "2026-11-07",
  transport: "REST" as const,
  model: "prisma-v3.0" as const,
  language: "hi-IN" as const,
  audioSource: "Kokoro" as const,
  freshRequests: 3 as const,
  cleanup: "confirmed" as const,
  endpoint: "fictional_complaint_assistance" as const,
  websiteConnected: false as const,
  publicPstn: false as const,
  streaming: false as const,
  turns: [
    {
      generation: 1,
      source: "REAL_API" as const,
      httpStatus: 200 as const,
      model: "prisma-v3.0" as const,
      language: "hi-IN" as const,
      requestId: "75904f4b-73c5-475a-abbd-7cd81d314566",
      transcript: "mobile के लिए कृपया 3 दबाएं। landline के लिए 6 दबाएं। रोमिंग के लिए कृपया एक दबाएं। ब्रॉडबैंड के लिए पाँच दबाएं।",
      decision: { digit: "5", label: "ब्रॉडबैंड" },
      receipt: { evidence: "ARI_IVR_EVENT" as const, digit: "5", generation: 1, duplicate: false as const },
    },
    {
      generation: 2,
      source: "REAL_API" as const,
      httpStatus: 200 as const,
      model: "prisma-v3.0" as const,
      language: "hi-IN" as const,
      requestId: "436e2928-5b8b-4ae8-89ca-36ab365cba7a",
      transcript: "दोबारा सुनने के लिए 3 दबाएं। बिल के लिए कृपया 8 दबाएं। प्लान के लिए 2 दबाएं। नया connection के लिए कृपया 6 दबाएं। तकनीकी सहायता के लिए 7 दबाएं। store की जानकारी के लिए कृपया 1 दबाएं। मुख्य menu पर वापस जाने के लिए 9 दबाएं।",
      decision: { digit: "8", label: "बिल" },
      receipt: { evidence: "ARI_IVR_EVENT" as const, digit: "8", generation: 2, duplicate: false as const },
    },
    {
      generation: 3,
      source: "REAL_API" as const,
      httpStatus: 200 as const,
      model: "prisma-v3.0" as const,
      language: "hi-IN" as const,
      requestId: "daf896d2-0d1e-456d-bea1-e793831aedd5",
      transcript: "बिल की शिकायत के लिए कृपया 1 दबाएँ। roaming के लिए 7 दबाएँ। दोबारा सुनने के लिए कृपया 4 दबाएं। बिल के भुगतान के लिए 2 दबाएं। मुख्य menu पर वापस जाने के लिए कृपया 5 दबाएं।",
      decision: { digit: "1", label: "बिल शिकायत" },
      receipt: { evidence: "ARI_IVR_EVENT" as const, digit: "1", generation: 3, duplicate: false as const },
    },
  ],
});
