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
