import scenarios from "../../../../scenarios.json";
import type { ScenarioDefinition } from "./types.js";
export function getScenario(id: string): ScenarioDefinition | undefined { return (scenarios as unknown as ScenarioDefinition[]).find(s => s.id === id); }
