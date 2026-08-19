# Bolo! Social Clip Covers

Static 9:16 (1080×1920) cover / poster frames — one per social clip — for the
TikTok / Reels feed grid and the pre-playback thumbnail. On-brand with the clips:
indigo/teal palette, Inter + Noto scripts, and the Bolo parrot mascot. Hook text
is kept in the upper two-thirds, clear of the platform bottom caption/UI safe zone.

| File | Clip | Hook |
| --- | --- | --- |
| `cover-1-roots.png` | Clip 1 — Get back to your roots | "Get back to your roots" (नमस्ते / mascot waving) |
| `cover-2-how-it-works.png` | Clip 2 — How it works (Demo) | "Stop typing. Start speaking." (AI feedback demo) |
| `cover-3-languages.png` | Clip 3 — Breadth + CTA | "22 official languages. One app." |

## Regenerating

```bash
node scripts/gen-covers.mjs
```

The script renders self-contained HTML posters with headless Chromium. Set
`CHROME_BIN` to override the Chromium binary path if the pinned Nix store path
no longer resolves.
