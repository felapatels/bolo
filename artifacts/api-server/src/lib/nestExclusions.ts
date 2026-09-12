import type { Request } from "express";
import { nonLearnerUserIds } from "./ownerGate";
/** Reporting filters only. Never used to authorize the Nest or change accounts. */
export function nestExcludedIds(req: Request): Set<string> {
  const raw = req.query.excludeIds;
  if (raw !== undefined && (typeof raw !== "string" || raw.length > 8000)) throw new Error("Invalid exclusions");
  const ids = raw === undefined ? [...nonLearnerUserIds] : raw === "" ? [] : raw.split(",");
  if (ids.length > 100 || ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error("Choose up to 100 valid accounts per app");
  return new Set(req.query.exclOwner === "0" ? [] : ids);
}
export function nestExclusionKey(req: Request): string { return [...nestExcludedIds(req)].sort().join(","); }
