---
name: QA probe run pitfalls
description: Operational traps when running the qa/*.mjs real-browser probes (output piping, cwd, seeded data).
---

# QA probe run pitfalls

1. **Never pipe a probe through `head`.** `node qa/<probe>.mjs 2>&1 | tee log | head -60` kills the probe mid-run: head exits after N lines, tee dies on SIGPIPE, node gets SIGPIPE on the next console.log. The run looks "successful" but later sections (other viewports, click-throughs) never executed. Redirect to a file (`> /tmp/x.log 2>&1`) and read the file.
2. **Output dirs are cwd-relative.** Probes write screenshots to a relative `qa/shots/...` path; running from inside `qa/` produces `qa/qa/shots/...`. Run probes from the workspace root.
3. **Seeding QA-account data for conditional cards.** Home cards like Latest badge / Recent plays only render with data. Insert rows directly (attempts + badges) for the QA user, then delete by returned ids. The `badges.badge_key` must be a REAL key from the server badge definitions (e.g. `first_phrase`; `first_words` silently renders nothing).
4. **A stale dev API server looks like a client bug.** A probe once found a two-item catalog with no `kind` field, so sections collapsed and counts were wrong — the workspace's API workflow was serving pre-change code. Restart the API workflow before believing a data-shaped probe failure.
5. **Hidden-nav locators.** At mobile width the desktop sidebar links are in the DOM but not visible; `page.locator("a", { hasText })` resolves to the hidden one and times out. Use `a:visible`.

**Why:** each of these burned a probe iteration on the task that fixed the home upsell card reflow (July 2026).
**How to apply:** any time you run or write a `qa/*.mjs` probe.
