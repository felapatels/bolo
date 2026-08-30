// A muted, looping clip that only costs anything once it is on screen.
//
// Added 2026-08-29 for the landing page's Chacha-ji call loop. Three things it
// does that a bare <video autoplay loop> does not:
//
//  1. `preload="none"` plus an IntersectionObserver. The clip sits well below
//     the fold, and the landing page's whole asset budget is about 120 KB of
//     lazy screenshots; a 229 KB video fetched on load would more than double
//     what the page costs a visitor who never scrolls to it.
//  2. It PAUSES on the way out. An off-screen looping video keeps decoding
//     frames and draining a phone battery for a picture nobody is looking at.
//  3. It honours reduce-motion by never playing at all and showing the poster
//     instead — a looping clip is exactly the kind of thing the setting means.
//     `autoPlay` is deliberately NOT set even so: play() is called from the
//     observer, so there is one code path deciding whether it moves.
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function LoopingVideo({
  src,
  poster,
  /** What the clip shows, for anyone who cannot see it. */
  label,
  className,
  videoClassName,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
  videoClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // play() rejects on its own if the browser blocks autoplay (an
            // unmuted clip, a data-saver mode). The poster stays up; nothing
            // to recover from, so the rejection is swallowed rather than
            // logged at the user.
            //
            // IT DOES NOT ALWAYS RETURN A PROMISE. jsdom leaves play()
            // unimplemented and returns undefined, so a bare `.catch()` here
            // throws TypeError inside the observer callback on every test that
            // renders this. Older Safari returned undefined too. Guard the
            // handle rather than the call.
            const played = el.play();
            if (played && typeof played.catch === "function") {
              played.catch(() => {});
            }
          } else {
            el.pause();
          }
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduceMotion]);

  return (
    <div className={className}>
      <video
        ref={ref}
        src={reduceMotion ? undefined : src}
        poster={poster}
        // muted + playsInline are what make an autoplaying clip legal on iOS
        // Safari at all; without playsInline it takes over the whole screen.
        muted
        loop
        playsInline
        preload="none"
        controls={false}
        aria-label={label}
        data-testid="looping-video"
        className={cn("block h-auto w-full", videoClassName)}
      />
    </div>
  );
}
