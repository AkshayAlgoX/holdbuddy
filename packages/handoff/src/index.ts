/** Browser-safe. No Node APIs, no I/O, and no import of the simulator or its scenarios. */
export { classifyHeard, type Heard, type HeardKind } from "./classify.js";
export {
  LINE_SILENT_AFTER_MS,
  availableActions,
  initialHandoffState,
  reduceHandoff,
  tickHandoff,
  type HandoffAction,
  type HandoffInput,
  type HandoffNotification,
  type HandoffPhase,
  type HandoffState,
  type NotificationKind,
  type PossibleHumanAlert,
} from "./state.js";
