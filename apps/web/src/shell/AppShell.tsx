import React, { useEffect, useRef } from "react";
import { BrandMark, RouteGlyph } from "../ui/icons.js";
import { ROUTE_PATHS, type Route } from "./router.js";
import type { StackHint } from "../judge/demo-scenarios.js";
import type { SessionApi } from "./types.js";

const NAV: Array<{ route: Route; label: string; short: string; glyph: "home" | "step" | "lab" | "end" }> = [
  { route: "studio", label: "Try a call", short: "Try a call", glyph: "step" },
  { route: "lab", label: "Languages", short: "Languages", glyph: "lab" },
  { route: "trust", label: "How it works", short: "How it works", glyph: "end" },
];

const STACK_LABEL: Record<StackHint, string> = {
  objectives: "Demo connected",
  audio: "Demo connected",
  fast: "Silent demo connected",
  "gnani-path": "Demo connected",
  "live-prisma": "Demo gateway available",
  unknown: "Demo connected",
};

/** What the connection really is, from the session hook's own state. */
export function connectionStatus(session: Pick<SessionApi, "config" | "health" | "connectionState" | "reconnectAttempts">, stack: StackHint): { tone: "ok" | "caution" | "danger" | "info"; text: string } {
  if (!session.config.userToken) return { tone: "caution", text: "Connect demo" };
  if (session.connectionState === "reconnecting") return { tone: "caution", text: "Reconnecting…" };
  if (!session.health) return { tone: "danger", text: "Demo unavailable" };
  return { tone: "info", text: STACK_LABEL[stack] };
}

interface AppShellProps {
  route: Route;
  onNavigate: (route: Route) => void;
  session: SessionApi;
  stack: StackHint;
  onOpenSettings: () => void;
  children: React.ReactNode;
}

export function AppShell({ route, onNavigate, session, stack, onOpenSettings, children }: AppShellProps) {
  const status = connectionStatus(session, stack);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // A route change is a new page: start at the top, and move focus there for keyboard and screen-reader users.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    main.current?.focus({ preventScroll: true });
  }, [route]);

  const link = (target: Route) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <div className="hb-root" data-route={route}>
      <a className="hb-skip" href="#hb-main" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <header className="hb-header">
        <div className="hb-header-inner">
          <a className="hb-brand" href={ROUTE_PATHS.home} onClick={link("home")} aria-label="HoldBuddy home">
            <BrandMark className="hb-brand-mark" />
            <span className="hb-brand-word">HoldBuddy</span>
          </a>
          <nav className="hb-nav" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.route} href={ROUTE_PATHS[item.route]} onClick={link(item.route)} className="hb-nav-link" aria-current={route === item.route ? "page" : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="hb-header-tools">
            <button type="button" className={`hb-status is-${status.tone}`} onClick={onOpenSettings} aria-label={`Demo connection: ${status.text}`} aria-haspopup="dialog">
              <span className="hb-status-mark" aria-hidden="true" />
              <span className="hb-status-text">{status.text}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="hb-main" ref={main} tabIndex={-1} className="hb-main">
        {children}
      </main>

      <footer className="hb-footer">
        <div className="hb-wrap hb-footer-inner">
          <p className="hb-footer-sign">
            Hold, <span className="hb-em">handled.</span>
          </p>
          <div className="hb-footer-cols">
            <p className="hb-small">
              A simulated customer-care line. No real phone calls.
            </p>
            <nav className="hb-footer-nav" aria-label="Footer">
              <a href={ROUTE_PATHS.studio} onClick={link("studio")}>Try a call</a>
              <a href={ROUTE_PATHS.lab} onClick={link("lab")}>Languages</a>
              <a href={ROUTE_PATHS.trust} onClick={link("trust")}>How it works</a>
              <a href={ROUTE_PATHS.developer} onClick={link("developer")}>Developer Lab</a>
            </nav>
          </div>
        </div>
      </footer>

      <nav className="hb-tabbar" aria-label="Sections">
        {NAV.map((item) => (
          <a key={item.route} href={ROUTE_PATHS[item.route]} onClick={link(item.route)} className="hb-tab" aria-current={route === item.route ? "page" : undefined}>
            <RouteGlyph className="hb-tab-glyph" variant={item.glyph} />
            <span>{item.short}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
