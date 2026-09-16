/**
 * THE SHARE PICTURE: what goes into the one tall image a learner posts once a
 * book is finished, and in what order.
 *
 * Owner, 2026-09-16: "add a share button to share the story once its done as
 * an image file." The phone draws it with react-native-view-shot and the web
 * draws it on a canvas, and those two renderers share no code, so the CONTENT
 * is decided here or the two pictures disagree within a week.
 *
 * WHAT IT IS MADE OF, top to bottom: the book's title, the ending the read
 * earned (only where a book has ending art), then each outcome picture the
 * learner caused, in the order they caused it, with their line under it
 * (native script large, English small), and a footer with the product name and
 * the domain the app is served from.
 *
 * NO PERSONAL DATA, deliberately, and nothing here can carry any: the inputs
 * are the book, the ledger, the corpus lookup and a domain. No name, email or
 * account id reaches this function, so none can reach the picture.
 *
 * THE DOMAIN IS AN ARGUMENT, NEVER A CONSTANT. The phone reads
 * EXPO_PUBLIC_DOMAIN and the web reads window.location.host, so a fork that
 * copies this file prints its own address without editing it.
 */
import type { LedgerEntry } from "./types";
import { outcomeStillId, storyEnding, type StoryBook } from "./books";

/** The learner's line as the picture prints it. */
export type StoryShareLine = {
  nativeScript: string;
  english: string;
};

/** One picture on the share card, with the brief kept as alt text. */
export type StoryShareStill = {
  stillId: string;
  situation: string;
};

/**
 * One beat of the finished book. `still` is null where the choice has no
 * authored outcome or its picture failed to load; `line` is null where the
 * corpus did not come back with the phrase. A panel never has both null: one
 * with nothing to show is dropped, since an empty card reads as a broken book.
 */
export type StorySharePanel = {
  key: string;
  still: StoryShareStill | null;
  line: StoryShareLine | null;
};

export type StorySharePlan = {
  bookId: string;
  title: string;
  ending: StoryShareStill | null;
  panels: StorySharePanel[];
  footer: { brand: string; domain: string | null };
};

/** The product name on the footer. Bolo! everywhere, forks included. */
export const STORY_SHARE_BRAND = "Bolo!";

/** The button's words, on both platforms. */
export const STORY_SHARE_CTA = "Share your story";

/**
 * THE GEOMETRY BOTH RENDERERS DRAW TO, in output pixels. The web canvas uses
 * these directly; the phone lays a view out at the same proportions and lets
 * the device's pixel ratio bring it to about this width. Tall portrait, 1080
 * wide, because that is the width every share target keeps without resizing.
 */
export const STORY_SHARE_LAYOUT = {
  width: 1080,
  margin: 60,
  gap: 36,
  titleSize: 64,
  scriptSize: 52,
  englishSize: 34,
  footerBrandSize: 44,
  footerDomainSize: 30,
  radius: 28,
  /** Inside a panel's card, above and below its line. */
  cardPadV: 28,
  /** Inside a panel's card, either side of its line. */
  cardPadH: 32,
  /** Between the script and its English. */
  lineGap: 6,
  /** Every still is drawn 3:2, the shape they are generated at. */
  stillAspect: 2 / 3,
  background: "#f8f1e0",
  ink: "#2a2118",
  muted: "#6b5d4f",
  card: "#ffffff",
  accent: "#d8722a",
} as const;

/** Anything a host string might arrive as, down to a bare host, or null. */
export function storyShareDomain(raw: string | null | undefined): string | null {
  const host = (raw ?? "")
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/.*$/, "");
  return host === "" ? null : host;
}

/**
 * The share card's contents.
 *
 * `phraseFor` is the corpus lookup, passed in the same way the engine takes
 * `has`: the phrases live in a server response, not in this library.
 */
export function storySharePlan(
  book: StoryBook,
  entries: readonly LedgerEntry[],
  phraseFor: (concept: string) => StoryShareLine | null | undefined,
  domain: string | null | undefined,
): StorySharePlan {
  const ending = storyEnding(book, entries);
  const panels: StorySharePanel[] = [];
  entries.forEach((entry, i) => {
    const scene = book.scenes.find((s) => s.id === entry.sceneId);
    const choice = scene?.choices.find((c) => c.concept === entry.concept);
    const still: StoryShareStill | null = choice?.outcome
      ? {
          stillId: outcomeStillId(entry.sceneId, entry.concept),
          situation: choice.outcome.situation,
        }
      : null;
    const phrase = phraseFor(entry.concept);
    // A concept key such as "greeting_hello" is not a line anybody said, so a
    // phrase the corpus did not return prints nothing rather than the key.
    const line: StoryShareLine | null =
      phrase && phrase.nativeScript.trim() !== ""
        ? { nativeScript: phrase.nativeScript, english: phrase.english }
        : null;
    if (!still && !line) return;
    panels.push({ key: `${entry.sceneId}-${i}`, still, line });
  });
  return {
    bookId: book.id,
    title: book.title,
    ending: ending ? { stillId: ending.stillId, situation: ending.situation } : null,
    panels,
    footer: { brand: STORY_SHARE_BRAND, domain: storyShareDomain(domain) },
  };
}

/**
 * Every picture the plan asks for, in drawing order: what a renderer has to
 * wait on before it can capture.
 */
export function storyShareStillIds(plan: StorySharePlan): string[] {
  const ids: string[] = [];
  if (plan.ending) ids.push(plan.ending.stillId);
  for (const p of plan.panels) if (p.still) ids.push(p.still.stillId);
  return ids;
}

/**
 * The plan with every picture that did not load taken out. A failed still is
 * LEFT OUT, never drawn as a grey box, the rule the finished book on screen has
 * followed since 2026-09-16. A panel that loses its picture keeps its line; one
 * left with nothing is dropped.
 */
export function withoutMissingStills(
  plan: StorySharePlan,
  missing: ReadonlySet<string>,
): StorySharePlan {
  const ending = plan.ending && !missing.has(plan.ending.stillId) ? plan.ending : null;
  const panels: StorySharePanel[] = [];
  for (const p of plan.panels) {
    const still = p.still && !missing.has(p.still.stillId) ? p.still : null;
    if (!still && !p.line) continue;
    panels.push({ ...p, still });
  }
  return { ...plan, ending, panels };
}

/** The file name the picture is saved or shared under. */
export function storyShareFileName(plan: StorySharePlan): string {
  const slug = plan.bookId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `bolo-story-${slug || "book"}.png`;
}
