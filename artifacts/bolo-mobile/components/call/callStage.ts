/**
 * THE STAGE: where Chacha-ji's picture goes on the call screen, and how it
 * is cropped so his FACE is framed rather than his shirt (build 25, owner:
 * "the text box covers chachaji's face, fix that").
 *
 * The call used to paint the clip edge to edge under everything, with the
 * captions and controls stacked up from the bottom. Both clips put his face
 * in the middle band of the frame (about 30% to 58% of its height), so on a
 * phone the caption card sat on his chest and climbed to his mouth the
 * moment the "heard" mirror added its lines, and on an iPad, where cover
 * crops the top and bottom off a 9:16 clip, the face landed lower still. A
 * real video call does not do this: the picture is up top and the words and
 * buttons live in a panel beneath it, and that is the composition here.
 *
 * The picture covers the stage by WIDTH and is then slid up so the crop
 * takes more from the bottom (his hands, the seat) than from the top (roof,
 * ceiling), which is where his face has room. Pure geometry, so it is
 * pinned rather than argued about.
 */

/** Share of the window the picture takes; the panel gets the rest. */
export const STAGE_SHARE = 0.54;

/** Both clips are 1080x1920. */
export const CLIP_ASPECT_H = 16 / 9;

/**
 * How much of the overflow is cropped from the TOP of the clip. Under a half,
 * so the crop favours the bottom; measured against both posters so the face
 * (30% to 58% of the frame) sits inside the stage on a 402x874 phone and a
 * 1032x1376 iPad alike.
 */
export const FACE_BIAS = 0.35;

export interface StageGeometry {
  /** The stage's height in points. */
  stageH: number;
  /** The rendered picture, which covers the stage by width. */
  picW: number;
  picH: number;
  /** The picture's top inside the stage: zero or negative. */
  picTop: number;
}

export function stageGeometry(windowW: number, windowH: number): StageGeometry {
  const stageH = Math.round(windowH * STAGE_SHARE);
  const picW = windowW;
  const picH = Math.max(stageH, Math.round(windowW * CLIP_ASPECT_H));
  const picTop = -Math.round((picH - stageH) * FACE_BIAS);
  return { stageH, picW, picH, picTop };
}

/**
 * Where a point of the clip lands on screen, as a fraction of the stage's
 * height. For the pins: the face band of both clips must land inside 0..1.
 */
export function clipFractionOnStage(g: StageGeometry, clipFraction: number): number {
  return (g.picTop + clipFraction * g.picH) / g.stageH;
}
