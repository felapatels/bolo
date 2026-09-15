import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { answerBackExchangesFor } from '@workspace/script-trace';

// ---------------------------------------------------------------------------
// ANSWER BACK: WHO SPEAKS WHICH LINE.
//
// Owner ruling 2026-09-15 (option A), under the 2026-09-13 voice roles rule
// ("Bolo Bird = coach voice (they should be the same) elder should be
// different"). The SEA parity review found the keeper's line synthesized in the
// coach's voice, because the screen sent a plain phrase request.
//
// Pinned through the SCREEN, not a helper: the defect lived in which request
// each call site built, so the proof is what reaches the synthesize hook and
// what is then PLAYED, from a real render.
//  1. The keeper's opening line asks for speaker 'elder' with a language.
//  2. "Hear again" plays the elder's take, not a coach take of the same words.
//  3. The learner's right reply after a miss is the coach: no speaker at all,
//     the exact request the screen sent before the ruling.
//
// Web twin: gujarati-coach src/test/answer-back-voices.test.tsx.
// ---------------------------------------------------------------------------

type SynthBody = { text: string; languageName?: string; languageCode?: string; speaker?: string };

const mockSynth = jest.fn(async ({ data }: { data: SynthBody }) => ({
  // The audio names its voice, so a play can be traced back to its request.
  audioBase64: `${data.speaker ?? 'coach'}:${data.text}`,
  format: 'mp3',
}));
const mockPlay = jest.fn(async (_b64: string, _fmt: string, onEnd?: () => void) => {
  onEnd?.();
  return { stop: jest.fn() };
});

let mockId = 1;
const mockPhrase = (nativeScript: string, romanized: string, english: string) => ({
  id: mockId++,
  nativeScript,
  romanized,
  english,
});
// India, Hindi, journey 1 zone 1 stop 1, as answer-back.test.ts uses: a group
// that fields enough exchanges to play Answer Back rather than Last Call.
const mockList = [
  mockPhrase('नमस्ते', 'namaste', 'Hello'),
  mockPhrase('धन्यवाद', 'dhanyavaad', 'Thank you'),
  mockPhrase('माफ़ कीजिए', 'maaf kijiye', 'Excuse me / Sorry'),
  mockPhrase('कृपया', 'kripya', 'Please'),
  mockPhrase('सुप्रभात', 'suprabhaat', 'Good morning'),
  mockPhrase('शुभ रात्रि', 'shubh raatri', 'Good night'),
  mockPhrase('कैसे हैं?', 'kaise hain?', 'How are you?'),
  mockPhrase('आपका स्वागत है', 'aapka swagat hai', 'You’re welcome'),
  mockPhrase('शुभ संध्या', 'shubh sandhya', 'Good evening'),
  mockPhrase('फिर मिलेंगे', 'phir milenge', 'See you again'),
];

// One stable object, as the real hook's callbacks are stable: the screen puts
// prepare in an effect's dependencies.
const mockSpeak = {
  recorder: null,
  recording: false,
  metering: undefined,
  prepare: jest.fn(async () => undefined),
  start: jest.fn(async () => true),
  // A failing band with no readable transcript: no card is "chosen", so the
  // take is a miss on the right card and the right reply is played.
  stopAndScore: jest.fn(async () => ({
    kind: 'scored',
    band: 'retry',
    xpAwarded: 0,
    attemptSaved: true,
    newlyEarnedBadges: [],
    transcript: '',
    transcriptRomanized: '',
  })),
  cancel: jest.fn(async () => undefined),
  permissionDenied: () => false,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ group: '7', cat: '1' }),
  useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Redirect: () => null,
}));

jest.mock('@workspace/api-client-react', () => ({
  ...jest.requireActual<typeof import('./helpers/api-client-mock')>('./helpers/api-client-mock').baseApiClientMock(),
  useListLessonGroupPhrases: () => ({
    data: mockList,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  }),
  useGetAccount: () => ({ data: { preferences: { learning: { ttsVoice: 'auto' } } } }),
  useSynthesizeSpeech: () => ({ mutateAsync: mockSynth }),
}));

jest.mock('@/hooks/useSpeakAndScore', () => ({ useSpeakAndScore: () => mockSpeak }));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: (...a: [string, string, (() => void)?]) => mockPlay(...a),
  meteringToAmplitude: () => 0,
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi' },
    speechCapability: 'supported',
  }),
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn(), hapticNotify: jest.fn() }));
jest.mock('@/lib/sound', () => ({ playCue: jest.fn() }));
jest.mock('@/lib/gameExit', () => ({ confirmDiscardRun: jest.fn() }));
jest.mock('@/lib/answerBackMemory', () => ({ saveAnswerBackStars: jest.fn(async () => ({ best: 0, isNewBest: false })) }));
jest.mock('@/lib/entrance', () => ({ appearPlain: () => undefined }));

