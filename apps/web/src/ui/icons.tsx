/** HoldBuddy's line icons: 24 px grid, 1.75 stroke, round caps. Decorative unless given a title. */
import React from "react";

type IconProps = { className?: string; title?: string; size?: number; width?: number; height?: number };

function Svg({ className, title, size = 18, width, height, children }: IconProps & { children: React.ReactNode }) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      className={`hb-icon ${className || ''}`.trim()}
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const IconPhone = (p: IconProps) => (
  <Svg {...p}><path d="M5 4h3l1.6 4.2-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2L20 16v3a1.8 1.8 0 0 1-1.9 1.8A16 16 0 0 1 3.2 5.9 1.8 1.8 0 0 1 5 4Z" /></Svg>
);
export const IconPhoneOff = (p: IconProps) => (
  <Svg {...p}><path d="M10.7 13.3a11 11 0 0 0 3.8 2.6l1.3-2L20 15.5v3a1.8 1.8 0 0 1-1.9 1.8 16 16 0 0 1-8.3-3.3M6.6 13.6A16 16 0 0 1 3.2 5.9 1.8 1.8 0 0 1 5 4h3l1.6 4.2-2 1.3" /><path d="M3 21 21 3" /></Svg>
);
export const IconHand = (p: IconProps) => (
  <Svg {...p}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V13m0-4.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.4a6 6 0 0 1-4.6-2.2L3.6 15.4a1.6 1.6 0 0 1 2.3-2.2L8 15" /></Svg>
);
export const IconPlay = (p: IconProps) => (<Svg {...p}><path d="M7 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L8.2 4.8A.8.8 0 0 0 7 5.5Z" /></Svg>);
export const IconStop = (p: IconProps) => (<Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>);
export const IconReplay = (p: IconProps) => (<Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4.5h4.5" /></Svg>);
export const IconVolume = (p: IconProps) => (<Svg {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>);
export const IconVolumeOff = (p: IconProps) => (<Svg {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" /><path d="m16 9.5 5 5m0-5-5 5" /></Svg>);
export const IconShield = (p: IconProps) => (<Svg {...p}><path d="M12 3 4.5 6v5.6c0 4.4 3.1 8.2 7.5 9.4 4.4-1.2 7.5-5 7.5-9.4V6Z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></Svg>);
export const IconKeypad = (p: IconProps) => (
  <Svg {...p}>{[6, 12, 18].flatMap((x) => [5, 10, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}<circle cx="12" cy="20" r="1.2" /></Svg>
);
export const IconGlobe = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>
);
export const IconCheck = (p: IconProps) => (<Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>);
export const IconX = (p: IconProps) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>);
export const IconAlert = (p: IconProps) => (<Svg {...p}><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.2v.1" /></Svg>);
export const IconInfo = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.1" /></Svg>);
export const IconClock = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>);
export const IconUser = (p: IconProps) => (<Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>);
export const IconArrowRight = (p: IconProps) => (<Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>);
export const IconWave = (p: IconProps) => (<Svg {...p}><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0" /></Svg>);
export const IconLock = (p: IconProps) => (<Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>);
export const IconEye = (p: IconProps) => (<Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></Svg>);
export const IconEyeOff = (p: IconProps) => (<Svg {...p}><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.5 6.9A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1" /><path d="M3 3l18 18M9.9 9.9a2.8 2.8 0 0 0 4 4" /></Svg>);
export const IconBeaker = (p: IconProps) => (<Svg {...p}><path d="M9 3h6M10 3v6.5L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3" /><path d="M7.2 15h9.6" /></Svg>);

/**
 * The HoldBuddy mark: the route. A line that walks, steps up at 45° where a key was pressed, and ends in your ink.
 * The same geometry draws every call in the Studio.
 */
export function BrandMark({ className, width = 44, height = 28 }: { className?: string; width?: number; height?: number }) {
  return (
    <svg className={`hb-brand-mark ${className || ''}`.trim()} width={width} height={height} viewBox="0 0 44 28" aria-hidden="true">
      <path d="M3 22 H17 L27 12 H35" fill="none" stroke="#ef5533" strokeWidth="4.5" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx="4" cy="22" r="3.6" fill="#f4f1ea" stroke="#181b20" strokeWidth="2" />
      <circle cx="38" cy="12" r="4.4" fill="#181b20" />
    </svg>
  );
}

/** A small route glyph for navigation and section marks. */
export function RouteGlyph({ className, variant = "step", size = 20 }: { className?: string; variant?: "step" | "hold" | "end" | "lab" | "home"; size?: number }) {
  return (
    <svg className={`hb-route-glyph ${className || ''}`.trim()} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      {variant === "home" && <><path d="M3 17h7l5-5h6" /><circle cx="3" cy="17" r="1.6" fill="currentColor" /></>}
      {variant === "step" && <><path d="M2 18h6l5-5h3l4-4h2" /><circle cx="21.5" cy="9" r="1.8" fill="currentColor" /></>}
      {variant === "hold" && <><path d="M2 10h20M2 14h20" /></>}
      {variant === "end" && <><path d="M2 12h12" /><circle cx="18" cy="12" r="3.5" fill="currentColor" /></>}
      {variant === "lab" && <><path d="M3 6h18M3 12h12M3 18h15" /></>}
    </svg>
  );
}
