// Single source of truth for the launch video's narration script.
//
// The spoken voiceover words used to live in only two places: the hand-typed
// caption strings and, opaquely, inside the generated public/audio/vo_*.mp3
// clips. Nothing stored the script as editable source, so re-recording a line
// with different wording would silently leave the caption out of sync with what
// viewers actually hear — worse for accessibility than no caption at all.
//
// This module is that missing source of truth. Each scene's narration is an
// ordered list of segments (the exact words, split for caption pacing) plus a
// `hideAt` marking roughly where the spoken line ends. Both consumers derive
// from this one definition:
//   1. SceneCaptions renders the segments as timed on-screen text.
//   2. Voiceover regeneration should read the full spoken line via
//      `getSceneScript` / `NARRATION_SCRIPT` so the audio matches the captions.
//
// Because both read the same words, editing a line here updates the caption
// automatically and keeps text and audio from diverging.

// One revealed chunk of a scene's narration. `at` is the offset (ms) from the
// scene's start when this segment appears, measured on the same restart-from-0
// timeline the audio seek uses (see SCENE_OFFSETS in VideoTemplate).
export type NarrationSegment = { text: string; at: number };

// A scene's full narration: its segments plus `hideAt` (ms from scene start),
// roughly where the spoken line ends so the caption clears rather than lingering
// silently for the rest of the scene.
export type SceneNarration = { segments: NarrationSegment[]; hideAt: number };

export const SCENE_NARRATION: Record<string, SceneNarration> = {
  intro: {
    segments: [
      { text: 'Your story begins with a single word.', at: 0 },
      { text: 'Get back to your roots.', at: 2000 },
    ],
    hideAt: 4000,
  },
  languages: {
    segments: [
      {
        text: '22 languages, each with its own beautiful script and living voice.',
        at: 0,
      },
      { text: 'One of them is yours.', at: 4400 },
    ],
    hideAt: 6100,
  },
  listen: {
    segments: [
      { text: 'Listen closely to native speakers', at: 0 },
      {
        text: 'and let the true sound of every word settle into your ear.',
        at: 2400,
      },
    ],
    hideAt: 5300,
  },
  speak: {
    segments: [
      { text: 'Now say it out loud.', at: 0 },
      {
        text: 'Instant, gentle feedback helps your pronunciation grow with every try.',
        at: 1800,
      },
    ],
    hideAt: 5700,
  },
  reward: {
    segments: [
      { text: 'Finish a lesson, keep your streak alive,', at: 0 },
      { text: 'and feel your confidence build day by day.', at: 2500 },
    ],
    hideAt: 5100,
  },
  mastery: {
    segments: [
      { text: 'Earn badges, track your growth,', at: 0 },
      { text: 'and truly master your mother tongue over time.', at: 2200 },
    ],
    hideAt: 4500,
  },
  outro: {
    segments: [
      { text: 'Bolo — find your voice and get back to your roots.', at: 0 },
      { text: 'Download today.', at: 3400 },
    ],
    hideAt: 4700,
  },
};

// Strip the scene-lock replay suffix (_r1/_r2) so lookups resolve to the base
// scene, matching how VideoTemplate and SceneCaptions key their timelines.
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

// Scene key -> full spoken script line, derived from SCENE_NARRATION. Convenient
// for a voiceover regeneration script that needs every line at once.
export const NARRATION_SCRIPT: Record<string, string> = Object.fromEntries(
  Object.keys(SCENE_NARRATION).map((key) => [key, getSceneScript(key)]),
);
