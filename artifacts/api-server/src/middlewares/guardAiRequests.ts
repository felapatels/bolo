import type { Request, Response, NextFunction } from "express";
import { requireAiConsent } from "./requireAiConsent";
export function isAiSendRequest(method: string, path: string): boolean {
  const normalized = path.replace(/\/$/, "");
  if (method === "GET") return ["/openai/chat-greeting", "/openai/chacha-lines"].includes(normalized);
  if (method !== "POST") return false;
  return ["/openai/pronunciation", "/openai/chat", "/openai/tts", "/openai/narrate", "/openai/transcribe", "/openai/generate-phrase", "/openai/chacha-call/start"].includes(normalized)
    || /^\/openai\/chacha-call\/[^/]+\/turn$/.test(normalized);
}

export async function guardAiRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isAiSendRequest(req.method, req.path)) { next(); return; }
  await requireAiConsent(req, res, next);
}
