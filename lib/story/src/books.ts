import { conceptSpellings } from "./concepts";
import {
  CHAI_SCENES,
  CHAI_START_ID,
  COURTYARD_SCENES,
  COURTYARD_START_ID,
  FAMILY_SCENES,
  FAMILY_START_ID,
  GREETINGS_SCENES,
  GREETINGS_START_ID,
  PHOTOGRAPH_SCENES,
  PHOTOGRAPH_START_ID,
  THALI_SCENES,
  THALI_START_ID,
} from "./scenes";
import type { Scene } from "./types";

/**
 * A book is a scene graph pinned to one fare zone.
 *
 * ONE STORY STOP PER ZONE, confirmed by the owner 2026-08-23, which is the same
 * shape the tracing stop already has and the reason this registry exists at
 * all: the engine took a bare array of scenes, and a bare array cannot say
 * which zone it belongs in. Keyed on journey and zone exactly like
 * TRACE_STOP_LADDER, so both clients place a story stop the same way and a new
 * book is a data entry rather than a client change.
 */
export type StoryBook = {
  id: string;
  journey: number;
  /** 1-based within its journey, matching JOURNEY_ZONES order. */
  zone: number;
  /** Shown on the journey map and at the top of the book. */
  title: string;
  scenes: readonly Scene[];
  startId: string;
};

/**
 * The books that exist, and WHY THERE ARE ONLY TWO.
 *
 * A story stop needs concepts every language in it can resolve, and the corpus
 * supplies far fewer of those than the curriculum suggests. Measured against
 * production 2026-08-23, counting distinct English concepts per zone by how
 * many of the twenty-two languages carry them:
 *
 *   zone            all 22   >= 20   rows      verdict
 *   greetings          4       5     1796      book authored from the 8 universals
 *   family             4      11     1787      book authored (STARTER_SCENES)
 *   numbers           20      20     1347      authorable, 20 universal concepts
 *   food               3       5     1787      authorable, thin
 *   everyday           3       5     1787      authorable, overlaps greetings
 *   feelings           0       0     1787      NOT authorable in all 22
 *   time               0       0       32      no corpus
 *   shopping           0       0       16      no corpus
 *   travel/work/       -       -        0      NO PHRASES AT ALL
 *   health/festivals
 *
 * So journey 2 carries no books because four of its six zones hold zero phrase
 * rows in every language and the other two hold a handful in one or two. That
 * is not a story problem, it is an empty curriculum, and the map already knows:
 * journeyIsReady() gates journey 2 on those categories carrying phrases.
 *
 * Feelings is the one journey 1 zone that cannot have a universal book: zero of
 * its concepts reach even twenty languages. A feelings book would run in about
 * half of them and return null in the rest, which is allowed but is a decision
 * to take deliberately rather than by authoring one and seeing what happens.
 *
 * An absent book behaves exactly like an unauthored tracing chapter: null, and
 * the zone simply has no story stop.
 */
export const STORY_BOOKS: readonly StoryBook[] = [
  {
    id: "j1z1-greetings",
    journey: 1,
    zone: 1,
    title: "A visit next door",
    scenes: GREETINGS_SCENES,
    startId: GREETINGS_START_ID,
  },
  {
    id: "j1z2-family",
    journey: 1,
    zone: 2,
    title: "At the family table",
    scenes: FAMILY_SCENES,
    startId: FAMILY_START_ID,
  },
  {
    id: "j1z3-chai",
    journey: 1,
    zone: 3,
    title: "The chai stall",
    scenes: CHAI_SCENES,
    startId: CHAI_START_ID,
  },
  {
    id: "j1z4-thali",
    journey: 1,
    zone: 4,
    title: "The thali",
    scenes: THALI_SCENES,
    startId: THALI_START_ID,
  },
  {
    id: "j1z5-courtyard",
    journey: 1,
    zone: 5,
    title: "The courtyard",
    scenes: COURTYARD_SCENES,
    startId: COURTYARD_START_ID,
  },
  {
    id: "j1z6-photograph",
    journey: 1,
    zone: 6,
    title: "The photograph",
    scenes: PHOTOGRAPH_SCENES,
    startId: PHOTOGRAPH_START_ID,
  },
];

