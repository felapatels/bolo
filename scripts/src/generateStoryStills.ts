/**
 * Tier 1 stills for the storybook: one illustration per scene.
 *
 * The storybook's whole mechanic is "a scene is SHOWN, the learner picks the
 * line that fits it". Without the picture there is no scene, and the situation
 * sentence rendered in a card is not a placeholder for the mechanic, it is a
 * substitute for it. This is what turns the page into the thing it was
 * designed as.
 *
 * WHY A SCRIPT AND NOT A ROUTE. These are language-neutral assets paid for
 * ONCE and served to all 22 languages, which is the entire cost model behind
 * Tier 1 (lib/story/src/types.ts). Generating at request time would pay per
 * learner for an image that never changes, and would put a 10-second image
 * call on the critical path of a game about tapping quickly.
 *
 * WRITES TO BOTH CLIENTS. Web serves from public/, the phone bundles from
 * assets/, and there is no shared asset directory in this monorepo. One script
 * writing both is the only arrangement where they cannot drift.
 *
 * Run:  pnpm --filter @workspace/scripts run generate-story-stills
 *       ... --force        regenerate stills that already exist
 *       ... --scene door-1 just that one, for iterating on a prompt
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STORY_BOOKS,
  outcomeStillId,
  setupStillId,
  type Scene,
} from "@workspace/story";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../..");
const OUT_DIRS = [
  path.join(REPO, "artifacts/gujarati-coach/public/story"),
  path.join(REPO, "artifacts/bolo-mobile/assets/story"),
];

const force = process.argv.includes("--force");
const onlyIdx = process.argv.indexOf("--scene");
const onlyScene = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

/**
 * The house style, on every prompt.
 *
 * TEN IMAGES HAVE TO READ AS ONE BOOK, and a per-scene prompt alone will not
 * do that: the same sentence generated twice comes back in two different
 * styles. So the style is stated identically every time and only the moment
 * changes.
 *
 * NO TEXT IN THE IMAGE, stated twice because models put signs and labels into
 * domestic scenes by default. A word baked into a Tier 1 still would be in one
 * language, and the whole point of Tier 1 is that it serves all twenty-two.
 *
 * NO SPEECH BUBBLES for the same reason, and because the lines the learner
 * chooses between are the game. An illustration that shows what somebody said
 * has answered the question.
 */
const STYLE = [
  "Warm, friendly children's-book illustration.",
  "Soft gouache texture, clean confident linework, gentle rounded shapes.",
  "Warm palette: terracotta, saffron, deep teal, cream. Soft natural light.",
  "Contemporary South Asian domestic setting, lived-in and specific rather than generic.",
  "Full scene with clear depth. The people are mid-shot, faces readable and expressive.",
  "ABSOLUTELY NO TEXT, no letters, no numbers, no signs, no labels, no writing of any kind anywhere in the image.",
  "No speech bubbles, no captions, no watermarks, no borders.",
].join(" ");

/**
 * The recurring cast, per book.
 *
 * The same people appear across a book's five scenes, so they are described
 * identically in every prompt of that book. Without this the grandmother is a
 * different woman in each panel and the five images stop being a story.
 */
const CAST: Record<string, string> = {
  "j1z1-greetings": [
    "RECURRING CHARACTER, draw her identically in every image of this set:",
    "an older South Asian woman in her seventies, silver hair pulled into a low bun,",
    "small round glasses, a soft green cotton sari with a thin gold border,",
    "warm crinkled smile, slightly stooped.",
    "Her home: a modest ground-floor flat with a painted teal doorframe and a brass lamp above it.",
  ].join(" "),
  "j1z2-family": [
    "RECURRING CHARACTERS, draw them identically in every image of this set:",
    "a grandmother in her seventies in a deep red sari with white hair in a bun and gold bangles;",
    "a man in his forties in a pale blue kurta with a neatly trimmed beard.",
    "Their home: a bright family kitchen with a steel-topped table, a window with a jasmine plant.",
  ].join(" "),
};

/** The viewer is the learner, so the scene is framed at them. */
const POV =
  "The viewer is the person being spoken to and is not visible in the frame; the characters look towards the viewer.";

function promptFor(bookId: string, situation: string): string {
  return [STYLE, CAST[bookId] ?? "", POV, "The moment:", situation]
    .filter(Boolean)
    .join("\n\n");
}

/** Every image a book needs: one setup per scene, one outcome per choice. */
type Job = { bookId: string; id: string; situation: string };

