// ANSWER BACK (web): WHO SPEAKS WHICH LINE.
//
// Owner ruling 2026-09-15 (option A), under the 2026-09-13 voice roles rule
// ("Bolo Bird = coach voice (they should be the same) elder should be
// different"). The SEA parity review found the keeper's line synthesized in the
// coach's voice, because the page sent a plain phrase request.
//
// Pinned through the PAGE, not a helper: the defect lived in which request each
// call site built, so the proof is what reaches the synthesize hook and what the
// audio element is then given, from a real render.
//  1. The keeper's opening line asks for speaker "elder" with a language.
//  2. "Hear again" plays the elder's take, not a coach take of the same words.
//  3. The learner's right reply after a miss is the coach: no speaker, the
//     exact request the page sent before the ruling.
//
// Mobile twin: bolo-mobile __tests__/answer-back-voices.test.tsx, case for case.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { answerBackExchangesFor } from "@workspace/script-trace";

type SynthBody = { text: string; languageName?: string; languageCode?: string; speaker?: string };

const h = vi.hoisted(() => {
  let id = 1;
  const phrase = (nativeScript: string, romanized: string, english: string) => ({
    id: id++,
    nativeScript,
    romanized,
    english,
  });
  // India, Hindi, journey 1 zone 1 stop 1, as answer-back.test.ts uses: a group
  // that fields enough exchanges to play Answer Back rather than Last Call.
  const list = [
    phrase("नमस्ते", "namaste", "Hello"),
    phrase("धन्यवाद", "dhanyavaad", "Thank you"),
    phrase("माफ़ कीजिए", "maaf kijiye", "Excuse me / Sorry"),
    phrase("कृपया", "kripya", "Please"),
    phrase("सुप्रभात", "suprabhaat", "Good morning"),
    phrase("शुभ रात्रि", "shubh raatri", "Good night"),
    phrase("कैसे हैं?", "kaise hain?", "How are you?"),
    phrase("आपका स्वागत है", "aapka swagat hai", "You’re welcome"),
    phrase("शुभ संध्या", "shubh sandhya", "Good evening"),
    phrase("फिर मिलेंगे", "phir milenge", "See you again"),
  ];
  const synth = vi.fn(async ({ data }: { data: { text: string; speaker?: string } }) => ({
    // The audio names its voice, so a play can be traced back to its request.
    audioBase64: `${data.speaker ?? "coach"}:${data.text}`,
    format: "mp3",
  }));
  const plays: string[] = [];
  const el = {
    src: "",
    onended: null as null | (() => void),
    onerror: null as null | (() => void),
    pause: () => undefined,
    play: async function (this: { src: string; onended: null | (() => void) }) {
      plays.push(this.src);
      const done = this.onended;
      setTimeout(() => done?.(), 0);
    },
  };
  // One stable object, as the real hook's callbacks are stable.
  const speak = {
    recording: false,
    prepare: vi.fn(async () => undefined),
    start: vi.fn(async () => true),
    // A failing band with no readable transcript: no card is chosen, so the take
    // is a miss on the right card and the right reply is played.
    stopAndScore: vi.fn(async () => ({
      kind: "scored",
      band: "retry",
      xpAwarded: 0,
      attemptSaved: true,
      newlyEarnedBadges: [],
      transcript: "",
      transcriptRomanized: "",
    })),
    cancel: vi.fn(),
    permissionDenied: () => false,
    getAmplitude: () => 0,
  };
  return { list, synth, plays, el, speak };
});