/** The book for one zone, or null when that zone has none. */
export function storyBookFor(journey: number, zone: number): StoryBook | null {
  return (
    STORY_BOOKS.find((b) => b.journey === journey && b.zone === zone) ?? null
  );
}

/** A book by id, which is how the server validates a request. */
export function storyBookById(id: string): StoryBook | null {
  return STORY_BOOKS.find((b) => b.id === id) ?? null;
}

/**
 * Every concept a book names, deduplicated, in scene then choice order.
 *
 * This is the ONE request per session the corpus lookup makes. A book of five
 * scenes names fifteen choices and about eleven distinct concepts, so fetching
 * the book's whole vocabulary costs one query and every scene resolves from
 * memory afterwards.
 */
export function bookConcepts(book: StoryBook): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const scene of book.scenes) {
    for (const choice of scene.choices) {
      const key = choice.concept.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(choice.concept);
    }
  }
  return out;
}

/** Every English spelling a book's lookup must accept. See concepts.ts. */
export function bookConceptSpellings(book: StoryBook): string[] {
  const out = new Set<string>();
  for (const concept of bookConcepts(book)) {
    for (const spelling of conceptSpellings(concept)) out.add(spelling);
  }
  return [...out];
}

/**
 * How many scenes of a book any learner may play, whatever they pay.
 *
 * THE WHOLE OF THE TASTE BOOK, raised from 1 on 2026-08-24 because one scene
 * was not selling anything. The owner's words: "the free taste is too small for
 * this."
 *
 * WHY ONE SCENE WAS THE WRONG SIZE, and it is not simply that it was mean. The
 * product being sold is not a picture and three lines, it is that YOUR CHOICES
 * BECOME A BOOK YOU KEEP. That is the ledger, and a ledger with one entry in it
 * demonstrates nothing: the learner never reaches the finished book, so the one
 * screen that shows what All-Access is for is the one screen a free learner
 * could never see. A taste that stops before the point has been made is a
 * smaller ask, not a cheaper one.
 *
 * WHAT STILL GATES. `isStoryTeaserBook` restricts this to journey 1 zone 1, so
 * five of the six books remain closed. This mirrors the tracing taste, which
 * gives the whole of zone 1's first characters rather than a fragment of one.
 *
 * THE CONSEQUENCE, and it must be paid or this change gives the book away: a
 * free learner now REACHES the finished book instead of hitting STORY_TEASER_END
 * mid-story, so the upsell had to move to that screen too. `TheBook` takes a
 * `limited` flag for exactly this. If the two ever drift apart, zone 1 becomes
 * free with no ask attached.
 *
 * Deliberately NOT the same number as TRACE_TEASER_LIMIT, which counts
 * characters. A scene is the unit here because a half-served scene shows two of
 * its three lines, which reads as broken rather than short.
 */
export const STORY_TEASER_SCENES = 5;

/** The scenes of a book any learner may play. Only ever from the taste book. */
export function storyTeaserScenes(book: StoryBook): readonly Scene[] {
  if (!isStoryTeaserBook(book)) return [];
  return book.scenes.slice(0, STORY_TEASER_SCENES);
}

/**
 * Whether this book is the free taste.
 *
 * Journey 1 zone 1 only, matching the tracing taste exactly. Every later zone
 * is All-Access.
 */
export function isStoryTeaserBook(book: StoryBook): boolean {
  return book.journey === 1 && book.zone === 1;
}

/** The concepts a non-paying caller may be served for a book. */
export function storyTeaserConcepts(book: StoryBook): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const scene of storyTeaserScenes(book)) {
    for (const choice of scene.choices) {
      const key = choice.concept.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(choice.concept);
    }
  }
  return out;
}

