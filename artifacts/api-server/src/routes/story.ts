import { Router, type IRouter, type Request, type Response } from "express";
import { db, phrasesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  bookConcepts,
  conceptSpellings,
  isStoryTeaserBook,
  matchesConcept,
  storyBookFor,
  storyTeaserConcepts,
  STORY_TEASER_SCENES,
  type StoryBook,
} from "@workspace/story";
import { featuresForPlan } from "../lib/entitlements";
import { denyLockedFeature } from "../lib/gating";
import type { EntitledRequest } from "../middlewares/loadEntitlements";

/**
 * The storybook's corpus lookup, and the only server piece the game needs.
 *
 * WHAT THIS DOES NOT DO. It does not resolve scenes, order choices or walk the
 * graph: that is @workspace/story, which is pure and shared by web, mobile and
 * this route, so the three cannot drift. All this endpoint adds is the one
 * thing a pure library cannot have, which is the phrase corpus.
 *
 * ONE REQUEST PER BOOK, not one per scene. A five-scene book names about eleven
 * distinct concepts; fetching its whole vocabulary in a single query means every
 * scene after the first resolves from memory, and the client's `has` is simply
 * "did this concept come back".
 *
 * A CONCEPT THE LANGUAGE LACKS IS SIMPLY ABSENT from the response rather than
 * returned empty, which is what feeds resolveScene()'s null. Same contract as
 * traceStopFor() for an unauthored script: the caller skips the scene.
 */
const router: IRouter = Router();

type StoryPhrase = {
  concept: string;
  phraseId: number;
  nativeScript: string;
  romanized: string;
  english: string;
};

/**
 * Resolve a book's concepts into one language's phrases.
 *
 * PREMIUM ROWS ARE SERVED, and that is the whole reason the storybook is
 * All-Access. Measured against production 2026-08-23: of the 270 rows matching
 * the family book's concepts, 114 are premium, and counting free rows only NO
 * LANGUAGE carries all eleven concepts (the best is 8 of 11, Gujarati is 4). A
 * storybook restricted to free rows is therefore a two-scene book in every
 * language on earth, which is why All-Access with a one-scene taste was chosen
 * over a free game. The taste is enforced by which CONCEPTS are asked for, in
 * conceptsForCaller below, never by which rows are visible.
 *
 * ONE ROW PER CONCEPT, chosen deterministically: a language may carry the same
 * English twice (a free row and a premium one), and a book that showed a
 * different tumbler of water on each visit would make the learner's own book
 * unreproducible. Free first, then the lowest sort order, then the lowest id.
 */
async function loadConceptPhrases(
  languageCode: string,
  concepts: string[],
): Promise<StoryPhrase[]> {
  if (concepts.length === 0) return [];
  const spellings = [...new Set(concepts.flatMap((c) => conceptSpellings(c)))];

  const rows = await db
    .select({
      id: phrasesTable.id,
      nativeScript: phrasesTable.nativeScript,
      romanized: phrasesTable.romanized,
      english: phrasesTable.english,
      premium: phrasesTable.premium,
      sortOrder: phrasesTable.sortOrder,
    })
    .from(phrasesTable)
    .where(
      and(
        eq(phrasesTable.languageCode, languageCode),
        eq(phrasesTable.stage, "phrase"),
        inArray(sql`lower(btrim(${phrasesTable.english}))`, spellings),
      ),
    );

  const out: StoryPhrase[] = [];
  for (const concept of concepts) {
    const row = rows
      .filter((r) => matchesConcept(concept, r.english))
      .sort(
        (a, b) =>
          Number(a.premium) - Number(b.premium) ||
          a.sortOrder - b.sortOrder ||
          a.id - b.id,
      )[0];
    // Absent, never blank. The engine's null path depends on it.
    if (!row) continue;
    out.push({
      concept,
      phraseId: row.id,
      nativeScript: row.nativeScript,
      romanized: row.romanized,
      english: row.english,
    });
  }
  return out;
}

/**
 * Which concepts this caller may be served, and whether they were cut short.
 *
 * THE GATE IS A CONCEPT LIST, not a 402, for the book that carries the taste.
 * A Free learner asking for the journey 1 zone 1 book gets scene 1's concepts
 * and nothing else, so scenes 2 to 5 fail resolveScene() exactly as a language
 * with a thin corpus would, and the client shows the upgrade beat on a scene it
 * already knows how to skip. No second code path, and no 402 on a stop the map
 * deliberately never locks — that pairing is the bug the tracing taste was
 * created to fix.
 *
 * Every book outside zone 1 answers 402 outright: those stops are All-Access
 * with no taste at all.
 */
function conceptsForCaller(
  req: Request,
  res: Response,
  book: StoryBook,
): { concepts: string[]; limited: boolean } | null {
  const paid = featuresForPlan(
    (req as EntitledRequest).resolvedPlan.plan,
  ).storybook;
  if (paid) return { concepts: bookConcepts(book), limited: false };

  if (!isStoryTeaserBook(book)) {
    denyLockedFeature(
      req,
      res,
      "storybook",
      "The storybook is a Bolo! Plus feature. Upgrade to read the whole book.",
    );
    return null;
  }
  return { concepts: storyTeaserConcepts(book), limited: true };
}

// GET /games/story/book?lang=&journey=&zone=
// The book for one zone, with its vocabulary resolved into one language.
router.get(
  "/games/story/book",
  async (req: Request, res: Response): Promise<void> => {
    const lang = String(req.query.lang ?? "");
    const journey = Number(req.query.journey);
    const zone = Number(req.query.zone);

    if (lang.length < 2 || lang.length > 8) {
      res.status(400).json({ error: "Missing or invalid lang" });
      return;
    }
    if (!Number.isInteger(journey) || !Number.isInteger(zone)) {
      res.status(400).json({ error: "journey and zone must be integers" });
      return;
    }

    // No book in this zone is a 404 and not an error: most zones have none, and
    // journey 2 has none at all because four of its six categories hold zero
    // phrase rows in every language. The map asks about every zone it draws.
    const book = storyBookFor(journey, zone);
    if (!book) {
      res.status(404).json({ error: "No storybook in that zone" });
      return;
    }

    const allowed = conceptsForCaller(req, res, book);
    if (!allowed) return;

    const phrases = await loadConceptPhrases(lang, allowed.concepts);

    res.json({
      bookId: book.id,
      journey: book.journey,
      zone: book.zone,
      title: book.title,
      startId: book.startId,
      phrases,
      // What the client shows when a scene resolves to null: an upgrade beat
      // when the taste ran out, and nothing at all when the corpus is simply
      // short in this language. Those two look identical from the scene alone.
      limited: allowed.limited,
      teaserScenes: allowed.limited ? STORY_TEASER_SCENES : null,
    });
  },
);

export default router;
