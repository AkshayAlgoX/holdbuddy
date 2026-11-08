/** A tiny hash router: the entrance and visitor destinations. No dependency, works from a file or a dev server. */
import { useCallback, useEffect, useState } from "react";

export type Route = "home" | "studio" | "lab" | "trust" | "developer";

export const ROUTE_PATHS: Record<Route, string> = {
  home: "#/",
  studio: "#/studio",
  lab: "#/voice-lab",
  trust: "#/trust",
  developer: "#/developer",
};

export function routeOf(hash: string): Route {
  const path = (hash.startsWith("#/") ? hash.slice(1) : "/").split("?")[0]!.replace(/\/+$/, "") || "/";
  switch (path) {
    case "/studio":
      return "studio";
    case "/voice-lab":
      return "lab";
    case "/trust":
      return "trust";
    case "/developer":
    case "/lab":
      return "developer";
    default:
      return "home";
  }
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => (typeof window === "undefined" ? "home" : routeOf(window.location.hash)));
  useEffect(() => {
    const onChange = () => setRoute(routeOf(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: Route) => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== ROUTE_PATHS[next]) window.location.hash = ROUTE_PATHS[next];
    setRoute(next);
  }, []);
  return [route, navigate];
}
