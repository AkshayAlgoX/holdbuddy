// A random, short-lived, tab-scoped demo capability. This authorizes only fictional calls.
let pending: Promise<string> | undefined;
export function publicCapability(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const saved = sessionStorage.getItem("holdbuddy_public_capability");
    if (saved) {
      const check = await fetch("/api/connection", {headers: {Authorization: `Bearer ${saved}`}, cache:"no-store"});
      if (check.ok) return saved;
    }
    const response = await fetch("/api/bootstrap", {method:"POST", headers:{"Content-Type":"application/json"}, body:"{}", cache:"no-store"});
    if (!response.ok) throw new Error("Demo connection unavailable. Try again shortly.");
    const {token} = await response.json();
    sessionStorage.setItem("holdbuddy_public_capability", token);
    return token as string;
  })().catch(error => {pending=undefined; throw error;});
  return pending;
}
