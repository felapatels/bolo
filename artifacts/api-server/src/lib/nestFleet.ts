/** Owner-only federation. Credentials stay server-side; no learner session is impersonated. */
import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { isOwner } from "./ownerGate";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { NEST_APP_ID } from "./nestRegion";

export const NEST_APPS = [
  { id: "india", name: "India", region: "South Asia", origin: "https://bolo-india.app", currency: "Chai", color: "#7663ed" },
  { id: "sea", name: "Southeast Asia", region: "Southeast Asia", origin: "https://bolo-sea.app", currency: "Kopi", color: "#178b88" },
  { id: "east", name: "East Asia", region: "East Asia", origin: "https://bolo-east.app", currency: "Cha", color: "#cc527c" },
  { id: "africa", name: "Africa", region: "Africa", origin: "https://bolo-africa.app", currency: "Cowries", color: "#ad742b" },
  { id: "europe", name: "Europe", region: "Europe", origin: "https://bolo-europe.app", currency: "čaj", color: "#467ec5" },
  { id: "latam", name: "Latin America", region: "Latin America", origin: "https://bolo-latam.app", currency: "Cacao", color: "#be6246" },
] as const;
// Deliberately excludes pages, mail bodies, replies, and every write operation.
const resources = new Set(["summary", "range", "drill", "reports", "map", "live", "wardrobe", "social", "exclusion-accounts"]);
const trustedReads = new WeakSet<Request>();
export function canReadNest(req: Request): boolean {
  return isOwner((req as AuthedRequest).userId) || (req.method === "GET" && trustedReads.has(req));
}
function secretMatches(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const deny = (res: Response) => { res.status(404).json({ error: "Not found" }); };
const query = (req: Request) => {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "metric", "exclOwner", "minutes", "limit", "excludeIds", "search", "cursor"]) {
    if (typeof req.query[key] === "string") params.set(key, req.query[key] as string);
  }
  return params.size ? `?${params}` : "";
};

export function createNestFleetRouters(nest: Router) {
  const relay = Router(), hub = Router();
  // Mounted before Clerk requireAuth. The independent key authorizes only this bounded read surface.
  relay.all("/nest/relay/:resource", (req: Request, res: Response, next: NextFunction) => {
    const resource = String(req.params.resource);
    if (req.method !== "GET" || !resources.has(resource) ||
        !secretMatches(req.get("X-Nest-Relay-Key"), process.env.NEST_RELAY_KEY)) return deny(res);
    res.set("Cache-Control", "no-store");
    trustedReads.add(req);
    req.url = `/nest/${resource}${query(req)}`;
    nest(req, res, next);
  });
  hub.get("/nest/fleet/apps", (req: Request, res: Response) => {
    if (!isOwner((req as AuthedRequest).userId)) return deny(res);
    res.set("Cache-Control", "no-store").json({ localApp: NEST_APP_ID, apps: NEST_APPS.map(app => ({
      ...app, configured: app.id === NEST_APP_ID || (process.env[`NEST_FLEET_${app.id.toUpperCase()}_KEY`]?.length ?? 0) >= 32,
    })) });
  });
  hub.get("/nest/fleet/:app/:resource", async (req: Request, res: Response, next: NextFunction) => {
    if (!isOwner((req as AuthedRequest).userId)) return deny(res);
    const app = NEST_APPS.find(a => a.id === req.params.app), resource = String(req.params.resource);
    if (!app || (!resources.has(resource) && resource !== "health")) return deny(res);
    res.set("Cache-Control", "no-store");
    if (app.id === NEST_APP_ID && resource !== "health") {
      req.url = `/nest/${resource}${query(req)}`;
      nest(req, res, next);
      return;
    }
    const key = process.env[`NEST_FLEET_${app.id.toUpperCase()}_KEY`];
    if (resource !== "health" && (!key || key.length < 32)) {
      res.status(503).json({ error: "Connection not configured", app: app.id, code: "NOT_CONFIGURED" }); return;
    }
    try {
      // Fixed HTTPS origins only, no redirects: a supplied URL can never receive the key.
      const upstream = await fetch(`${app.origin}/api/${resource === "health" ? "healthz" : `nest/relay/${resource}${query(req)}`}`, {
        headers: resource === "health" ? {} : { "X-Nest-Relay-Key": key! },
        signal: AbortSignal.timeout(12_000), redirect: "error",
      });
      if (!upstream.ok || !upstream.headers.get("content-type")?.includes("application/json")) {
        res.status(502).json({ error: `App endpoint unavailable (HTTP ${upstream.status})`, app: app.id }); return;
      }
      const data = await upstream.json();
      res.json(data);
    } catch {
      res.status(502).json({ error: "App did not return a reading within 12 seconds", app: app.id });
    }
  });
  return { relay, hub };
}
