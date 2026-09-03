/**
 * THE SUPPORT INBOX, read and replied to from the Nest.
 *
 * WHY AN APP PASSWORD AND NOT OAUTH, recorded because it was a decision rather
 * than a default. Read-only OAuth (`gmail.readonly`) was recommended on
 * 2026-08-27 and was the safer half of the trade: scoped, revocable, unable to
 * send. The owner chose an app password over IMAP, and then asked for reply,
 * which is what makes that choice coherent: a read-only token could never have
 * replied. The cost is real and is written down rather than softened.
 *
 * WHAT THIS CREDENTIAL ACTUALLY IS. A Gmail app password grants FULL mailbox
 * access, read and write, and it BYPASSES 2FA by design. It is therefore less
 * protected than the way a human signs in, not equally protected. It lives in
 * Replit Secrets, in the same process that serves customer traffic, so any bug
 * that leaks environment variables leaks this.
 *
 * SO THE ONE CONTROL THAT MATTERS IS HERE, NOT IN THE CREDENTIAL:
 *
 *   A REPLY CAN ONLY GO TO THE SENDER OF A MESSAGE THAT IS ALREADY IN THIS
 *   MAILBOX. The client sends a uid and a body. It NEVER sends a recipient.
 *   The address is read off the stored message, server side.
 *
 * That is what stops this being an open relay if the route is ever reached by
 * somebody it should not be. An attacker who got through the owner gate could
 * annoy people who have already emailed support. They could not mail anybody
 * else, which is the difference between an incident and a catastrophe.
 *
 * A CONNECTION PER REQUEST, deliberately. A pooled IMAP connection in a web
 * process is a socket to babysit, a reconnect path to get wrong, and a thing
 * that holds credentials warm in memory between requests. Connecting costs
 * about a second, the list is cached, and the owner is one person: the simple
 * shape wins on every axis that matters here.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

const HOST_IMAP = "imap.gmail.com";
const HOST_SMTP = "smtp.gmail.com";

/** Bodies are truncated for display. The full thing is always in Gmail. */
const BODY_MAX = 20_000;
/** A reply this long is a document, and this is a support box, not a CMS. */
export const REPLY_MAX = 5_000;

export type SupportMessage = {
  uid: number;
  from: string;
  fromName: string | null;
  subject: string;
  date: string;
  /** First line or so, for the list. */
  snippet: string;
  unread: boolean;
};

export type SupportBody = SupportMessage & {
  body: string;
  truncated: boolean;
  /** Message-Id, needed to thread a reply. Null on a message that lacks one. */
  messageId: string | null;
};

export function supportConfigured(): boolean {
  return Boolean(process.env.LARKSUPPORT_USER && process.env.LARKSUPPORT_APP_PASSWORD);
}

function creds(): { user: string; pass: string } {
  const user = process.env.LARKSUPPORT_USER;
  const pass = process.env.LARKSUPPORT_APP_PASSWORD;
  if (!user || !pass) throw new Error("LARKSUPPORT_USER and LARKSUPPORT_APP_PASSWORD are not set");
  return { user, pass };
}

async function withMailbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const { user, pass } = creds();
  const client = new ImapFlow({
    host: HOST_IMAP,
    port: 993,
    secure: true,
    auth: { user, pass },
    // imapflow logs the whole IMAP conversation at info by default, which would
    // put message subjects and addresses into the application log.
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    // logout() is the polite close; if it throws the socket still has to go.
    await client.logout().catch(() => client.close());
  }
}

function addressOf(env: { from?: { address?: string; name?: string }[] } | undefined): {
  address: string;
  name: string | null;
} {
  const first = env?.from?.[0];
  return {
    address: first?.address ?? "",
    name: first?.name && first.name.length > 0 ? first.name : null,
  };
}

