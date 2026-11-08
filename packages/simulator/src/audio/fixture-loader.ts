import { computeSha256, parseWav, validateWav } from "./wav.js";
export type FixtureVerificationStatus = "NOT_VERIFIED_FOR_SPEECH";
export interface PublicFixture { id: string; transcript: string; language: string; status: string; sha256: string; durationMs: number; sampleRate: number }
export interface LoadedAudioFixture { entry: PublicFixture; bytes: Buffer }
export class FixtureCatalog {
  #fixtures = new Map<string, LoadedAudioFixture>();
  #mock = new Map<string, { transcript: string; status: "transcribed" | "no_speech" | "truncated" }>();
  registerFixture(entry: PublicFixture, bytes: Buffer) {
    if (!validateWav(bytes, {checkTrailingSilence: true}).valid) throw new Error("Invalid public speech asset.");
    const fixture = {entry, bytes}; this.#fixtures.set(entry.id, fixture);
    this.#mock.set(computeSha256(bytes), {transcript: entry.transcript, status: "transcribed"}); return fixture;
  }
  registerMock(hash: string, transcript: string, status: "transcribed" | "no_speech" | "truncated" = "transcribed") { this.#mock.set(hash,{transcript,status}); }
  get(id: string) { return this.#fixtures.get(id); }
  findSpeech(language: string, text: string) { return [...this.#fixtures.values()].find(f=>f.entry.language===language && f.entry.transcript===text); }
  toMockFixturesMap() { return this.#mock; }
}
