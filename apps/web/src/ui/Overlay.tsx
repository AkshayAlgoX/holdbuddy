import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

type Reason = "escape" | "outside" | "route" | "replace" | "close";
type Close = (reason: Reason) => void;
const Overlays = createContext<{ claim: (id: string, close: Close) => () => void }>({ claim: () => () => {} });

/** One transient surface at a time. Dismissing a surface never changes a call. */
export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const current = useRef<{ id: string; close: Close } | null>(null);
  const claim = useCallback((id: string, close: Close) => {
    if (current.current && current.current.id !== id) current.current.close("replace");
    current.current = { id, close };
    return () => { if (current.current?.id === id) current.current = null; };
  }, []);
  return <Overlays.Provider value={React.useMemo(() => ({ claim }), [claim])}>{children}</Overlays.Provider>;
}

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
function useSurface(open: boolean, close: () => void, modal: boolean) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  const { claim } = useContext(Overlays);
  const dismiss = useRef<Close>(() => {});
  useEffect(() => {
    if (!open) return;
    const prior = trigger.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    let closing = false;
    const finish: Close = (reason) => {
      if (closing) return;
      closing = true;
      closeRef.current();
      if ((reason === "escape" || reason === "close") && prior?.isConnected) prior.focus({ preventScroll: true });
    };
    dismiss.current = finish;
    const release = claim(id, finish);
    const el = root.current;
    const place = () => {
      if (modal || !el || !trigger.current) return;
      const r = trigger.current.getBoundingClientRect();
      // Mobile emulation can briefly report a stale window.innerWidth while the document and visual viewport
      // already hold the real layout width. Use that stable viewport, otherwise a popover escapes a narrow phone.
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const width = Math.min(440, viewportWidth - 32);
      const desired = Math.min(el.scrollHeight, 560, viewportHeight * .7);
      const below = viewportHeight - r.bottom - 24;
      const above = r.top - 24;
      const flip = below < desired && above > below;
      const height = Math.max(48, Math.min(desired, flip ? above : below));
      Object.assign(el.style, { position: "fixed", width: `${width}px`, maxHeight: `${height}px`, right: "auto", left: `${Math.max(16, Math.min(r.right - width, viewportWidth - width - 16))}px`, top: `${Math.max(16, flip ? r.top - height - 8 : r.bottom + 8)}px` });
    };
    place();
    (modal ? el?.querySelector<HTMLElement>(focusable) ?? el : el)?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!modal && e.target instanceof Node && !el?.contains(e.target) && !trigger.current?.contains(e.target)) finish("outside");
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish("escape"); }
      if (modal && e.key === "Tab" && el) {
        const nodes = [...el.querySelectorAll<HTMLElement>(focusable)].filter(n => !n.closest("[hidden], [inert]") && getComputedStyle(n).display !== "none" && getComputedStyle(n).visibility !== "hidden");
        const first = nodes[0], last = nodes.at(-1);
        if (!first) { e.preventDefault(); el.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const focus = (e: FocusEvent) => {
      if (closing) return;
      if (e.target instanceof Node && !el?.contains(e.target) && !trigger.current?.contains(e.target)) {
        if (modal) (el?.querySelector<HTMLElement>(focusable) ?? el)?.focus();
        else finish("outside");
      }
    };
    const route = () => finish("route");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("hashchange", route);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      release();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("hashchange", route);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (!closing && prior?.isConnected) prior.focus({ preventScroll: true });
    };
  }, [open, modal, id, claim]);
  return { id, root, trigger, dismiss: () => dismiss.current("close") };
}

export function Popover({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { id, root, trigger, dismiss } = useSurface(open, () => setOpen(false), false);
  return <div className={`hb-popover ${className}`}>
    <button type="button" ref={trigger} className="hb-popover-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => open ? dismiss() : setOpen(true)}>{label}</button>
    {open && <div ref={root} id={id} className="hb-popover-panel" role="dialog" aria-label={label} tabIndex={-1}>
      {children}<button className="hb-link hb-popover-close" onClick={dismiss}>Close</button>
    </div>}
  </div>;
}

/** Explicit dismissal only: a backdrop click must never confirm or interrupt a call. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { id, root, dismiss } = useSurface(open, onClose, true);
  if (!open) return null;
  return (
    <div className="hb-modal">
      <div className="hb-modal-sheet" ref={root} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <header className="hb-modal-head">
          <h2 className="hb-modal-title" id={id}>{title}</h2>
          <button type="button" className="hb-modal-close" aria-label="Close" onClick={dismiss}>×</button>
        </header>
        {children}
      </div>
    </div>
  );
}
