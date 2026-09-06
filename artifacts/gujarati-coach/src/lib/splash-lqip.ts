// THE BOOT SURFACE, AND IT IS FLAT AGAIN ON PURPOSE (owner, 2026-09-06: "if we
// can't fix the blurred start, add 1 second of plain white to the splash video
// so that freezes").
//
// It used to be the film's own first frame at 160px, pre-blurred and inlined
// twice, which was the answer to "i don't want to see a blank brown page
// before the video splash loads" on 2026-08-30. That worked: the wait stopped
// being a flat colour. What it could not stop being was BLURRY, because a
// thumbnail small enough to inline before any JavaScript has no detail to
// give, and the owner read the soft picture as a fault rather than a
// photograph coming into focus.
//
// THE OWNER'S OWN FIX IS THE ONE THAT WORKS, and the reason is worth keeping:
// blurring a flat frame gives you a flat frame. The films now open on white
// and dissolve into the bazaar, so the frame this surface has to match IS
// white, and there is nothing left to be out of focus. That collapses the
// whole arrangement: no thumbnail to generate, none to inline, none to keep in
// step across two files, and about 2.4KB out of index.html.
//
// index.html carries this colour verbatim and src/test/splash-lqip.test.ts
// fails the moment the copies drift. If the films' opening ever stops being
// white, this and the boot <style> both change in the same commit.
//
// WHY NOT PURE WHITE ON THE VIDEO SIDE: the films are yuv420p, so a 255 white
// source decodes at about 253. The posters, which go through JPEG rather than
// h264, land on a true 255. The difference is a fifth of a percent and below
// the eye's floor on a screen; this is the posters' value, because the poster
// is what paints first and longest.
export const SPLASH_PLATE = "#FFFFFF";

/** The overlay's holding surface, matching what index.html's boot style paints
 *  so the surface never changes when React takes over. */
export function splashHoldingStyle(): { backgroundColor: string } {
  return { backgroundColor: SPLASH_PLATE };
}