function jobsForBook(bookId: string, scenes: readonly Scene[]): Job[] {
  const out: Job[] = [];
  for (const scene of scenes) {
    out.push({
      bookId,
      id: setupStillId(scene.id),
      situation: scene.situation,
    });
    for (const choice of scene.choices) {
      // A choice with no authored consequence simply has no picture, and the
      // client falls back to advancing straight on. Absent, never blank: the
      // same contract the engine uses everywhere else.
      if (!choice.outcome) continue;
      out.push({
        bookId,
        id: outcomeStillId(scene.id, choice.concept),
        situation: choice.outcome.situation,
      });
    }
  }
  return out;
}

/**
 * WHICH ENCODER CAN ACTUALLY WRITE A WEBP, which is not the same question as
 * "is ffmpeg installed".
 *
 * THIS REPLACED A PRESENCE TEST, AND THE PRESENCE TEST WAS ANSWERING THE WRONG
 * QUESTION (East Asia, 2026-09-08, found by RUNNING the thing rather than
 * reading it). The old `haveFfmpeg()` shelled `ffmpeg -version` and returned
 * true if the binary existed. Measured on this Mac:
 *
 *     ffmpeg 9.0.1     present
 *     libx264          present, so every film pipeline is unaffected
 *     webp encoder     ABSENT. Not disabled, not listed at all.
 *     cwebp            present at /opt/homebrew/bin/cwebp
 *
 * So the check said yes, the conversion failed with "Default encoder for format
 * webp is probably disabled", the catch below wrote a PNG, and the run printed
 * `ok`. FIVE OF THE SIX FORKS WERE IN THAT STATE; only bolo-east had cwebp.
 *
 * AND A PNG IS NOT A SLIGHTLY-WORSE WEBP HERE, IT IS A MISSING PICTURE. The
 * clients fetch `<id>.webp` (mediaUrl.ts). A directory full of PNGs is a
 * successful run, a paid-for batch, and a storybook that renders nothing.
 *
 * The fallback itself is still right and is kept: these images cost real money
 * and dying at the conversion step throws away everything already bought in
 * that run. What was wrong was that the fallback was SILENT.
 */
type WebpEncoder = "cwebp" | "ffmpeg" | "none";

function webpEncoder(): WebpEncoder {
  // cwebp FIRST. It is the dedicated tool, it either exists or it does not,
  // and it cannot be present-but-incapable the way ffmpeg just was.
  try {
    execFileSync("cwebp", ["-version"], { stdio: "ignore" });
    return "cwebp";
  } catch {
    // not installed; fall through
  }
  // PROBE THE ENCODER LIST, NEVER THE BINARY. `ffmpeg -version` succeeding tells
  // you nothing about whether this build can emit the format you need.
  try {
    const encoders = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (/\bwebp\b/.test(encoders)) return "ffmpeg";
  } catch {
    // no ffmpeg at all
  }
  return "none";
}

/**
 * PNG in, webp out, and PNG out when there is no ffmpeg.
 *
 * gpt-image-1 returns PNG, and twenty full-size PNGs is several megabytes
 * shipped to every phone and every page load. webp at q82 is a fraction of that
 * with no visible loss at this size, and ffmpeg is already in this toolchain
 * (audioNoise, genBandClips) so it needs no new dependency.
 *
 * BUT IT FALLS BACK RATHER THAN FAILING. These images cost real money, and this
 * runs in the Replit Shell because the OpenAI base URL is a proxy on the Repl's
 * own localhost. Dying at the CONVERSION step would throw away every image
 * already paid for in that run. A larger file is a problem you can fix later;
 * a lost batch is money gone.
 */