vi.mock("wouter", () => ({
  useSearch: () => "group=7&cat=1",
  useLocation: () => ["/games/answer-back", vi.fn()],
  Redirect: () => null,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/api-client-react", async () => ({
  ...(await (await import("./api-client-mock")).baseApiClientMock()),
  useListLessonGroupPhrases: () => ({
    data: h.list,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useSynthesizeSpeech: () => ({ mutateAsync: h.synth }),
}));

vi.mock("@/hooks/useSpeakAndScore", () => ({ useSpeakAndScore: () => h.speak }));
vi.mock("@/hooks/useInputLevel", () => ({ useInputLevel: () => ({ amplitude: 0, level: 0, noInput: false }) }));
vi.mock("@/lib/iosAudio", () => ({ getCoachAudioElement: () => h.el, blessAudioPlayback: vi.fn() }));
vi.mock("@/lib/speechRatePref", () => ({ applySpeechRate: vi.fn() }));
vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({ activeLang: "hi", activeLanguage: { code: "hi", name: "Hindi", nativeName: "हिन्दी" } }),
  useNativeText: () => ({ style: {}, dir: "ltr" as const, isNastaliq: false }),
  useSpeechCapability: () => "supported",
}));
vi.mock("@/lib/answer-back-memory", () => ({ saveAnswerBackStars: () => ({ best: 0, isNewBest: false }) }));
vi.mock("@/lib/haptics", () => ({ webHaptic: vi.fn() }));
vi.mock("@/lib/sound", () => ({ playCue: vi.fn() }));
vi.mock("@/components/game-mute-button", () => ({
  GameMuteButton: () => null,
  useGameAudio: () => ({ soundOn: true, toggle: vi.fn() }),
}));
vi.mock("@/components/ui/confetti", () => ({ Confetti: () => null }));
vi.mock("@/components/flashback-lightbox", () => ({ FlashbackLightbox: () => null }));
vi.mock("@/components/voice-bars", () => ({ VoiceBars: () => null }));
vi.mock("@/components/ai-consent-blocked-card", () => ({ AiConsentBlockedCard: () => null }));

import AnswerBackPage from "@/pages/games/answer-back";

const exchanges = answerBackExchangesFor(h.list);
const promptTexts = new Set(exchanges.map((e) => e.promptPhrase.nativeScript));
const replyTexts = new Set(exchanges.map((e) => e.replyPhrase.nativeScript));
const played = (voice: string, text: string) => `data:audio/mp3;base64,${voice}:${text}`;
const calls = () => h.synth.mock.calls.map(([arg]) => arg.data as SynthBody);

describe("Answer Back voices (web)", () => {
  beforeEach(() => {
    h.synth.mockClear();
    h.plays.length = 0;
  });

  it("the fixture really plays Answer Back, so the pins below are not vacuous", () => {
    expect(exchanges.length).toBeGreaterThanOrEqual(3);
  });

  it("the keeper's opening line and Hear again are the elder, the learner's reply is the coach", async () => {
    render(<AnswerBackPage />);

    // 1. The opening line: the elder, with the language his voice is chosen by.
    await waitFor(() => expect(h.synth).toHaveBeenCalledTimes(1));
    const opening = calls()[0]!;
    expect(promptTexts.has(opening.text)).toBe(true);
    expect(opening).toEqual({ text: opening.text, languageName: "Hindi", languageCode: "hi", speaker: "elder" });
    await waitFor(() => expect(h.plays).toContain(played("elder", opening.text)));

    // 2. Hear again: his take again, never a coach take of the same words.
    h.plays.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-back-hear-again"));
    });
    await waitFor(() => expect(h.plays.length).toBe(1));
    expect(h.plays[0]).toBe(played("elder", opening.text));
    for (const d of calls()) expect(d.speaker).toBe("elder");

    // 3. A missed take: the right reply is the learner's line, in the coach's voice.
    const mic = screen.getByTestId("answer-back-mic");
    await act(async () => {
      fireEvent.click(mic, { detail: 0 });
    });
    await act(async () => {
      fireEvent.click(mic, { detail: 0 });
    });
    await waitFor(() => expect(calls().some((d) => d.speaker === undefined)).toBe(true));
    const reply = calls().find((d) => d.speaker === undefined)!;
    expect(replyTexts.has(reply.text)).toBe(true);
    // Byte-identical to the pre-ruling coach request on web: no speaker.
    expect(reply).toEqual({ text: reply.text, languageName: "Hindi", languageCode: "hi" });
    await waitFor(() => expect(h.plays).toContain(played("coach", reply.text)));
  });
});
