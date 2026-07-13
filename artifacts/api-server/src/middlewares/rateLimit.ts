import type { NextFunction, Request, Response } from "express";
import type { AuthedRequest } from "./requireAuth";

// A lightweight in-memory sliding-window rate limiter factory. Each call returns
// an independent middleware with its own bucket map, so different routes (e.g.
// the OpenAI endpoints and the attempts write path) throttle separately and
// never share a budget. Keying is per authenticated user (this runs after
// requireAuth), falling back to the client IP so one learner can't exhaust a
// shared bucket and lock everyone else out.
//
// It exists to cap abuse / runaway cost on internet-reachable routes without
// adding login friction. Limits are chosen to be generous enough that normal
// human-speed usage is never throttled.
export type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
};

export function createRateLimit({
  windowMs,
  max,
  message = "Too many requests, take a short break.",
}: RateLimitOptions) {
  const hits = new Map<string, number[]>();

  return function rateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const key = (req as AuthedRequest).userId ?? req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ error: message });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (hits.size > 500) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    next();
  };
}
