# growth-board

Generates the Nest growth page, `artifacts/api-server/assets/nest-growth.html`.

**That HTML is committed output, not source.** It is 123,139 bytes and holds 66
finished captions plus a 35 day plan. Editing it by hand works until the next
rebuild silently reverts you. **Edit the data here and rebuild, never the generated
file.** Same rule as the aksharmala page in CLAUDE.md, and for the same reason.

## Rebuild

```bash
cd tools/growth-board
python3 gen.py ../../artifacts/api-server/assets/nest-growth.html nest
```

**The trailing `nest` argument is load bearing.** It does four things, and the
build is not correct without any of them:

1. drops the Google Fonts `<link>`
2. **replaces the three font NAMES with system stacks**
3. wraps the fragment in a real document, doctype through `</html>`
4. labels the footer "Canonical copy" rather than "Mirror"

Without `nest` you get the artifact variant: a fragment, with Google Fonts, labelled
a mirror.

## Reproducibility

`python3 gen.py <out> nest` reproduces the committed file **byte for byte**,
123,139 bytes, trailing newline included. Verify before committing any change here:

```bash
python3 gen.py /tmp/growth-check.html nest
cmp /tmp/growth-check.html ../../artifacts/api-server/assets/nest-growth.html
```

Silence means identical. **If that command prints anything, do not commit**, because
the next person to rebuild loses whatever the difference is.

**This is not hypothetical.** The first version of nest mode dropped the font `<link>`
but left the font names, so a rebuild would have named Archivo Narrow, Instrument Sans
and IBM Plex Mono, three faces that can never load without the link it had just
removed. The Nest session caught it by running `cmp` before committing, which is
exactly why that check is written down here.

## Where the content lives

- `data.py` — the 22 languages, their greetings, their community hashtags, the 17
  pillar assets and their captions, and the week to slot mapping.
  **The greetings were read off the shipped `duo-d*` campaign cards, not invented.**
  Keep them matched to those cards; that is the whole reason this is a data file.
- `sections.py` — the channel ranking, the GRID SEEDING runbook (`GRID_BADGE`,
  `GRID_SEED`, `GRID_LAYOUT`, `GRID_HELD`, added 2026-08-27), the launch night
  runbook, the three WhatsApp
  scripts and the 35 day plan.
- `gen.py` — layout, CSS, and the runtime script.

## The one trap

Every date is computed at runtime from the launch-day picker. There are no dates in
the markup, only `data-off` day offsets. **If the markup is ever inlined anywhere
else, the script at the bottom must travel with it** or every date renders blank.

## No external requests

The nest build makes none: no fetch, no script src, no stylesheet link, no `@import`,
no external host. All state is `localStorage` in try/catch under `bolo-board-launch`
and `bolo-board-v2`. Nothing talks to the API. Keep it that way; it is the property
that lets the page be served from anywhere without a CSP argument.
