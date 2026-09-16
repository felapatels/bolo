import { hasJourneyStopUnlock } from "../lib/journeyStopUnlock";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, phrasesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  bookConcepts,
  matchesConcept,
  storyBookFor,
  STORY_ONLY_LINES,
  STORY_TEASER_SCENES,
  withStoryOnlyLines,
  type StoryBook,
  type StoryOnlyLines,
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
  storyOnlyLines: StoryOnlyLines,
): Promise<StoryPhrase[]> {
  if (concepts.length === 0) return [];

  // NO SQL PREFILTER ON THE SPELLINGS, since 2026-09-15, and dropping it is the
  // half of the alias work that reaches production.
  //
  // This used to add `inArray(lower(btrim(english)), conceptSpellings(...))`,
  // which can only find a row whose English is EXACTLY one of a finite list.
  // matchesConcept now also accepts the shapes the seed content really writes
  // ("Sorry, excuse me", "Rice, and also a meal", "a spoon", "sorry (polite)"),
  // and no finite list derives those from the concept. Left in place, the
  // prefilter would have thrown those rows away before matchesConcept ever saw
  // them and the whole change would have been a no-op against a database.
  //
  // The cost is reading one language's phrase stage instead of a handful of
  // rows: India's production carries 10,339 phrases across 22 languages, so
  // this is a few hundred rows, once per book open, already indexed by the
  // language filter. matchesConcept is now the ONE definition of a match,
  // which is what the comment on it has always claimed.
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

  // STORYBOOK-ONLY LINES FILL WHAT THE CORPUS COULD NOT, since 2026-09-16
  // (owner ruling: a storybook-only word list, never new lesson rows, because
  // India's journey 1 topics must hold exactly 40 rows or boot exits).
  //
  // AFTER the database, never instead of it: withStoryOnlyLines only looks at a
  // concept `out` has no entry for, so a real phrase row always wins, and the
  // day a lesson row lands the story switches to it on its own.
  //
  // A line served from the list carries a NEGATIVE phraseId, stable per
  // (language, concept), because the contract requires an integer and a real
  // serial id is always positive. Negative means story-only; see
  // lib/story/src/storyOnly.ts before sending a story phraseId anywhere.
  return withStoryOnlyLines(languageCode, concepts, out, storyOnlyLines);
}

/** Zone 1 is free; later books require All-Access or permanent Chai ownership. */
async function conceptsForCaller(
  req: Request,
  res: Response,
  book: StoryBook,
  languageCode: string,
): Promise<{ concepts: string[]; limited: boolean } | null> {
  const paid = featuresForPlan(
    (req as EntitledRequest).resolvedPlan.plan,
  ).storybook;
  if (paid || (book.journey === 1 && book.zone === 1) || await hasJourneyStopUnlock((req as EntitledRequest).userId, { kind: "story", languageCode, journey: book.journey, zone: book.zone })) return { concepts: bookConcepts(book), limited: false };

  denyLockedFeature(
    req, res, "storybook",
    "Open this storybook with Chai or subscribe to All-Access.",
  );
  return null;
}

/**
 * The router, over a given storybook-only word list.
 *
 * A FACTORY SO THE MERGE CAN BE TESTED AGAINST A REAL DATABASE without a module
 * mock: story.book.test.ts seeds a synthetic language and hands in a list for
 * it. Production uses the default export below, over STORY_ONLY_LINES.
 */
export function createStoryRouter(storyOnlyLines: StoryOnlyLines): IRouter {
  const router: IRouter = Router();

  // GET /games/story/book?lang=&journey=&zone=
  // The book for one zone, with its vocabulary resolved into one language.
  router.get(
    "/games/story/book",
    async (req: Request, res: Response): Promise<void> => {
      const lang = String(req.query.lang ?? "");
      const journey = Number(req.query.journey);
      const zone = Number(req.query.zone);

      // THE UPPER BOUND IS 64, NOT 8, AND THAT IS NOT ARBITRARY. This is the
      // only endpoint in the API that caps the code's length at all, and the 8
      // it shipped with in a64c2822 rejected the suite's own language
      // sentinels: every api test names its language `__test_lang_<suite>`,
      // which is 17 characters in story.book.test.ts, so that file could never
      // have passed. The convention is load-bearing rather than incidental,
      // and routes/languages.ts filters the public picker on that exact prefix
      // so a crashed run cannot show a test language to a learner. 64 still
      // keeps a runaway query string out of the phrase lookup, which is all
      // the cap was ever for.
      if (lang.length < 2 || lang.length > 64) {
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

      const allowed = await conceptsForCaller(req, res, book, lang);
      if (!allowed) return;

      const phrases = await loadConceptPhrases(lang, allowed.concepts, storyOnlyLines);

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

  return router;
}

export default createStoryRouter(STORY_ONLY_LINES);
