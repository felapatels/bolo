// THE BOOT FILM'S FIRST FRAME AT 48 PIXELS WIDE, pre-blurred, inlined. This is
// what the page paints before a single byte of the poster or the film has
// arrived, in place of the flat #89695B plate that used to hold the screen
// (owner, 2026-08-30, off the Repl preview: "i don't want to see a blank brown
// page before the video splash loads"). Each is under 1.2KB of base64, so it
// costs nothing to carry twice: index.html's boot <style> paints it as the
// document background before React mounts, and the splash overlay paints the
// same image as its own background from its first render, so the surface never
// changes when React takes over. The sharp poster and the film then FADE IN
// over it (splash-scene-enter in index.css), which reads as the picture
// coming into focus rather than a cut from a colour to a scene.
//
// index.html carries these two strings verbatim and src/test/splash-lqip.test.ts
// fails the moment the copies drift. Regenerate both from the posters with PIL
// (resize to 48 wide, GaussianBlur 1.2, JPEG quality 62) and paste into both
// places in the same commit.
export const SPLASH_PLATE = "#89695B";

export const SPLASH_LQIP = {
  portrait: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gAPTGF2YzYzLjEuMTAxAP/bAEMADAgJCwkIDAsKCw4NDA4SHhQSERESJRscFh4sJy4uKycrKjE3RjsxNEI0Kis9Uz5CSEpOT04vO1ZcVUxbRk1OS//bAEMBDQ4OEhASJBQUJEsyKzJLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//AABEIAFUAMAMBIgACEQEDEQH/xAAaAAADAAMBAAAAAAAAAAAAAAAABAUCAwYB/8QAKBAAAgICAgICAQMFAAAAAAAAAQIAAwQRBSESMRNBURQiYQYjMkJx/8QAGAEAAwEBAAAAAAAAAAAAAAAAAAEDAgT/xAAgEQACAgEEAwEAAAAAAAAAAAAAAQIRMQMTIUESFFFC/9oADAMBAAIRAxEAPwDncS5qLAZ1ODf+prB1OWXsdS5w2QqjwboyF0zrhH4WAk98JsTRHXc3JWCIOdFaFvCHjG/iEDTFuBRyb8Wrd1NNQouxjtlOh9zZlX/o7PFWM2jMazH2xBBmLfZNKsGdXIXJWPiXyA9yhjco9lRBIV/wZHoyRUfEAam399uSr0gf8g1yCk8nVcbVY9PyW/5NGzWAO5MTJy6KU2gPXqSOQ5DkshvCpSu/xJpOTyb80kSORra3KYD6jGPiscMMO9HueMS1jE+57jZYrDqfRlOXwjNxjbYravneEXofZjtbDGdfA7/mJZZrW1XRjs+xHUq+as66bWxOh6MklJ4OeGtGapZL45ZXSseIOhqTeQ5CxLD8KAH6iNlGRjqjD1F7LX2WJ7/E5lCOUX6NdthLj4x197mZCMvS7b+JpooP+7dRwMla6UCbb+DUeLZMzCxyE66EqVZJpNYC78hqVOAw6Mwub0B8RKGRi4qYL2rWNqdCdXsR21CjlelLcU7IXLWMtFfcn02Ky/3B1G+SRvhR2bYPqR2fXqRiqjTyU/drA09wHozAW7PZim3M8KufuZrpGleWXeL5urAFitslhoQu/qJbMQ44U7J3uQxSPZmYVQPUKQ+Ruy82qAzbA9CKXKCP2w3A6hQ7Ro8jMw51CEZgPIwLmEIxgCdbgXOoQgB//9k=",
  wide: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gAPTGF2YzYzLjEuMTAxAP/bAEMADAgJCwkIDAsKCw4NDA4SHhQSERESJRscFh4sJy4uKycrKjE3RjsxNEI0Kis9Uz5CSEpOT04vO1ZcVUxbRk1OS//bAEMBDQ4OEhASJBQUJEsyKzJLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//AABEIAC8AVAMBIgACEQEDEQH/xAAaAAACAwEBAAAAAAAAAAAAAAADBQIEBgAB/8QAKhAAAgICAQMDAwQDAAAAAAAAAQIAAwQRIQUSEzFBUQYUMhUjUmEzgZH/xAAXAQEBAQEAAAAAAAAAAAAAAAACAwAB/8QAIBEAAwABBAMBAQAAAAAAAAAAAAECEQMSIVETIjFBMv/aAAwDAQACEQMRAD8Ay9YckEA8wwUj8lMuYVRZEIGzL9hrQfvViRukngtppuclTpl4osBI4mjovrsHDCIxVjWjuQlYOtijlS+l+YFXRZPaahQre4ku1Adb5mdFr0L5EtLAe0adLuS6w2272B6Qun9GqGHgnhx4WzqGNUncT/qKc36iABXGqZj86mmqr4ddSi0fGLfGWAaTNXxMPn5uY2R5W7lYyNfWs1R/kaX2V2R8q6Nz450xX69mfznTba7N5ZGHS/wSe9WDWWBVlXGv8VKfJMPdZpgzH1k7T35DpY2AsJHBdPfU6/tqA7/yha3ZLDYg2NSGSoyAXY61NEurwbUtRG5/hLHRhX3u2/6jvpXUaaq3WxBsjQiLpzBk5PG9Rhh4KO1hY+npFraPjyrOadrU/kY35ePZST4xsRVfnMo1RUo/vUrWEIzIHJG5FkdiNcCSWngo2muAN9ltrbsUEyq9TH0rjEAC5QTD5RTQKECNJr4TaERqb+M6MA86dyzbReXZlAX2lykWWAd4/wCyGMF8e9Q5uCjQjvLfANJpTyHrrCgdzcfENi49eWxp3293AMWtcSeYXH6kMO9LNE6PpJpPPH0u8Ncrg0Ff02lW6fLzrcrmz7StkA4HHd8yrZ9Ut52tVPyGtSk/UGya9NwCdx261F7sETMP1/QVz/uFvkyH3jL6GePqV3XnYmVdmUbc4CfdMX3IvcxO9mCA5ku0mPcjnJbqywEAKbM6CRD2+06DM9D5P//Z",
} as const;

/** The overlay's holding surface: the plate under the blurred frame, cover-fit
 *  and centred exactly as the boot style paints it. */
export function splashHoldingStyle(wide: boolean): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
} {
  return {
    backgroundColor: SPLASH_PLATE,
    backgroundImage: `url("${wide ? SPLASH_LQIP.wide : SPLASH_LQIP.portrait}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}
