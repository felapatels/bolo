// The storybook AS RENDERED. The engine has 45 tests and none of them render
// anything, which is the shape of every expensive mistake in this repo: the
// writing demo shipped visibly wrong through two store builds and a green
// suite, because nothing drew it.
//
// Pins, each one a thing that would be silent if it broke:
// (1) the scene's picture area carries the situation and nothing prints
//     "undefined";
// (2) the three lines show native script and its reading, and NO English
//     before the pick, because the meaning IS the answer;
// (3) every choice advances, including one that does not fit, and nothing is
//     ever marked wrong;
// (4) the end of the free taste shows the story-unfinished beat and a route to
//     /upgrade, never a blank scene;
// (5) a language whose corpus is short gets NO upgrade offer, because there is
//     nothing there to sell them;
// (6) the finished book lists what the learner said, in order.
//
// REWRITTEN IN PART ON 2026-09-15, when the owner removed the page between a
// pick and the next beat off a TestFlight build: "after you make a selection,
// you don't need the one screen in the middle... there is an additional screen
// in between that's useless." Every pin that recorded that page is INVERTED
// rather than deleted, and each says so where it stands: a pick now turns the
// page itself, so there is no Next button and no outcome frame, and the
// consequence rides beside the carried YOU SAID line instead.
//
// AND AGAIN ON 2026-09-16, the mad-lib ruling (owner: "it seems boring"). A
// pick now shows its outcome still FULL SIZE in the frame for a timed beat,
// and the page turns by itself when the beat ends or the picture is tapped.
// Still no Next button. The pins that said the page turns in the same tick are
// INVERTED where they stand, dated; most tests reach the next page through
// `pick` below, which taps the punchline to end the beat early.
import { describe, test, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const h = vi.hoisted(() => ({
  phrases: [] as Array<{
    concept: string;
    phraseId: number;
    nativeScript: string;
    romanized: string;
    english: string;
  }>,
  limited: false,
  isLoading: false,
  narrated: [] as string[],
}));

// Chrome, not the subject: BottomNav pulls in the language picker, which pulls
// in Clerk. Mocked out in every other game-page suite for the same reason.
vi.mock("@/components/layout/bottom-nav", () => ({ BottomNav: () => null }));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({
    languages: [{ code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" }],
    activeLang: "gu",
    activeLanguage: { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    setActiveLang: vi.fn(),
    isLoading: false,
  }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  nativeTextProps: () => ({ style: {}, dir: "ltr" as const }),
}));

// THE SHARE PICTURE'S DRAWING, mocked at the module (2026-09-16). jsdom has no
// canvas, and what goes INTO the picture is storySharePlan's answer, pinned in
// story-share.test.ts. What this page owns is handing that plan over, the busy
// state, and not throwing when the drawing fails.
const share = vi.hoisted(() => ({
  compose: vi.fn(),
  share: vi.fn(),
}));
vi.mock("@/lib/story-share-image", () => ({
  composeStoryShareImage: share.compose,
  shareStoryImage: share.share,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  // Records what the narrator was ASKED to say. The assertions below are about
  // whether a request happens at all, not about audio, so a spy at the mutation
  // is the right altitude: jsdom has no HTMLMediaElement.play and mocking one
  // would test the mock.
  useNarrateStoryLine: () => ({
    mutateAsync: vi.fn(async ({ data }: { data: { text: string } }) => {
      h.narrated.push(data.text);
      return { audioBase64: "", format: "mp3" };
    }),
  }),
  useGetStoryBook: () => ({
    data: h.isLoading
      ? undefined
      : {
          bookId: "j1z1-greetings",
          journey: 1,
          zone: 1,
          title: "A visit next door",
          startId: "door-1",
          phrases: h.phrases,
          limited: h.limited,
          teaserScenes: h.limited ? 1 : null,
        },
    isLoading: h.isLoading,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import Storybook from "@/pages/games/storybook";
import {
  storySharePlan,
  STORY_SHARE_CTA,
  storyBookFor,
  bookConcepts,
  outcomeStillId,
  STORY_PUNCHLINE_MS,
  STORY_TEASER_END,
  STORY_TASTE_BOOK_DONE,
} from "@workspace/story";

const BOOK = storyBookFor(1, 1)!;

/** A phrase row for every concept named, the way the server would send them. */
function serve(concepts: string[]) {
  h.phrases = concepts.map((concept, i) => ({
    concept,
    phraseId: i + 1,
    nativeScript: `native:${concept}`,
    romanized: `roman:${concept}`,
    english: `english:${concept}`,
  }));
}

/**
 * What the scene frame is currently showing, read off the image's ALT.
 *
 * The frame renders a picture now, not the situation sentence in a card, so
 * text-content assertions moved here rather than being dropped. Alt is the
 * right anchor twice over: it is the same brief the illustrator worked from,
 * and it is what a screen reader announces, so pinning it pins the
 * accessibility of the one element carrying the whole game.
 */
function sceneAlt(testId = "story-scene"): string {
  const frame = screen.getByTestId(testId);
  const img = frame.querySelector("img");
  return img?.getAttribute("alt") ?? frame.textContent ?? "";
}

/**
 * What the carried YOU SAID line is showing, consequence included.
 *
 * WHERE THE OUTCOME WENT when its page was removed on 2026-09-15. The still is
 * still a picture with the consequence brief as its alt, which is the only form
 * the joke takes for a screen reader, so alt is the right anchor here for the
 * same two reasons sceneAlt gives.
 */
function saidOutcomeAlt(): string {
  // 2026-09-16: the consequence left the YOU SAID line for the frame itself,
  // so this reads the punchline, which is where the joke now is. Name kept so
  // the history above still points at something.
  const still = screen.getByTestId("story-punchline").querySelector("img");
  return still?.getAttribute("alt") ?? "";
}

/**
 * Answer the board and end the punchline beat at once, by tapping the picture.
 *
 * SINCE 2026-09-16 A PICK IS TWO MOMENTS, and neither is a button press on
 * anything but the line: the outcome takes the frame for STORY_PUNCHLINE_MS,
 * then the page turns. Waiting out the timer in every test would add seconds
 * each; the tap is the learner's own early way out and is pinned on its own
 * below, as is the timer.
 */
function pick(concept: string): void {
  fireEvent.click(screen.getByTestId(`story-choice-${concept}`));
  const beat = screen.queryByTestId("story-punchline");
  if (beat) fireEvent.click(beat);
}

/**
 * Let the voice queue drain.
 *
 * NARRATION IS ASYNC NOW, and that is part of the same change. A pick turns the
 * page in one tick, so the learner's spoken line and the next beat's narration
 * are both asked for at once and both end at the one audio element; they are
 * chained so the line is not cut off mid-word. A chain is promises, so a
 * narration that used to be recorded synchronously is recorded a turn later.
 * This waits for that turn rather than for a particular value, so a test
 * asserting NOTHING was narrated still fails if something was.
 */
async function drainVoices(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderPage() {
  const { hook } = memoryLocation({ path: "/games/storybook", record: true });
  // BottomNav renders XpCounter, which reads the query client directly rather
  // than through a generated hook, so the mock above cannot stand in for it.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    (
      <QueryClientProvider client={client}>
        <Router hook={hook}>{(<Storybook />) as ReactElement}</Router>
      </QueryClientProvider>
    ) as ReactElement,
  );
}

beforeEach(() => {
  localStorage.clear();
  h.isLoading = false;
  h.limited = false;
  serve(bookConcepts(BOOK));
});

describe("the scene", () => {
  test("shows the situation and never prints undefined", () => {
    renderPage();
    expect(sceneAlt()).toBe(BOOK.scenes[0]!.situation);
    expect(document.body.textContent).not.toMatch(/undefined/i);
  });

  test("shows three lines, in script with their reading", () => {
    renderPage();
    for (const choice of BOOK.scenes[0]!.choices) {
      const card = screen.getByTestId(`story-choice-${choice.concept}`);
      expect(card).toHaveTextContent(`native:${choice.concept}`);
      expect(card).toHaveTextContent(`roman:${choice.concept}`);
    }
  });

  test("shows NO English before the pick", () => {
    // The meaning is the answer. Printing it up front turns reading the picture
    // into a matching exercise, which is a different and much easier game.
    renderPage();
    for (const choice of BOOK.scenes[0]!.choices) {
      expect(
        screen.getByTestId(`story-choice-${choice.concept}`),
      ).not.toHaveTextContent(`english:${choice.concept}`);
    }
  });

  test("reveals the meaning of the line that was picked, and only that one", () => {
    // INVERTED 2026-09-15. The reveal used to appear ON the chosen card, which
    // worked while a pick held the page still. A pick turns the page now
    // (owner: "there is an additional screen in between that's useless"), so
    // that card is unmounted before anybody could read it. The reveal was real
    // content, so it MOVED rather than went: it is on the carried YOU SAID
    // line, beside the picture of what saying it caused.
    renderPage();
    const [first, second] = BOOK.scenes[0]!.choices;
    fireEvent.click(screen.getByTestId(`story-choice-${first!.concept}`));

    const said = screen.getByTestId("story-said");
    expect(said).toHaveTextContent(`english:${first!.concept}`);
    // And only that one: the line not taken is not glossed anywhere on screen.
    expect(document.body.textContent).not.toContain(`english:${second!.concept}`);
  });
});

describe("every choice advances", () => {
  test("a line that does not fit is never marked wrong", () => {
    renderPage();
    const misfit = BOOK.scenes[0]!.choices.find((c) => !c.fits)!;
    fireEvent.click(screen.getByTestId(`story-choice-${misfit.concept}`));
    // Not a quiz. No buzzer, no red, no "incorrect" anywhere on the page.
    expect(document.body.textContent).not.toMatch(/incorrect|wrong|try again/i);
    // INVERTED 2026-09-15. This used to assert the Next button had appeared,
    // which was how it proved a misfitting line does not stop the story. The
    // owner removed the beat Next existed to leave ("there is an additional
    // screen in between that's useless"), so the proof is now the stronger
    // one: the story moves on with no second press on any button.
    //
    // INVERTED AGAIN 2026-09-16 (mad-lib ruling, "it seems boring"): the move
    // on waits for the punchline beat to end, which a tap on the picture does
    // early. Still no Next button, before or after.
    expect(screen.queryByTestId("story-next")).toBeNull();
    fireEvent.click(screen.getByTestId("story-punchline"));
    expect(screen.queryByTestId("story-next")).toBeNull();
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
  });

  test("a misfitting line turns the page BY ITSELF once its punchline beat ends", async () => {
    // INVERTED 2026-09-16. This was "on the FIRST press": one click, one page,
    // in the same tick, since 2026-09-15. The mad-lib ruling (owner: "it seems
    // boring") put the outcome picture in the frame first, so the page now
    // turns when the beat's timer runs out. What has NOT changed is the half
    // that mattered: nothing else is pressed. Real timers, because the frame
    // animates through framer-motion and fake timers would be testing that.
    renderPage();
    const misfit = BOOK.scenes[0]!.choices.find((c) => !c.fits)!;
    fireEvent.click(screen.getByTestId(`story-choice-${misfit.concept}`));
    expect(screen.getByTestId("story-punchline")).toBeInTheDocument();
    // The page under the punchline is still the scene just answered.
    expect(sceneAlt()).toBe(BOOK.scenes[0]!.situation);
    await waitFor(
      () => expect(screen.queryByTestId("story-punchline")).toBeNull(),
      { timeout: STORY_PUNCHLINE_MS + 1500 },
    );
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
  }, STORY_PUNCHLINE_MS + 5000);

  test("the punchline takes the WHOLE frame, and a tap on it skips the beat", () => {
    // Added 2026-09-16. The thumbnail beside YOU SAID was a joke told too small
    // to land; the owner's ruling is that the picture has the screen.
    renderPage();
    const misfit = BOOK.scenes[0]!.choices.find((c) => !c.fits)!;
    fireEvent.click(screen.getByTestId(`story-choice-${misfit.concept}`));
    const beat = screen.getByTestId("story-punchline");
    // Inside the same box as the page, covering it, not in the column below.
    expect(beat.parentElement).toContainElement(screen.getByTestId("story-scene"));
    expect(beat.className).toMatch(/\binset-0\b/);
    // INVERTED 2026-09-16: stills moved from story/ to story/madlib/ (STORY_ART_DIR in
    // lib/story), so installed builds keep the old art beside their old words.
    expect(beat.querySelector("img")?.getAttribute("src")).toContain(
      `story/madlib/${BOOK.scenes[0]!.id}--`,
    );
    fireEvent.click(beat);
    expect(screen.queryByTestId("story-punchline")).toBeNull();
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
  });

  test("the lines cannot be answered again while the punchline is up", () => {
    renderPage();
    const [first, second] = BOOK.scenes[0]!.choices;
    fireEvent.click(screen.getByTestId(`story-choice-${first!.concept}`));
    const other = screen.getByTestId(`story-choice-${second!.concept}`);
    expect(other).toBeDisabled();
    fireEvent.click(other);
    // Still the first line's punchline, and still one line in the book: a
    // second tap would have answered the same scene twice.
    expect(saidOutcomeAlt()).toBe(first!.outcome!.situation);
    expect(screen.getByTestId("story-said")).toHaveTextContent(`native:${first!.concept}`);
    expect(screen.getByTestId("story-said")).not.toHaveTextContent(`native:${second!.concept}`);
  });

  test("a punchline still that was never drawn leaves its brief, not a grey hole", () => {
    renderPage();
    const misfit = BOOK.scenes[0]!.choices.find((c) => !c.fits)!;
    fireEvent.click(screen.getByTestId(`story-choice-${misfit.concept}`));
    const beat = screen.getByTestId("story-punchline");
    fireEvent.error(beat.querySelector("img")!);
    expect(beat.querySelector("img")).toBeNull();
    expect(beat).toHaveTextContent(misfit.outcome!.situation);
  });

  test("the CONSEQUENCE of the line you said takes the frame, then the next beat carries only the line", () => {
    // INVERTED 2026-09-15, and the thing it guards is unchanged. Reported
    // 2026-08-24 as "it doesn't really adjust based on my selection": it
    // adjusted in the ledger, where nobody could see it, so the consequence
    // became a picture. That picture took a PAGE, which is the page the owner
    // removed. It is still here, still keyed on the line that was said, beside
    // the carried line rather than over the story.
    renderPage();
    const misfit = BOOK.scenes[0]!.choices.find((c) => !c.fits)!;
    expect(misfit.outcome, "zone 1 must author every consequence").toBeDefined();

    expect(sceneAlt()).toBe(BOOK.scenes[0]!.situation);
    fireEvent.click(screen.getByTestId(`story-choice-${misfit.concept}`));

    // INVERTED 2026-09-16 (mad-lib ruling, "it seems boring"). The consequence
    // was a thumbnail with its brief as visible prose beside YOU SAID. It is
    // the full frame now, with the brief as its alt text only.
    expect(saidOutcomeAlt()).toBe(misfit.outcome!.situation);
    fireEvent.click(screen.getByTestId("story-punchline"));

    // And it is still not a page: once the beat ends the frame is the next
    // scene, and the carried line has no thumbnail and no brief, because the
    // picture already had the screen.
    expect(screen.queryByTestId("story-outcome")).toBeNull();
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
    expect(screen.queryByTestId("story-said-still")).toBeNull();
    expect(screen.getByTestId("story-said")).not.toHaveTextContent(
      misfit.outcome!.situation,
    );
  });

  test("two different lines give two different consequences", () => {
    // If these ever matched, the branch would be invisible again and nothing
    // else in this suite would notice.
    const [a, b] = BOOK.scenes[0]!.choices;
    const first = renderPage();
    fireEvent.click(screen.getByTestId(`story-choice-${a!.concept}`));
    const altA = saidOutcomeAlt();
    first.unmount();
    localStorage.clear();

    renderPage();
    fireEvent.click(screen.getByTestId(`story-choice-${b!.concept}`));
    expect(saidOutcomeAlt()).not.toBe(altA);
  });
});

describe("the free taste runs out", () => {
  test("the second scene shows the story-unfinished beat, not a blank page", () => {
    // NOT what a Free caller gets any more: since 2026-08-24 the taste is the
    // whole zone 1 book, so a Free caller on this book resolves all five
    // scenes. This pins the path that is STILL reachable, and the only one it
    // was ever really for: a scene that cannot resolve because the LANGUAGE's
    // corpus is thin, on a caller the server marked limited. Serving one
    // scene's concepts is how that state is produced in a test.
    h.limited = true;
    serve(BOOK.scenes[0]!.choices.map((c) => c.concept));
    renderPage();
    // One click reaches it now rather than two (2026-09-15). The paywall beat
    // itself is untouched, and it must STAY distinct from the corpus being
    // short: a scene that will not resolve on a limited response is somebody
    // reaching the end of what they were given.
    // 2026-09-16: after the punchline beat, which `pick` taps through.
    pick(BOOK.scenes[0]!.choices[0]!.concept);

    const beat = screen.getByTestId("story-taste-end");
    expect(beat).toHaveTextContent(STORY_TEASER_END.title);
    expect(beat).toHaveTextContent(STORY_TEASER_END.cta);
    expect(
      screen.getByTestId("story-taste-upgrade").getAttribute("href"),
    ).toBe("/upgrade");
  });
});

describe("a language the book is not ready in", () => {
  test("a book that runs out of playable scenes ENDS, and still sells nothing", () => {
    // INVERTED 2026-09-15, and this inversion is the whole of the second fix.
    // It used to assert the dead end: a paying reader whose corpus ran short
    // mid-book was dropped on a full-screen "This story is not ready in <your
    // language> yet" with a Back button and nothing to do, their part-written
    // story thrown away. The owner hit exactly that on the SEA fork in Tagalog
    // and said "this isn't ok". The book now ENDS properly on what they did
    // write.
    //
    // The half that was right is kept and still asserted: no upgrade offer,
    // because there is nothing here to sell them.
    h.limited = false;
    serve(BOOK.scenes[0]!.choices.map((c) => c.concept));
    renderPage();
    const said = BOOK.scenes[0]!.choices[0]!.concept;
    pick(said);

    const book = screen.getByTestId("story-book");
    expect(book).toHaveTextContent(`native:${said}`);
    expect(screen.queryByTestId("story-short")).toBeNull();
    expect(screen.queryByTestId("story-taste-end")).toBeNull();
    expect(screen.queryByTestId("story-book-upsell")).toBeNull();
    expect(document.body.textContent).not.toMatch(/subscribe/i);
  });

  test("gets no upgrade offer, and IS told, when not one scene can be drawn", () => {
    // The only state in which "this story is not ready in your language yet" is
    // a true sentence, and now the only one that draws it. Against India's
    // seeded content on 2026-09-15 no book reaches it in any of the 22
    // languages: all 132 book-and-language pairs carry at least one playable
    // scene. It is kept because production is not the seed.
    h.limited = false;
    serve([]);
    renderPage();

    expect(screen.getByTestId("story-short")).toBeInTheDocument();
    expect(screen.queryByTestId("story-taste-end")).toBeNull();
    expect(document.body.textContent).not.toMatch(/subscribe/i);
  });

  test("a scene missing even one of its three lines is skipped, not part-drawn", () => {
    // resolveScene returns null rather than a two-option board: a stop that
    // opens onto two of its three options reads as broken rather than short.
    //
    // The concept withheld is derived, not named: the greetings book reuses its
    // eight concepts across all five scenes, so hardcoding one silently takes
    // out scene 1 as well and the test passes for the wrong reason. This picks
    // one that appears in a LATER scene and nowhere else.
    const later = BOOK.scenes.slice(1).flatMap((sc) => sc.choices);
    const only = later
      .map((c) => c.concept)
      .find(
        (concept) =>
          BOOK.scenes.filter((sc) =>
            sc.choices.some((c) => c.concept === concept),
          ).length === 1,
      );
    expect(only, "the book must have a concept unique to one later scene").toBeDefined();
    serve(bookConcepts(BOOK).filter((c) => c !== only));
    renderPage();

    // Scene 1 still resolves, which is the half of this that proves the test
    // is not passing by accident.
    expect(sceneAlt()).toBe(BOOK.scenes[0]!.situation);
    const missingScene = BOOK.scenes.find((sc) =>
      sc.choices.some((c) => c.concept === only),
    )!;
    let guard = 0;
    while (screen.queryByTestId("story-scene") && guard++ < BOOK.scenes.length) {
      expect(sceneAlt()).not.toBe(missingScene.situation);
      const first = screen
        .getAllByTestId(/^story-choice-/)[0]!
        .getAttribute("data-testid")!
        .replace("story-choice-", "");
      pick(first);
    }
    // The scene it could not carry was never drawn, part-drawn or otherwise.
    expect(screen.queryByTestId("story-scene")).toBeNull();
    // AND THE BOOK FINISHED RATHER THAN DEAD-ENDING, which is the half this
    // test could not say before 2026-09-15: skipping was already the engine's
    // intent, but the page turned the skip into a screen with a Back button.
    expect(screen.getByTestId("story-book")).toBeInTheDocument();
  });
});

/**
 * Play the whole book, always taking the first line offered.
 *
 * ONE CLICK PER BEAT since 2026-09-15; it was a click on the line and then a
 * click on Next. The loop reads the board each time rather than counting
 * scenes, so a book that legitimately ends short still drains it.
 */
function playBook(): string[] {
  const said: string[] = [];
  for (let i = 0; i < BOOK.scenes.length; i++) {
    if (!screen.queryByTestId("story-scene")) break;
    const cards = screen
      .getAllByTestId(/^story-choice-/)
      .map((el) => el.getAttribute("data-testid")!.replace("story-choice-", ""));
    said.push(cards[0]!);
    // Through the punchline beat since 2026-09-16, tapped rather than waited.
    pick(cards[0]!);
  }
  return said;
}

describe("the book at the end", () => {
  /** The same walk as playBook above, kept local where it was. */
  const playThrough = playBook;

  test("lists what the learner said, in order, with no score", () => {
    renderPage();
    const said = playThrough();

    const book = screen.getByTestId("story-book");
    expect(book).toHaveTextContent("Your book");
    for (const concept of said) {
      expect(book).toHaveTextContent(`native:${concept}`);
    }
    // A book, not a scorecard. Nothing here counts anything.
    expect(book.textContent).not.toMatch(/\d\s*\/\s*\d/);
    expect(book.textContent).not.toMatch(/score|correct|xp/i);
  });

  test("is a picture strip: the ending on top, then each outcome caused, with its line", () => {
    // INVERTS THE OLD SHAPE, 2026-09-16 (mad-lib ruling, "it seems boring").
    // This screen printed each scene's English brief above the line said, so
    // the finished book read as a page of illustrator's notes. The briefs are
    // alt text only now; nothing on screen prints one.
    renderPage();
    const said = playBook();
    const book = screen.getByTestId("story-book");

    // Always the first card, so the ending depends on how the shuffle fell;
    // derive it from what was said rather than hardcoding one.
    const fitted = BOOK.scenes.map(
      (sc, i) => sc.choices.find((c) => c.concept === said[i])!.fits,
    );
    const wrong = fitted.filter((f) => !f).length;
    const kind = wrong === 0 ? "perfect" : wrong * 2 <= said.length ? "chaos" : "disaster";
    const ending = screen.getByTestId("story-ending");
    // INVERTED 2026-09-16: stills moved from story/ to story/madlib/ (STORY_ART_DIR in
    // lib/story), so installed builds keep the old art beside their old words.
    expect(ending.getAttribute("src")).toContain(`story/madlib/door--end-${kind}.webp`);
    expect(ending.getAttribute("alt")).toBe(BOOK.endings![kind].situation);
    // On TOP of the strip, never under it.
    expect(ending.compareDocumentPosition(book.querySelector("ol")!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const panels = screen.getAllByTestId("story-book-entry");
    expect(panels).toHaveLength(said.length);
    panels.forEach((panel, i) => {
      const scene = BOOK.scenes[i]!;
      const choice = scene.choices.find((c) => c.concept === said[i])!;
      const still = panel.querySelector("img")!;
      expect(still.getAttribute("src")).toContain(
        `story/madlib/${outcomeStillId(scene.id, choice.concept)}.webp`,
      );
      expect(still.getAttribute("alt")).toBe(choice.outcome!.situation);
      expect(panel).toHaveTextContent(`native:${choice.concept}`);
      expect(panel).toHaveTextContent(`english:${choice.concept}`);
      // The brief as prose is gone.
      expect(panel.textContent).not.toContain(scene.situation);
      expect(panel.textContent).not.toContain(choice.outcome!.situation);
    });
  });

  test("a strip still that was never drawn leaves no box, and keeps its brief for a screen reader", () => {
    renderPage();
    playBook();
    const panel = screen.getAllByTestId("story-book-entry")[0]!;
    const still = panel.querySelector("img")!;
    const alt = still.getAttribute("alt")!;
    fireEvent.error(still);
    expect(panel.querySelector("img")).toBeNull();
    const hidden = panel.querySelector(".sr-only");
    expect(hidden?.textContent).toBe(alt);
    // Same for the ending.
    fireEvent.error(screen.getByTestId("story-ending"));
    expect(screen.queryByTestId("story-ending")).toBeNull();
  });

  test("Read it again and the share sit at the TOP, above the ending, and the upsell stays below the strip", () => {
    // NEW 2026-09-16, the owner: "the play again button, put it on the top of
    // that summary screen". Read it again was the last thing on this screen,
    // under the strip and the upsell. No earlier pin held that order, so
    // nothing was inverted; this pins the new one.
    renderPage();
    playBook();
    const again = screen.getByTestId("story-again");
    const shareBtn = screen.getByTestId("story-share");
    expect(shareBtn).toHaveTextContent(STORY_SHARE_CTA);
    expect(screen.getByTestId("story-book-actions")).toContainElement(again);
    expect(screen.getByTestId("story-book-actions")).toContainElement(shareBtn);
    const ending = screen.getByTestId("story-ending");
    expect(again.compareDocumentPosition(ending)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(shareBtn.compareDocumentPosition(ending)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test("Share your story draws the plan for this read, with this page's host, then shares it", async () => {
    share.compose.mockReset();
    share.share.mockReset();
    let finishDrawing!: (b: Blob) => void;
    share.compose.mockImplementation(
      () => new Promise<Blob>((resolve) => { finishDrawing = resolve; }),
    );
    share.share.mockResolvedValue("shared");
    renderPage();
    const said = playBook();
    const btn = screen.getByTestId("story-share");
    fireEvent.click(btn);

    // Busy while it draws, and a second press does not start a second picture.
    await waitFor(() => expect(btn).toBeDisabled());
    fireEvent.click(btn);
    expect(share.compose).toHaveBeenCalledTimes(1);

    const [plan, stillUrl] = share.compose.mock.calls[0]!;
    const entries = BOOK.scenes.map((sc, i) => ({
      sceneId: sc.id,
      concept: said[i]!,
      fitted: sc.choices.find((c) => c.concept === said[i])!.fits,
    }));
    const byConcept = new Map(h.phrases.map((p) => [p.concept, p]));
    expect(plan).toEqual(
      storySharePlan(BOOK, entries, (c) => byConcept.get(c), window.location.host),
    );
    expect(plan.footer.domain).toBe(window.location.host);
    // INVERTED 2026-09-16: stills moved from story/ to story/madlib/ (STORY_ART_DIR in
    // lib/story), so installed builds keep the old art beside their old words.
    expect(stillUrl("door-1--x")).toContain("story/madlib/door-1--x.webp");

    const blob = new Blob(["png"], { type: "image/png" });
    await act(async () => { finishDrawing(blob); });
    await waitFor(() => expect(share.share).toHaveBeenCalledWith(blob, `bolo-story-${BOOK.id}.png`));
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  test("a picture that fails to draw gives the button back and throws nothing at the learner", async () => {
    share.compose.mockReset();
    share.share.mockReset();
    share.compose.mockRejectedValue(new Error("no canvas"));
    renderPage();
    playBook();
    const btn = screen.getByTestId("story-share");
    fireEvent.click(btn);
    await waitFor(() => expect(share.compose).toHaveBeenCalled());
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(share.share).not.toHaveBeenCalled();
    expect(screen.getByTestId("story-book")).toBeInTheDocument();
  });

  test("it is still there on the way back, and can be started again", () => {
    const first = renderPage();
    playThrough();
    first.unmount();

    renderPage();
    expect(screen.getByTestId("story-book")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("story-again"));
    expect(sceneAlt()).toBe(BOOK.scenes[0]!.situation);
  });
});

describe("the book opens", () => {
  test("the cover plays once on entry, then clears", async () => {
    // Once per VISIT, not per scene. A story that starts five times has not
    // started at all, and the later beats are pages turning inside a book that
    // is already open.
    renderPage();
    expect(screen.getByTestId("story-book-opening")).toBeInTheDocument();

    // 900ms, long enough to read as a book and short enough that a second
    // visit is not a wait.
    await waitFor(
      () => expect(screen.queryByTestId("story-book-opening")).toBeNull(),
      { timeout: 3000 },
    );

    // The scene was mounted underneath the whole time, so nothing pops in.
    expect(sceneAlt()).toBe(BOOK.scenes[0]!.situation);
  });

  test("it does not replay when the story moves on", async () => {
    renderPage();
    await waitFor(
      () => expect(screen.queryByTestId("story-book-opening")).toBeNull(),
      { timeout: 3000 },
    );
    const first = BOOK.scenes[0]!.choices[0]!;
    pick(first.concept);
    expect(screen.queryByTestId("story-book-opening")).toBeNull();
  });
});

// ─── The narrator ────────────────────────────────────────────────────────────
//
// WHY THESE FOUR. Narration is generated once per line and cached forever, so a
// regression here is either a silent bill or a story that stops speaking, and
// neither shows up in a screenshot.
//
// THE HISTORY MATTERS, because this reversed once already and will invite
// reversing again. Narration shipped as OPT-IN, behind a "Hear the Story"
// button, and the scene deliberately did not narrate itself on the argument
// that describing the picture hands the learner the answer. The owner changed
// their mind on 2026-08-24: "I want audio on by default with an option to
// mute", then "you will need to change the button to say Mute the Story". The
// counter-argument that lost is worth keeping: the situation sentence describes
// the same moment the PICTURE already shows, so speaking it adds a channel
// rather than giving anything away.
describe("the narrator", () => {
  beforeEach(() => {
    h.narrated = [];
    serve(bookConcepts(BOOK));
  });

  test("reads the scene without being asked", async () => {
    renderPage();
    await drainVoices();
    expect(h.narrated).toEqual([BOOK.scenes[0]!.situation]);
  });

  test("reads ONE clip per page, and the page is the scene you turned to", async () => {
    // INVERTED 2026-09-15, and the bill moved with it. This used to assert a
    // second clip for the consequence, because the consequence was a page. It
    // is not a page any more (owner: "there is an additional screen in between
    // that's useless"), so a beat costs one narration rather than two, which
    // HALVES what this game bills the narrator for. The consequence is still on
    // screen beside the carried line, read rather than spoken: the pick already
    // fires the learner's own line in their own language, and a third voice on
    // one page turn is a queue, not a story.
    renderPage();
    const first = BOOK.scenes[0]!.choices[0]!;
    expect(first.outcome, "the consequence must still be authored").toBeDefined();
    fireEvent.click(screen.getByTestId(`story-choice-${first.concept}`));
    await drainVoices();

    // 2026-09-16: THE NEXT PAGE IS NOT NARRATED DURING THE PUNCHLINE. The
    // learner's line is what speaks over their joke; the page they turn to is
    // asked for only when the beat ends, so it joins the voice chain behind the
    // line instead of racing it (the chain from 7ecd67d7).
    expect(h.narrated).toEqual([BOOK.scenes[0]!.situation]);
    fireEvent.click(screen.getByTestId("story-punchline"));
    await drainVoices();

    expect(h.narrated).toEqual([
      BOOK.scenes[0]!.situation,
      BOOK.scenes[1]!.situation,
    ]);
    // The punchline is seen and not read aloud, as the thumbnail was not.
    expect(h.narrated).not.toContain(first.outcome!.situation);
  });

  test("the control is a MUTE, and it says so", () => {
    // Sound is on by default, so a button offering to start it would be a lie
    // about the current state. It also replaces the header speaker icon every
    // other game carries: two controls for one state is worse than an
    // inconsistent header.
    renderPage();
    const btn = screen.getByTestId("story-mute");
    expect(btn).toHaveTextContent("Mute the Story");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("game-mute-btn")).toBeNull();

    fireEvent.click(btn);
    expect(btn).toHaveTextContent("Unmute the Story");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  test("muted asks for NO synthesis at all, not merely silent playback", async () => {
    // Narration bills per character on first play and is cached forever after.
    // A clip generated for somebody who muted the game is charged, stored and
    // never heard, which is the worst of both. Mute has to short-circuit the
    // REQUEST, not the audio element.
    renderPage();
    // The opening page's narration was asked for BEFORE the mute and is
    // already on its way; draining it first is what makes the reset below mean
    // "from here on", rather than swallowing a request that mute never had a
    // chance to stop.
    await drainVoices();
    fireEvent.click(screen.getByTestId("story-mute"));
    h.narrated = [];
    const first = BOOK.scenes[0]!.choices[0]!;
    pick(first.concept);
    // Drained rather than read immediately: a queued request that arrives a
    // turn later is still a request, and is still charged for.
    await drainVoices();
    expect(h.narrated).toEqual([]);
  });
});

// ─── The ask at the end of the taste ─────────────────────────────────────────
//
// WHY THIS IS THE MOST COMMERCIALLY LOAD-BEARING TEST IN THE FILE. The free
// taste grew from one scene to the whole zone 1 book on 2026-08-24. That was
// right, because one scene never reached the finished book and the finished
// book IS the argument for subscribing. But it moved the paywall: a Free reader
// no longer hits STORY_TEASER_END mid-story, they finish. Without an ask on the
// finished screen, widening the taste simply gives zone 1 away.
//
// Nothing about that is visible. The page looks correct either way.
describe("finishing the free taste", () => {
  test("asks, once the ledger has made the argument", () => {
    h.limited = true;
    serve(bookConcepts(BOOK));
    renderPage();
    playBook();

    const upsell = screen.getByTestId("story-book-upsell");
    expect(upsell).toHaveTextContent(STORY_TASTE_BOOK_DONE.title);
    expect(upsell).toHaveTextContent(STORY_TASTE_BOOK_DONE.body);
    expect(
      screen.getByTestId("story-book-upgrade").getAttribute("href"),
    ).toBe("/upgrade");

    // AFTER the ledger, never before it. The list of what they said is the
    // reason to buy, so asking above it is asking before showing.
    const book = screen.getByTestId("story-book");
    const entries = book.querySelector("ol")!;
    expect(entries.compareDocumentPosition(upsell)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("does NOT ask somebody who already pays", () => {
    // The same screen, the same finished book. Selling All-Access to an
    // All-Access subscriber is the kind of thing that gets screenshotted.
    h.limited = false;
    serve(bookConcepts(BOOK));
    renderPage();
    playBook();

    expect(screen.getByTestId("story-book")).toBeInTheDocument();
    expect(screen.queryByTestId("story-book-upsell")).toBeNull();
  });
});

// ─── What you said, carried forward ──────────────────────────────────────────
describe("the line you just said", () => {
  beforeEach(() => { h.narrated = []; serve(bookConcepts(BOOK)); });

  test("is still on screen above the NEXT set of answers", () => {
    // Reported 2026-08-24: "The 'you said' isn't showing on the next page. It
    // shouldn't be its own page, but it should just show up above the next set
    // of answers." It used to be derived from `picked`, which resets on
    // advance, so it disappeared at exactly the moment it became useful.
    //
    // The same sentence came back on 2026-09-15 as the whole request: "should
    // just go to the next question but show what you selected previously on top
    // of the options". So this now happens on the FIRST press rather than the
    // second, which is the only thing about it that changed.
    renderPage();
    const first = BOOK.scenes[0]!.choices[0]!;
    pick(first.concept);

    const said = screen.getByTestId("story-said");
    expect(said).toHaveTextContent(`native:${first.concept}`);
    expect(said).toHaveTextContent(`english:${first.concept}`);

    // Above the answers, not below them: it is context for the choice being
    // made now, not a footnote on the one already made.
    const lines = screen.getByTestId(`story-choice-${BOOK.scenes[1]!.choices[0]!.concept}`);
    expect(said.compareDocumentPosition(lines)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("is absent on the very first page, and gone again after a restart", () => {
    renderPage();
    expect(screen.queryByTestId("story-said")).toBeNull();
    playBook();
    fireEvent.click(screen.getByTestId("story-again"));
    expect(screen.queryByTestId("story-said")).toBeNull();
  });
});