/** Newest first. */
export async function listSupport(limit = 25): Promise<SupportMessage[]> {
  const want = Math.min(100, Math.max(1, limit));
  return withMailbox(async (client) => {
    const total = client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0;
    if (!total) return [];
    const from = Math.max(1, total - want + 1);
    const out: SupportMessage[] = [];
    for await (const msg of client.fetch(`${from}:*`, {
      uid: true,
      envelope: true,
      flags: true,
    })) {
      const who = addressOf(msg.envelope);
      out.push({
        uid: msg.uid,
        from: who.address,
        fromName: who.name,
        subject: msg.envelope?.subject ?? "(no subject)",
        date: (msg.envelope?.date ?? new Date()).toISOString(),
        snippet: "",
        unread: !(msg.flags && msg.flags.has("\\Seen")),
      });
    }
    return out.reverse();
  });
}

/** One message, parsed. */
export async function readSupport(uid: number): Promise<SupportBody | null> {
  return withMailbox(async (client) => {
    const raw = await client.download(String(uid), undefined, { uid: true });
    if (!raw || !raw.content) return null;
    const parsed = await simpleParser(raw.content);
    const text = (parsed.text ?? "").trim();
    const who = {
      address: parsed.from?.value?.[0]?.address ?? "",
      name: parsed.from?.value?.[0]?.name || null,
    };
    return {
      uid,
      from: who.address,
      fromName: who.name,
      subject: parsed.subject ?? "(no subject)",
      date: (parsed.date ?? new Date()).toISOString(),
      snippet: text.slice(0, 160),
      unread: false,
      body: text.slice(0, BODY_MAX),
      truncated: text.length > BODY_MAX,
      messageId: parsed.messageId ?? null,
    };
  });
}

export type ReplyResult = { to: string; subject: string };

/**
 * The subject a reply should carry.
 *
 * PULLED OUT SO IT CAN BE TESTED. Everything else in this file needs a real
 * mailbox and therefore cannot be tested anywhere, which is exactly why the one
 * piece of judgement in it should not also be locked away behind IMAP.
 *
 * "Re:" IS NOT STACKED. A thread five replies deep reading "Re: Re: Re:" is the
 * mark of software nobody looked at, and some clients then truncate the actual
 * subject to make room for the prefixes.
 */
