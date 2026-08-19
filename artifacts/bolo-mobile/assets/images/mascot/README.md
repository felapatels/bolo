# Bolo! Mascot, Reference Sheet

Meet **Bolo the Parrot**, the friendly face of the Bolo! language-learning app.

## Character

- **Who:** A plump, cheerful cartoon parrot. A parrot is the perfect mascot for a
  "speak-out-loud" app, *bolo* means **speak / say** in Gujarati & Hindi, and the
  parrot (tota / mitthu) is a warm, familiar, beloved character in Indian culture.
- **Personality:** Warm, patient, encouraging, and a little playful. Bolo celebrates
  your wins, listens closely while you practice, and gently cheers you back up after a miss.
- **Art style:** Modern flat vector illustration with soft gradients, rounded shapes,
  thick soft outlines, and gentle shadows. Reads as premium and approachable.

## Palette (Calm & Modern theme)

| Role                  | Color              | Hex       |
|-----------------------|--------------------|-----------|
| Body feathers         | Teal (accent)      | `#0D9488` |
| Wings + head crest    | Indigo (primary)   | `#4F46E5` |
| Beak & feet           | Warm coral-peach   | (accent)  |
| App background        | Near-white         | `#F8FAFC` |
| Text / eyes           | Deep slate         | `#0F172A` |

Energy comes from Bolo's expression and pose, the palette stays calm and modern.

## Poses & when to use them

| File                  | Pose                    | Emotional moment / use it when…                                            |
|-----------------------|-------------------------|----------------------------------------------------------------------------|
| `mascot-wave.png`     | Idle / waving hello     | Greetings, home screen, onboarding, empty states, "welcome back".         |
| `mascot-cheer.png`    | Cheering / celebrating  | Wins, lesson complete, streak milestone, badge earned, level up.          |
| `mascot-thumbsup.png` | Encouraging / thumbs-up | A good attempt, correct answer, decent pronunciation score, progress made.|
| `mascot-thinking.png` | Thinking / listening    | While the learner speaks, a lesson loads, or during a hint/tip.            |
| `mascot-tryagain.png` | Gentle "try again"      | A miss, wrong answer or low score; keep it kind and motivating, not sad.  |

## Asset specs

- **Format:** PNG with transparent background (composites over any screen).
- **Size:** 1024 × 1024 px master (square), safe to scale down for any UI slot.
- **Optimized:** ~120–200 KB each, tuned for both web and mobile bundles.

## Where the assets live

Identical copies are kept in both apps so each can import locally:

- **Web:** `artifacts/gujarati-coach/public/mascot/` → reference as `/mascot/<file>` at runtime.
- **Mobile (Expo):** `artifacts/bolo-mobile/assets/images/mascot/` → `require('.../assets/images/mascot/<file>')`.

> Wiring the mascot into screens and animating it happens in the per-app makeover tasks, this sheet just defines the character and which asset means what.