jest.mock('@/components/GameMuteButton', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return { GameMuteButton: () => R.createElement(V, null), useGameAudio: () => ({ soundOn: true, toggle: jest.fn() }) };
});
jest.mock('@/components/Screen', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return { Screen: ({ children }: any) => R.createElement(V, null, children), TAB_BAR_CLEARANCE: 0 };
});
jest.mock('@/components/ChunkyButton', () => {
  const R = require('react');
  const { Pressable: P, Text: T } = require('react-native');
  return { ChunkyButton: ({ onPress, title }: any) => R.createElement(P, { onPress }, R.createElement(T, null, title)) };
});
jest.mock('@/components/Waveform', () => ({ Waveform: () => null }));
jest.mock('@/components/Confetti', () => ({ Confetti: () => null }));
jest.mock('@/components/FunFactLoader', () => ({ FunFactLoader: () => null }));
jest.mock('@/components/LessonError', () => ({ LessonError: () => null }));
jest.mock('@/components/UpgradeRequiredScreen', () => ({ UpgradeRequiredScreen: () => null }));
jest.mock('@/components/FlashbackLightbox', () => ({ FlashbackLightbox: () => null }));
jest.mock('@/components/games/AiConsentBlockedCard', () => ({ AiConsentBlockedCard: () => null }));
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
    muted: '#EEEEEE',
    success: '#00AA00',
    destructive: '#AA0000',
  }),
}));
jest.mock('@/constants/fonts', () => ({
  AppFonts: { regular: 'r', semibold: 's', bold: 'b', extrabold: 'x' },
  nativeTextStyle: () => ({}),
}));

// Imported after the mocks.
import AnswerBackScreen from '../app/(app)/(tabs)/games/answer-back';

const exchanges = answerBackExchangesFor(mockList);
const promptTexts = new Set(exchanges.map((e) => e.promptPhrase.nativeScript));
const replyTexts = new Set(exchanges.map((e) => e.replyPhrase.nativeScript));

beforeEach(() => {
  mockSynth.mockClear();
  mockPlay.mockClear();
});

it('the fixture really plays Answer Back, so the pins below are not vacuous', () => {
  expect(exchanges.length).toBeGreaterThanOrEqual(3);
});

it("the keeper's opening line and Hear again are the elder, the learner's reply is the coach", async () => {
  render(<AnswerBackScreen />);

  // 1. The opening line: the elder, with the language his voice is chosen by.
  await waitFor(() => expect(mockSynth).toHaveBeenCalledTimes(1));
  const opening = mockSynth.mock.calls[0]![0].data;
  expect(promptTexts.has(opening.text)).toBe(true);
  expect(opening).toEqual({ text: opening.text, languageName: 'Hindi', languageCode: 'hi', speaker: 'elder' });
  await waitFor(() => expect(mockPlay).toHaveBeenCalledWith(`elder:${opening.text}`, 'mp3', expect.any(Function)));

  // 2. Hear again: his take again, never a coach take of the same words.
  mockPlay.mockClear();
  await act(async () => {
    fireEvent.press(screen.getByTestId('answer-back-hear-again'));
  });
  await waitFor(() => expect(mockPlay).toHaveBeenCalledTimes(1));
  expect(mockPlay.mock.calls[0]![0]).toBe(`elder:${opening.text}`);
  for (const [{ data }] of mockSynth.mock.calls) expect(data.speaker).toBe('elder');

  // 3. A missed take: the right reply is the learner's line, in the coach's voice.
  const mic = screen.getByTestId('answer-back-mic');
  await act(async () => {
    fireEvent(mic, 'pressIn');
  });
  await act(async () => {
    fireEvent(mic, 'pressIn');
  });
  await waitFor(() => expect(mockSynth.mock.calls.some(([{ data }]) => data.speaker === undefined)).toBe(true));
  const reply = mockSynth.mock.calls.map(([{ data }]) => data).find((d) => d.speaker === undefined)!;
  expect(replyTexts.has(reply.text)).toBe(true);
  // Byte-identical to the pre-ruling coach request: no speaker, no languageCode.
  expect(reply).toEqual({ text: reply.text, languageName: 'Hindi' });
  await waitFor(() => expect(mockPlay).toHaveBeenCalledWith(`coach:${reply.text}`, 'mp3', expect.any(Function)));
});
