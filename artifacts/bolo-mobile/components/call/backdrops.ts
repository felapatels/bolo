import type { ImageSourcePropType } from 'react-native';

/**
 * The two clips of Chacha-ji, and the rule for when each form of them shows.
 *
 * ONE BACKDROP PER CALL, NEVER BOTH. The two are different scenes (one has him
 * at the wheel with a festival street through the windscreen, the other in the
 * back seat with a market going past the side windows), so switching mid-call
 * would move him into another car in the middle of a sentence. THE SERVER
 * DECIDES: it picks one when the call is created and returns the same id on
 * every turn. The client resolves that id here and never picks for itself.
 *
 * HE MOVES WHEN HE TALKS AND HOLDS STILL WHEN HE LISTENS.
 *
 *   speaking   ->  VIDEO[id], looping
 *   listening  ->  POSTER[id], held
 *
 * That split exists because the loops genuinely animate his face rather than
 * idling: measured 2026-08-28, the face region of the backseat clip moves about
 * 45 times as much as a static part of the same frame. Running it while the
 * learner is talking would show him talking over them.
 *
 * THE POSTERS ARE FRAME 0 OF THE CLIPS, verified rather than assumed (they
 * differ from a fresh frame-0 export by 1.6/255, which is jpeg noise). So the
 * held still and the first frame of the loop are the same image, and the
 * handover between listening and speaking has nothing to jump over. The owner
 * chose that frame for the pose: smiling but attentive.
 *
 * There was going to be a purpose-made listening loop. It is not needed: the
 * clips contain no mouth-closed frame anywhere (checked, he smiles throughout),
 * so the choice was a held smile or new art, and a held smile is the same
 * asset we already ship.
 */
export type CallBackdropId = 'driving' | 'backseat';

export const CALL_BACKDROP_IDS: readonly CallBackdropId[] = ['driving', 'backseat'];

/** Held while he listens. Also the ringing screen's still. */
export const CALL_POSTERS: Record<CallBackdropId, ImageSourcePropType> = {
  driving: require('@/assets/call/chacha-call-driving-poster.jpg'),
  backseat: require('@/assets/call/chacha-call-backseat-poster.jpg'),
};

/** Looped while he speaks. Both are silent and loop seamlessly. */
export const CALL_VIDEOS: Record<CallBackdropId, number> = {
  driving: require('@/assets/call/chacha-call-driving.mp4'),
  backseat: require('@/assets/call/chacha-call-backseat.mp4'),
};

export function isCallBackdropId(v: unknown): v is CallBackdropId {
  return v === 'driving' || v === 'backseat';
}
