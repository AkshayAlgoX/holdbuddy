import React from "react";
import type { StoryPress } from "../judge/story.js";
import { IconCheck } from "../ui/icons.js";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
const LETTERS: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };
const STATE_WORD: Record<StoryPress["state"], string> = {
  requested: "sent, awaiting the line",
  delivered: "delivered",
  not_delivered: "not delivered",
  unknown: "delivery unknown",
  refused: "not sent",
  withdrawn: "withdrawn unsent",
};

/**
 * A read-out of the keys HoldBuddy has sent, not a dial pad: nothing here can be pressed. A key lights only for a press the
 * runtime reported, and fills only when the simulator acknowledged it.
 */
export function Keypad({ presses }: { presses: readonly StoryPress[] }) {
  const latest = new Map<string, StoryPress>();
  for (const press of presses) latest.set(press.digit, press);
  const delivered = presses.filter((p) => p.state === "delivered");
  return (
    <div className="hb-keypad-wrap">
      <ul className="hb-keypad" aria-label="Keys sent to the line">
        {KEYS.map((key) => {
          const press = latest.get(key);
          const order = press ? delivered.indexOf(press) : -1;
          return (
            <li key={key} className={`hb-key ${press ? `is-${press.state}` : ""}`} aria-label={press ? `Key ${key}: ${STATE_WORD[press.state]}` : `Key ${key}: not pressed`}>
              <span className="hb-key-digit">{key}</span>
              {LETTERS[key] && <span className="hb-key-letters" aria-hidden="true">{LETTERS[key]}</span>}
              {press?.state === "delivered" && (
                <span className="hb-key-badge" aria-hidden="true">
                  <IconCheck />
                </span>
              )}
              {order >= 0 && <span className="hb-key-order hb-num" aria-hidden="true">{order + 1}</span>}
            </li>
          );
        })}
      </ul>
      <p className="hb-key-sequence" aria-live="polite">
        {delivered.length ? (
          <>
            <span className="hb-micro">Delivered</span>{" "}
            {delivered.map((p, i) => (
              <React.Fragment key={p.actionId}>
                {i > 0 && <span className="hb-key-arrow" aria-hidden="true">→</span>}
                <span className="hb-key-chip hb-num">{p.digit}</span>
              </React.Fragment>
            ))}
          </>
        ) : (
          <span className="hb-micro">No key delivered yet</span>
        )}
      </p>
    </div>
  );
}
