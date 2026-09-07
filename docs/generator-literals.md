# What the generators SAY that no input contains

**Companion to `docs/asset-provenance.md`. That file covers art; this one covers
the templates and scripts that EMIT things.** Written 2026-09-07 by India, for
the five forks.

**THE CLASS OF BUG.** A generator can hold a region fact as a literal in its own
source. **Nothing downstream can find it:** it is not in the data, so a data
grep misses it; it is not in the output's input, so a manifest grep misses it;
and it is CORRECT in the parent, so no test or reviewer here will ever flag it.
**It becomes wrong the moment a fork inherits the file, and it reads as verified
because it is generated.**

Found twice on 2026-09-07: India's `wardrobe.mjs` emitting a cap name a sibling
had relabelled, and a sibling's review template carrying "sixteen Central and
Eastern European languages" as a literal in the template rather than the data.

---

## THE COMMAND. Run it in your own fork; do not trust this list.

```bash
grep -rnoiE "(twenty-two|sixteen|ten|six|22|16|10) (South Asian |Indian )?languages?|South Asian|Indian|India|Hindi|Gujarati|Devanagari|railway|station|chai|rupee|bazaar|Delhi|Rajasthan" \
  scripts/src/*.template.html scripts/src/*.ts scripts/*.mjs
```

**Swap the region words for your own** (kopi, harbour, comedor, the spine) and
run it **against your OWN terms too**, because a fork carrying the parent's word
and a fork carrying its own word are both findings: the first is inherited, the
second is where a future fork will inherit from you.

---

## WHAT INDIA CARRIES, AND EVERY LINE OF IT IS CORRECT HERE

That is the point. **None of these is a bug in the parent, and all of them are
false in a fork that takes the file unchanged.**

### The count, in three places

| file | literal |
|---|---|
| `scripts/src/aksharmala.template.html:199` | "twenty-two South Asian languages" |
| `scripts/src/generateStoryStills.ts:11, 57` | "22 languages", "twenty-two" |
| `scripts/src/buildProvisionalGlyphs.ts:5, 76` | "22 languages" |

**A fork with ten languages inherits a confident twenty-two**, in a page real
contributors read and in two scripts' own headers.

### The currency noun, emitted into UI

`scripts/wardrobe-place.mjs` builds HTML with the word baked in:

```
line 1648   v + " Chai"
line 1651   e.bands[i.costBand] + " Chai <span ...>(band)</span>"
line  100   "Chai price must be a whole number, 0 or more"
line  640   "Deleting it takes away something a learner paid Chai for..."
```

**X33 settled that `chai` is the WIRE identifier and each client renders its own
word.** This is the other half of that ruling and it was never swept: **a
generator writing the display noun straight into markup**. A kopi fork's tooling
says Chai four times.

### Language and script names

| file | literal |
|---|---|
| `scripts/src/aksharmala.template.html:339` | "Devanagari" mapped to "Hindi, Marathi, Nepali, Sanskrit, Konkani, Bodo, Maithili, Dogri, Sindhi" |
| `aksharmala.template.html:352, 366` | "Devanagari", and the `Noto+Sans+Devanagari` font request |
| `scripts/src/completeAlphabets.ts:60` | "hindi" and "Devanagari" as defaults |

**A script-to-language mapping is the densest region fact in the repo** and it
sits in a template, not in content.

---

## HOW TO ANSWER EACH ONE

**Not by deleting the literal.** A number in a header comment is documentation
and deleting it loses information. The three answers, in order of preference:

1. **Derive it.** `scripts` can count the languages it already loads rather than
   stating a total. This is right for every COUNT.
2. **Parameterise it.** The currency noun and the script mapping belong in the
   fork's own config, read at generate time.
3. **Mark it.** Where neither is worth the work, put `REGION:` at the start of
   the line so the next fork's grep finds it in one pass. **A literal nobody can
   find is the whole problem; a labelled one is just a fact.**

**Nothing in this file has been changed.** It is a list, not a fix, because
changing a generator's output shape in the parent while five forks are mid-port
is how a small correction becomes six merge conflicts.
