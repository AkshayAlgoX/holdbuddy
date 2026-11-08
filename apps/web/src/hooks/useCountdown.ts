import { useEffect, useState } from "react";

export function useCountdown(deadlineMs?: number): {
  remainingMs: number;
  remainingSeconds: number;
  isExpired: boolean;
  formatted: string;
} {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadlineMs) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 200);

    return () => clearInterval(interval);
  }, [deadlineMs]);

  if (!deadlineMs) {
    return {
      remainingMs: 0,
      remainingSeconds: 0,
      isExpired: false,
      formatted: "0s",
    };
  }

  const remainingMs = Math.max(0, deadlineMs - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isExpired = remainingMs <= 0;

  return {
    remainingMs,
    remainingSeconds,
    isExpired,
    formatted: `${remainingSeconds}s`,
  };
}