/**
 * Where the story stop sits among a zone's rows, 0-based.
 *
 * IMMEDIATELY AFTER THE TRACING STOP, which is the owner's instruction on
 * 2026-08-23 and is about the free taste rather than about pacing: a Free
 * learner opens exactly one phrase stop before the paywall, so zone 1 reads
 *
 *   stop 1   the free phrase stop (the position-1 Greetings group)
 *   stop 2   the tracing stop, first 3 characters free
 *   stop 3   the story stop, first scene free
 *
 * and the three free things sit together at the top of the map where they will
 * actually be met. Parked mid-zone instead, the taste sits behind a wall of
 * locks that nobody scrolls past, which is the same reasoning that pinned the
 * tracing stop to stop 2 in the first place.
 *
 * `traceIndex` is where the tracing row was spliced, or null when this language
 * or zone has no tracing stop (an unauthored script, an empty zone). Without a
 * tracing stop the story stop TAKES ITS PLACE rather than sliding to stop 2 of
 * nothing, so the taste stays reachable either way.
 *
 * COUNTED AGAINST THE ARRAY THAT ALREADY HOLDS THE TRACING ROW. Both clients
 * splice trace first and story second, and both must call this rather than each
 * choosing a position, or the web and the phone will disagree about which stop
 * a learner is on. That is not hypothetical: it is exactly the rule written on
 * traceStopIndexIn, for the same reason.
 */
export function storyStopIndexIn(
  rowCount: number,
  journey: number,
  zone: number,
  traceIndex: number | null,
): number {
  const n = Math.max(0, rowCount);
  if (n === 0) return 0;
  if (traceIndex !== null) {
    // Straight after the tracing row, and never past the end of the run.
    return Math.min(traceIndex + 1, n);
  }
  // No tracing stop here. Zone 1 keeps the taste at the top; every other zone
  // takes the mid-zone break the tracing stop would have had.
  if (journey === 1 && zone === 1) return Math.min(1, n);
  return Math.max(1, Math.floor(n / 2));
}

/**
 * The beat at the end of the free taste.
 *
 * IT LIVES HERE, not in either client, because web and mobile are
 * hand-maintained twins and a string defined in one of them becomes two
 * different strings within a week. Same reason the engine itself is a library.
 *
 * Shown when a scene resolves to null AND the response came back `limited`.
 * Those two conditions together are the only honest reading of "the taste ran
 * out": a scene can also resolve to null because the language's corpus is thin,
 * and offering to sell somebody a book that does not exist in their language
 * would be the worse of the two mistakes.
 *
 * "All-Access", never "Plus", which is the copy canon the games hub already
 * enforces on its badges.
 */
export const STORY_TEASER_END = {
  title: "Your story isn't finished",
  body: "You have read the first page. All-Access opens the rest of this book, and every book on the map.",
  cta: "Subscribe to continue",
} as const;


/**
 * The upsell on a FINISHED taste book, which is a different moment from
 * STORY_TEASER_END and needs different words.
 *
 * TEASER_END interrupts: the learner wanted more and was stopped. This one
 * congratulates: they finished, their book is in front of them, and the ask is
 * "again, five more times". Reusing the interrupting copy here would tell
 * somebody who just completed a story that their story is not finished, which
 * is both wrong and slightly insulting.
 *
 * Lives beside its sibling and in the shared library for the same reason: web
 * and mobile are hand-maintained twins.
 */
export const STORY_TASTE_BOOK_DONE = {
  title: "That is one book of six",
  body: "One for every zone on the map. All-Access opens the other five, and keeps every book you write.",
  cta: "Open the rest",
} as const;


/**
 * The asset id for a scene's setup still.
 *
 * ONE DEFINITION, used by the generator that writes the file and by both
 * clients that read it. A second copy of this rule is how the phone ends up
 * requesting an image the web app named differently.
 */
export function setupStillId(sceneId: string): string {
  return sceneId;
}

/**
 * The asset id for the still shown after a particular line is chosen.
 *
 * Keyed on the scene AND the concept, because the same concept appears in
 * several scenes of a book and its consequence differs in each: saying "water"
 * to a raised jug is a different picture from saying it to a closed door.
 *
 * The concept is slugged rather than used raw: concepts are display text and
 * include spaces and question marks ("good morning", "how are you?"), none of
 * which belong in a filename.
 */
export function outcomeStillId(sceneId: string, concept: string): string {
  const slug = concept
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${sceneId}--${slug}`;
}
