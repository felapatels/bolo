// THE CANONICAL TRAIN, AND IT IS A PAINTING NOW (build 21). Owner, with the
// picture: "here is the train image, use it and replace our canonical
// train." A blue-and-gold steam locomotive with a red cowcatcher and its
// own plume of steam, cropped from the full train (assets/journey/
// train-full.png keeps the carriages for anything that wants the whole
// train). Its nameplate was painted "भारतीय रेल" and is blanked to plain red
// in the asset: painted text is the poster trap, and Devanagari on the
// Tamil line is the wrong script. The app can write on the plate later.
//
// This replaced a react-native-svg side-profile engine (indigo body, teal
// trim, spoked wheels that turned, three steam puffs) ported from web's
// train-svg.tsx. What that engine had and this one does not: a tinted
// headlamp (`tint`), a First Class gold recolour (`palette`), wheels that
// rolled. A painting has one paint. Both props are still accepted so the
// six call sites keep compiling, and both are documented no-ops here; First
// Class on the home pass now reads from the ticket's gold, not the engine.
// Web twin: gujarati-coach/src/components/train-svg.tsx, the same picture.
//
// Motion is unchanged (web parity, same keyframe fractions as index.css):
// - motion="drive": home-ticket drive-and-settle on a 4s cycle — the engine
//   noses forward 7px, recoils −1.5px, settles.
// - motion="bob": journey rail-marker bounce on a 2.2s cycle.
// - motion="none" (default): parked engine.
// Reduced motion collapses every variant to the parked frame.
//
// SIZING: `width`/`height` still describe the ENGINE BODY box, so every
// call site keeps its layout. The picture is taller than its body: the
// stack and the steam rise above the cab roof, and in the crop the body
// (roof to rails) is the lower BODY_SHARE of the image's height. So the
// image is sized off `height` (its height is height / BODY_SHARE, its width
// follows the picture's own aspect), anchored to the box's bottom-left, and
// the stack and steam hang above the layout box the way the old svg's steam
// headroom did (RN views don't clip children). Absolute and numeric per the
// TicketParts sizing contract: nothing percentage-sized, and an absolute
// child can never grow the card.
import React from 'react';
import { Image } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { useLoopProgress } from '@/lib/useLoopProgress';

export const TRAIN_LOCO = require('../../assets/journey/train-loco.png') as number;
export const TRAIN_FULL = require('../../assets/journey/train-full.png') as number;

/** The crop's own width over height (600 by 586). */
const LOCO_ASPECT = 600 / 586;
/** How much of the crop's height is the engine body, roof to rails; the
 *  rest is the stack and the steam above it. Measured off the asset. */
const BODY_SHARE = 0.65;

const DRIVE_CYCLE_MS = 4000;
const BOB_CYCLE_MS = 2200;

export type TrainMotion = 'drive' | 'bob' | 'none';

/** The picture's size for a body box of the given height, in points. */
export function trainImageSize(height: number): { width: number; height: number } {
  const h = height / BODY_SHARE;
  return { width: Math.round(h * LOCO_ASPECT), height: Math.round(h) };
}

export function TrainEngine({
  tint: _tint,
  width = 64,
  height = 42,
  motion = 'none',
  palette: _palette,
}: {
  /** Accepted for the six call sites; a painting has no tinted headlamp. */
  tint: string;
  width?: number;
  height?: number;
  motion?: TrainMotion;
  /** Accepted for the six call sites; a painting is not recoloured. */
  palette?: { chassis: string; body: string; trim: string; steam: string };
}) {
  const reduceMotion = useReducedMotion();
  const animated = motion !== 'none' && !reduceMotion;
  const cycleMs = motion === 'bob' ? BOB_CYCLE_MS : DRIVE_CYCLE_MS;
  const progress = useLoopProgress(cycleMs, animated);

  // Whole-engine travel: drive-and-settle (home ticket) or bob (rail
  // marker). Transform-only — never layout props (Expo Go New Arch crash).
  const wrapperStyle = useAnimatedStyle(() => {
    if (!animated) return { transform: [{ translateX: 0 }, { translateY: 0 }] };
    if (motion === 'drive') {
      return {
        transform: [
          {
            translateX: interpolate(
              progress.value,
              [0, 0.5, 0.68, 0.84, 1],
              [0, 0, 7, -1.5, 0],
            ),
          },
          { translateY: 0 },
        ],
      };
    }
    return {
      transform: [
        { translateX: 0 },
        {
          translateY: interpolate(
            progress.value,
            [0, 0.45, 0.55, 0.65, 0.75, 0.85, 1],
            [0, 0, -4, 1.5, -1.8, 0.5, 0],
          ),
        },
      ],
    };
  });

  const img = trainImageSize(height);

  return (
    <Animated.View
      testID="train-engine"
      pointerEvents="none"
      style={[{ width, height, position: 'relative' }, wrapperStyle]}
    >
      <Image
        testID="train-engine-picture"
        source={TRAIN_LOCO}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        resizeMode="contain"
        style={{ position: 'absolute', left: 0, bottom: 0, width: img.width, height: img.height }}
      />
    </Animated.View>
  );
}