export function replySubject(original: string): string {
  const subject = original.trim() || "(no subject)";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

/** Why a reply is refused, or null if it is fine. Pure, so it is tested. */
export function replyRefusal(text: string): string | null {
  if (!text.trim()) return "A reply cannot be empty";
  if (text.length > REPLY_MAX) return `A reply is capped at ${REPLY_MAX} characters`;
  return null;
}

/**
 * Reply to one message. THE RECIPIENT IS NEVER TAKEN FROM THE CALLER: it is
 * read off the stored message, which is the whole security model of this file.
 */
export async function replySupport(uid: number, text: string): Promise<ReplyResult> {
  const refusal = replyRefusal(text);
  if (refusal) throw new Error(refusal);
  const body = text.trim();

  const original = await readSupport(uid);
  if (!original) throw new Error("That message is not in the inbox");
  if (!original.from) throw new Error("That message has no sender to reply to");

  const { user, pass } = creds();
  const transport = nodemailer.createTransport({
    host: HOST_SMTP,
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  const subject = replySubject(original.subject);

  await transport.sendMail({
    from: user,
    to: original.from,
    subject,
    text: body,
    // Threading. Without these the reply arrives as a new conversation, which
    // is confusing for the person who wrote in.
    inReplyTo: original.messageId ?? undefined,
    references: original.messageId ?? undefined,
  });

  return { to: original.from, subject };
}

// ---------------------------------------------------------------------------
// SOCIAL ALERTS. The owner, build 29: "I'm missing tiktok comments and
// instagram comments and DMs... i need a flashing alert, don't need to reply
// from there. i just need a link to go look."
//
// WHY THIS IS MAIL AND NOT AN API, because that decision is the whole design.
// The obvious build is the platform APIs, and for two of the three asks it
// cannot be built at all today:
//
//   Instagram comments   possible: Graph API, instagram_manage_comments,
//                        a Meta app, a linked professional account, App Review.
//   Instagram DMs        possible: Instagram Messaging API, App Review again.
//   TikTok comment text  gated behind business scopes that are not generally
//                        granted, and the public Display API returns COUNTS
//                        only, never a comment's words.
//   TikTok DMs           NO PUBLIC API EXISTS. Not gated, absent.
//
// So the API route is weeks of registration and review for partial coverage.
// But the ask is not "read my comments", it is "flash, and give me a link".
// A notification email is already exactly that signal, every platform sends
// one, and THIS PROCESS ALREADY HOLDS A MAILBOX CREDENTIAL AND AN IMAP
// CONNECTION. Nothing new is registered, nothing is reviewed, and TikTok DMs
// are covered by the only mechanism that can cover them.
//
// IT COUNTS, IT DOES NOT READ. No body is fetched and no snippet is stored:
// an envelope carries the sender, the subject and the date, which is all a
// count and a deep link need. The words of a stranger's DM never enter this
// server, which is a smaller blast radius than the support inbox already has.
//
// THE SUBJECT IS THE ONLY THING SEPARATING A DM FROM A COMMENT, because both
// arrive from the same Instagram sender. That is a heuristic on somebody
// else's copy and it will drift; when it does, the count lands in "Social"
// rather than in the wrong bucket, and nothing breaks. It is deliberately not
// clever: a wrong bucket on a notification is a rounding error, and the link
// goes to the platform either way.
// ---------------------------------------------------------------------------

export type SocialKind = "instagram-dm" | "instagram-comment" | "tiktok-comment" | "social-other";

/** One unseen envelope, for tuning the classifier against reality rather than
 *  against a guess about Meta's subject lines. Sender DOMAIN only, never the
 *  address, and the subject: that is what the buckets are keyed on. */
export type SocialSample = { domain: string; subject: string; date: string; kind: SocialKind | "ignored" };

/** How many samples ride along. Enough to see the shape, not a mail client. */
const SOCIAL_SAMPLE_MAX = 12;

export type SocialAlert = {
  kind: SocialKind;
  label: string;
  /** Unseen notification emails of this kind. The number that flashes. */
  unseen: number;
  /** ISO date of the newest, or null. Lets the page say "12 minutes ago". */
  newest: string | null;
  /** Where to go and look. The platform, never this page. */
  href: string;
};

/** Deep links, in the order the Nest shows them. Ordered by how fast the owner
 *  would want to answer: a DM is a person waiting, a comment is not. */
const SOCIAL_KINDS: { kind: SocialKind; label: string; href: string }[] = [
  { kind: "instagram-dm", label: "Instagram DMs", href: "https://www.instagram.com/direct/inbox/" },
  { kind: "instagram-comment", label: "Instagram comments", href: "https://www.instagram.com/notifications/" },
  { kind: "tiktok-comment", label: "TikTok comments", href: "https://www.tiktok.com/notifications" },
  { kind: "social-other", label: "Other social", href: "https://business.facebook.com/latest/inbox/" },
];

/** How far back an unseen notification still counts. A month-old unread
 *  notification is not an alert, it is a mailbox nobody tidied. */
const SOCIAL_WINDOW_DAYS = 30;

/**
 * THE FIRST PRODUCTION READ REWROTE THIS FUNCTION. Twenty-six unseen mails
 * matched the social senders and the newest twelve were: Instagram feed
 * digests ("See what kruti818 and 8 others shared"), TikTok marketing ("claim
 * your coupon before it expires!") and two login codes. Not one comment, not
 * one DM. The chip on the Nest flashed "New 26" for coupons.
 *
 * So this is an ALLOWLIST now. A subject has to be shaped like engagement to
 * count at all; anything else returns null and is ignored, not bucketed. A
 * miss shows as a zero, which the page already warns the owner to distrust.
 * A false positive flashes forever, which trains the owner to ignore the chip.
 *
 * The honest limit, learned the same way: Instagram only emails about
 * comments and DMs when "Feedback emails" is on in its notification settings,
 * and it batches and suppresses even those while the owner is active in the
 * app. TikTok sends almost no per-event email. This counter is therefore a
 * lagging signal for Instagram and close to no signal for TikTok, and the
 * reliable version of this feature is the platform APIs, not this mailbox.
 */
const ENGAGE_DM = /\b(sent you a message|new message|messaged you|message request|sent you a (photo|video|reel))\b/i;
const ENGAGE_COMMENT = /\b(commented on|left a comment|replied to your|reply to your|mentioned you|tagged you|new comment)\b/i;

function classify(from: string, subject: string): SocialKind | null {
  const f = from.toLowerCase();
  const instagram = f.endsWith("instagram.com") || f.includes(".instagram.com");
  const tiktok = f.endsWith("tiktok.com") || f.includes(".tiktok.com");
  const meta = f.includes("facebookmail.com") || f.endsWith("facebook.com");
  if (!instagram && !tiktok && !meta) return null;
  if (ENGAGE_DM.test(subject)) return instagram ? "instagram-dm" : "social-other";
  if (ENGAGE_COMMENT.test(subject)) {
    if (instagram) return "instagram-comment";
    if (tiktok) return "tiktok-comment";
    return "social-other";
  }
  return null;
}

/**
 * Unseen social notifications, bucketed. Envelopes only.
 *
 * Returns every bucket including the empty ones, on purpose: a row reading
 * "TikTok comments 0" is information (the pipe is working and nobody
 * commented), and a row that vanishes at zero is indistinguishable from a
 * broken watcher. This page has been bitten by exactly that shape before.
 */
export async function countSocial(): Promise<{ alerts: SocialAlert[]; samples: SocialSample[]; ignored: number }> {
  const since = new Date(Date.now() - SOCIAL_WINDOW_DAYS * 86400000);
  const tally = new Map<SocialKind, { n: number; newest: number | null }>();
  for (const k of SOCIAL_KINDS) tally.set(k.kind, { n: 0, newest: null });
  const seen: SocialSample[] = [];
  let ignored = 0;

  await withMailbox(async (client) => {
    const uids = (await client.search({ seen: false, since }, { uid: true })) || [];
    if (!uids.length) return;
    for await (const msg of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
      const who = addressOf(msg.envelope);
      const subject = msg.envelope?.subject ?? "";
      const domain = who.address.split("@").pop() ?? "";
      const t = (msg.envelope?.date ?? new Date()).getTime();
      const kind = classify(who.address, subject);
      // Every social-sender envelope is sampled, ignored ones included, so the
      // owner can see what was dropped and why. Non-social senders are not
      // social mail at all and are not sampled.
      const social = /instagram\.com$|tiktok\.com$|facebookmail\.com$|facebook\.com$/i.test(domain);
      if (!kind) {
        if (social) {
          ignored += 1;
          seen.push({ domain, subject, date: new Date(t).toISOString(), kind: "ignored" });
        }
        continue;
      }
      const slot = tally.get(kind);
      if (!slot) continue;
      slot.n += 1;
      if (slot.newest === null || t > slot.newest) slot.newest = t;
      seen.push({ domain, subject, date: new Date(t).toISOString(), kind });
    }
  });

  // SORT, THEN CAP. The first version capped at twelve in fetch order, which
  // is oldest first, and then sorted those: it showed the twelve OLDEST while
  // the comment claimed newest.
  seen.sort((a, b) => (a.date < b.date ? 1 : -1));
  const samples = seen.slice(0, SOCIAL_SAMPLE_MAX);
  const alerts = SOCIAL_KINDS.map((k) => {
    const slot = tally.get(k.kind);
    return {
      kind: k.kind,
      label: k.label,
      href: k.href,
      unseen: slot?.n ?? 0,
      newest: slot?.newest ? new Date(slot.newest).toISOString() : null,
    };
  });
  return { alerts, samples, ignored };
}
