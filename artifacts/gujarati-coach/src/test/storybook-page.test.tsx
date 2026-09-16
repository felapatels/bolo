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
  storyBookFor,
  bookConcepts,
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
  const still = screen.getByTestId("story-said-still");
  return still.getAttribute("alt") ?? "";
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
    // one: the story has ALREADY moved on, with no second press.
    expect(screen.queryByTestId("story-next")).toBeNull();
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
  });

  test("a misfitting line still turns the page, on the FIRST press", () => {
    renderPage();
    const misfit = BOOK.scenes[0]!.choices.find((c) => !c.fits)!;
    fireEvent.click(screen.getByTestId(`story-choice-${misfit.concept}`));
    // One click, one page. It took two until 2026-09-15.
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
  });

  test("the CONSEQUENCE of the line you said is carried onto the next beat", () => {
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

    // The consequence, as the picture AND as its brief.
    expect(saidOutcomeAlt()).toBe(misfit.outcome!.situation);
    expect(screen.getByTestId("story-said")).toHaveTextContent(
      misfit.outcome!.situation,
    );
    // And it is no longer a page: the frame is already the next scene.
    expect(screen.queryByTestId("story-outcome")).toBeNull();
    expect(sceneAlt()).toBe(BOOK.scenes[1]!.situation);
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
    fireEvent.click(
      screen.getByTestId(`story-choice-${BOOK.scenes[0]!.choices[0]!.concept}`),
    );

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
    fireEvent.click(screen.getByTestId(`story-choice-${said}`));

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
      fireEvent.click(screen.getByTestId(`story-choice-${first}`));
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
    fireEvent.click(screen.getByTestId(`story-choice-${cards[0]!}`));
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
    fireEvent.click(screen.getByTestId(`story-choice-${first.concept}`));
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

    expect(h.narrated).toEqual([
      BOOK.scenes[0]!.situation,
      BOOK.scenes[1]!.situation,
    ]);
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
    fireEvent.click(screen.getByTestId(`story-choice-${first.concept}`));
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
    fireEvent.click(screen.getByTestId(`story-choice-${first.concept}`));

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
