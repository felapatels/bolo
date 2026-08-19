// Sending push through Expo's service.
//
// WHY EXPO AND NOT APNs DIRECTLY. Expo's push service fans out to APNs and
// FCM, which means no Apple push key and no Firebase service account ever
// enters this codebase or its secrets. EAS already holds the credentials it
// needs for the build; this is the same account reaching the same devices.
//
// THE HARD PART OF PUSH IS NOT SENDING, IT IS THE GRAVEYARD. Every install that
// is deleted leaves a token behind that looks perfectly valid and will never
// deliver again. Expo answers those with DeviceNotRegistered, and a sender that
// ignores it slowly turns into a machine that mails a dead address forever. So
// the result of a send is not "did it work" but "which of these are dead", and
// the caller is expected to act on that.

/** https://docs.expo.dev/push-notifications/sending-notifications/ */
const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";

/** Expo rejects a batch larger than this. */
export const MAX_BATCH = 100;

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  /** Deep link and anything else the app reads on tap. */
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
};

export type PushSendResult = {
  /** Tokens Expo accepted for delivery. */
  accepted: string[];
  /** Tokens Expo says belong to an install that no longer exists. */
  deviceNotRegistered: string[];
  /** Tokens that failed for any other reason, with Expo's message. */
  failed: { token: string; error: string }[];
};

/** Expo's own shape. Only what we act on is modelled. */
type ExpoTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

/**
 * A token is only ever minted by Expo, so this is a shape check rather than a
 * validation: it keeps obviously-wrong strings out of the table and out of a
 * batch, where one bad entry can fail the whole request.
 */
export function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^Expo(?:nent)?PushToken\[[^\]\s]+\]$/.test(value.trim())
  );
}

export function chunk<T>(items: T[], size = MAX_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Sends a batch and reports what came back, per token.
 *
 * Never throws for a delivery problem: a push that fails must not take down the
 * request that triggered it. A network failure marks the whole batch failed and
 * leaves the tokens alone, because an unreachable Expo says nothing about
 * whether those devices still exist.
 */
export async function sendExpoPush(
  messages: PushMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<PushSendResult> {
  const result: PushSendResult = {
    accepted: [],
    deviceNotRegistered: [],
    failed: [],
  };
  if (messages.length === 0) return result;

  for (const batch of chunk(messages)) {
    let tickets: ExpoTicket[] = [];
    try {
      const res = await fetchImpl(EXPO_SEND_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        for (const m of batch) {
          result.failed.push({ token: m.to, error: `expo ${res.status}` });
        }
        continue;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      tickets = json.data ?? [];
    } catch (err) {
      const error = err instanceof Error ? err.message : "network";
      for (const m of batch) result.failed.push({ token: m.to, error });
      continue;
    }

    batch.forEach((message, i) => {
      const ticket = tickets[i];
      // A missing ticket is not a dead device: it is Expo answering oddly, and
      // guessing "dead" here would delete real subscribers.
      if (!ticket) {
        result.failed.push({ token: message.to, error: "no ticket" });
        return;
      }
      if (ticket.status === "ok") {
        result.accepted.push(message.to);
        return;
      }
      if (ticket.details?.error === "DeviceNotRegistered") {
        result.deviceNotRegistered.push(message.to);
        return;
      }
      result.failed.push({
        token: message.to,
        error: ticket.details?.error ?? ticket.message ?? "unknown",
      });
    });
  }

  return result;
}
