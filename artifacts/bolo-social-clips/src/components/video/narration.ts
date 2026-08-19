// Single source of truth for the social clips' narration script.
//
// Mirrors the launch video's narration.ts contract: each scene's narration is
// an ordered list of segments (the exact spoken words, split for caption
// pacing) plus a `hideAt` marking roughly where the spoken line ends. Both
// consumers derive from this one definition:
//   1. SceneCaptions renders the segments as timed on-screen text.
//   2. Voiceover regeneration should read the full spoken line via
//      `getSceneScript` / `NARRATION_SCRIPT` so the audio matches the captions.
//
// Segment `at` offsets are measured from the scene's start on the same
// restart-from-0 timeline the audio seek uses (see SCENE_OFFSETS in
// VideoTemplate). They must line up with where each vo_*.mp3 is placed in the
// composite mix, the placement lives in scripts/mix-composite-audio.sh
// (vo_roots at 8.3s into roots, vo_howitworks at 1.0s into howItWorks,
// vo_languages at 8.8s into languages). If a VO clip is re-recorded or moved,
// update both this file and the mix script together.

export type NarrationSegment = { text: string; at: number };

export type SceneNarration = { segments: NarrationSegment[]; hideAt: number };

export const SCENE_NARRATION: Record<string, SceneNarration> = {
  roots: {
    segments: [
      {
        text: "It's never too late to speak your language again.",
        at: 8300,
      },
    ],
    hideAt: 11100,
  },
  howItWorks: {
    segments: [
      {
        text: 'Just speak and get instant feedback on every phrase.',
        at: 1000,
      },
    ],
    hideAt: 4400,
  },
  languages: {
    segments: [
      { text: '22 languages. One app.', at: 8800 },
      {
        text: "The world's first conversational AI-driven language learning app.",
        at: 10900,
      },
      { text: 'Start speaking today.', at: 15600 },
    ],
    hideAt: 17600,
  },
};

// Strip the scene-lock replay suffix (_r1/_r2) so lookups resolve to the base
// scene, matching how VideoTemplate keys its timelines.
function baseSceneKey(sceneKey: string): string {
  return sceneKey.replace(/_r[12]$/, '');
}

// The full spoken line for a scene, in narration order. Feed this to voiceover
// (TTS) regeneration so the generated audio in public/audio/vo_*.mp3 stays word
// for word identical to the on-screen caption. Returns '' for unknown scenes.
export function getSceneScript(sceneKey: string): string {
  const narration = SCENE_NARRATION[baseSceneKey(sceneKey)];
  if (!narration) return '';
  return narration.segments.map((seg) => seg.text).join(' ');
}

// Scene key -> full spoken script line, derived from SCENE_NARRATION.
export const NARRATION_SCRIPT: Record<string, string> = Object.fromEntries(
  Object.keys(SCENE_NARRATION).map((key) => [key, getSceneScript(key)]),
);