function writeStill(
  png: Buffer,
  dir: string,
  id: string,
  encoder: WebpEncoder,
): "webp" | "png" {
  if (encoder === "none") {
    writeFileSync(path.join(dir, `${id}.png`), png);
    return "png";
  }
  const outPath = path.join(dir, `${id}.webp`);
  const tmp = `${outPath}.tmp.png`;
  writeFileSync(tmp, png);

  if (encoder === "cwebp") {
    try {
      // -resize W 0 keeps the aspect ratio, the same job scale=1024:-2 does.
      execFileSync("cwebp", ["-q", "70", "-resize", "1024", "0", tmp, "-o", outPath], {
        stdio: ["ignore", "ignore", "inherit"],
      });
      return "webp";
    } catch {
      writeFileSync(path.join(dir, `${id}.png`), png);
      return "png";
    } finally {
      rmSync(tmp, { force: true });
    }
  }

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        tmp,
        // DOWNSCALED, not just compressed. gpt-image-1's smallest landscape is
        // 1536x1024, and the scene frame is about 600px wide on a phone, so the
        // generated file is already better than 2x before any of this. At 1536
        // and q82 a still lands near 280KB, which is 60MB of git and 30MB
        // bundled into the app once six books exist. 1024 wide at q70 is a
        // fraction of that and is still above 1.5x on the widest surface.
        //
        // -2 keeps the aspect ratio and rounds to an even height, which the
        // encoder requires.
        "-vf",
        "scale=1024:-2",
        "-quality",
        "70",
        outPath,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    return "webp";
  } catch {
    // Keep the pixels. A PNG beside a failed webp is recoverable; a thrown
    // error mid-run is twenty images bought and discarded.
    writeFileSync(path.join(dir, `${id}.png`), png);
    return "png";
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function main(): Promise<void> {
  for (const dir of OUT_DIRS) mkdirSync(dir, { recursive: true });

  const encoder = webpEncoder();
  if (encoder === "none") {
    console.warn(
      "NO WEBP ENCODER (no cwebp, and this ffmpeg cannot emit webp). Writing " +
        "PNG. THE CLIENTS FETCH .webp, so these will NOT render: convert them " +
        "before shipping rather than re-buying them. `brew install webp`.",
    );
  } else {
    console.log(`webp via ${encoder}`);
  }

  /** Counted so a run that produced NOTHING SHIPPABLE cannot read as success. */
  const wrote = { webp: 0, png: 0 };

  const jobs: Job[] = [];
  for (const book of STORY_BOOKS) {
    for (const job of jobsForBook(book.id, book.scenes)) {
      // --scene matches the SCENE, so it pulls a setup and its three outcomes
      // together. Iterating on one beat means looking at all four at once.
      if (onlyScene && !job.id.startsWith(onlyScene)) continue;
      // A PNG COUNTS AS DONE ONLY WHEN NOTHING HERE CAN MAKE A WEBP, and that
      // asymmetry is the whole point. The clients fetch `.webp`, so a PNG is an
      // unfinished asset, not a finished one in another format: once an encoder
      // is available it must be RETRIED rather than skipped. But when there is
      // no encoder at all, a PNG is the best this machine can do and re-buying
      // it every run costs real money for nothing.
      //
      // WRITTEN BECAUSE I ALMOST SHIPPED THE OPPOSITE. The failure message
      // below told the operator that `--force` was not needed, and with a plain
      // `|| .png` here that sentence was FALSE: every PNG would have been
      // skipped on the retry and the run would have reported nothing to do.
      // An instruction that is wrong is worse than no instruction.
      const exists = OUT_DIRS.every(
        (d) =>
          existsSync(path.join(d, `${job.id}.webp`)) ||
          (encoder === "none" && existsSync(path.join(d, `${job.id}.png`))),
      );
      if (exists && !force) continue;
      jobs.push(job);
    }
  }

  if (jobs.length === 0) {
    console.log("Nothing to generate. Pass --force to redo existing stills.");
    return;
  }
  console.log(`Generating ${jobs.length} still(s).`);

  const failures: string[] = [];
  // SEQUENTIAL on purpose. Ten images is not worth a worker pool, and image
  // endpoints rate-limit harder than text ones; a failed batch costs more than
  // the minute saved.
  for (const [i, job] of jobs.entries()) {
    const label = `${i + 1}/${jobs.length} ${job.id}`;
    try {
      const png = await generateImageBuffer(
        promptFor(job.bookId, job.situation),
        "1536x1024",
      );
      if (png.length === 0) throw new Error("empty image buffer");
      // THE LOG NAMES THE FORMAT, because the old success line could not fail.
      // It printed `ok` whether the run produced a shippable webp or a PNG the
      // clients will never request, which is the same shape as a bite test that
      // passes on the unfixed code: a check that cannot distinguish the two
      // outcomes it exists to distinguish.
      const written = new Set<string>();
      for (const dir of OUT_DIRS) {
        written.add(writeStill(png, dir, job.id, encoder));
      }
      for (const f of written) wrote[f as "webp" | "png"] += 1;
      console.log(`  ${label} ok (${[...written].join("+")})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ${label} FAILED: ${msg}`);
      failures.push(`${job.id}: ${msg}`);
    }
  }

  console.log(`\nWrote into:\n  ${OUT_DIRS.join("\n  ")}`);
  console.log(`Formats: ${wrote.webp} webp, ${wrote.png} png`);
  if (wrote.png > 0) {
    // LOUD, AND A NON-ZERO EXIT. A PNG here is not a slightly larger webp, it
    // is a picture the app will never ask for.
    console.error(
      `\n${wrote.png} image(s) written as PNG. THE CLIENTS FETCH .webp, so ` +
        `those stills will not render. Install cwebp (\`brew install webp\`) ` +
        `and re-run; --force is NOT needed, the existing PNGs do not count as done.`,
    );
    process.exitCode = 1;
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

void main();
