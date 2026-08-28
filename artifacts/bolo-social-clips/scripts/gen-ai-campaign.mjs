// Generates the "It's learning your pace" campaign: the AI-capability set.
//
// Sibling of gen-duo-campaign.mjs and shares its pipeline and its footer
// lockup. Visually it is deliberately the OPPOSITE register: the Duo campaign
// is light, warm and playful; this one is dark, precise and instrument-like,
// because the thing being sold here is measurement.
//
// WHAT IS TRUE TODAY, verified against the code 2026-08-22. Every claim in
// these assets traces to one of these:
//   - Real learner audio reaches an audio model. `gpt-audio` appears 19 times
//     in artifacts/api-server/src/routes/openai.ts. Scoring v2 shipped, so the
//     transcript-only, accent-blind v1 pipeline described in
//     docs/specs/pronunciation-scoring-v2.md is HISTORY, not current behaviour.
//   - Five bands with real thresholds, from lib/scoreBands.ts:
//     perfect >= 91, great 80-90, good 68-79, almost 55-67, retry < 55.
//   - Every attempt updates per-phrase FSRS memory state. routes/learning.ts
//     calls applyFsrsRating on the attempt write path; ts-fsrs v5 at
//     request_retention 0.85, maximum_interval 365 (lib/fsrsScheduler.ts).
//   - GET /review/phrases orders by FSRS due date, soonest-due first. It is a
//     Bolo! Plus feature.
//
// WHAT MUST NOT BE CLAIMED, owner's ruling 2026-08-22: the app is LEARNING the
// learner's pace, it is not yet ADJUSTING to it. Adaptive difficulty needs the
// data first. So every line here is about measuring, grading and remembering.
// "Adapts to you", "adjusts to your level", "personalised lesson plan" are all
// out until that ships. The one asset that touches it (g-next) frames it
// explicitly as not-yet.
//
// Usage: CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//          node scripts/gen-ai-campaign.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMG = resolve(ROOT, 'public/images');
const WEB_PUBLIC = resolve(ROOT, '../gujarati-coach/public');
// PLAY_SOON=1 renders the Google Play badge muted under a "coming soon"
// caption and writes to a parallel directory, so a full set exists for a
// launch that happens before the Android listing leaves closed testing.
// Mirrors what the web app already does behind PLAY_STORE_LIVE = false.
const PLAY_SOON = process.env.PLAY_SOON === '1';
const OUT = resolve(ROOT, 'campaign-ai' + (PLAY_SOON ? '-playsoon' : ''));
const TMP = '/tmp/bolo-ai-campaign';

const CHROME =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

// The mascot, from the WEB APP'S canonical set, not the copies that used to
// sit in this artifact's public/images. Those are stale: mascot-listen and
// mascot-thinking there are an OLD, off-model character (a flat blue blob in a
// different art style entirely), and shipping one of those as the face of a
// campaign is exactly the mistake this comment exists to prevent.
// Canonical poses are wave, cheer, thumbsup, thinking, tryagain. There is no
// "listen" pose; thinking is the one that reads as listening.
const MASCOT_DIR = resolve(ROOT, '../gujarati-coach/public/mascot');
const b64 = (n) =>
  `data:image/png;base64,${readFileSync(resolve(MASCOT_DIR, n)).toString('base64')}`;
const mascot = {
  wave: b64('mascot-wave.png'),
  cheer: b64('mascot-cheer.png'),
  thumbsup: b64('mascot-thumbsup.png'),
  thinking: b64('mascot-thinking.png'),
  tryagain: b64('mascot-tryagain.png'),
};

const svg64 = (p) =>
  `data:image/svg+xml;base64,${readFileSync(p).toString('base64')}`;
const APPLE_BADGE = svg64(resolve(WEB_PUBLIC, 'appstore-badge.svg'));
const PLAY_BADGE = svg64(resolve(WEB_PUBLIC, 'googleplay-badge.svg'));

// Google bakes clear space into their badge (ink is 53.333/79.433 of the file);
// Apple's is edge to edge. Give Play a taller box and pull the margin back out
// so both inks land at the same optical height. Same correction as the web app.
const PLAY_INK_RATIO = 53.333 / 79.433;
const playBox = (h) => h / PLAY_INK_RATIO;
const playBleed = (h) => (playBox(h) - h) / 2;

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@500..800&family=Noto+Sans+Tamil:wght@500..800&family=Noto+Sans+Gujarati:wght@500..800&display=swap');
`;

const base = (w, h) => `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${w}px; height:${h}px; }
  body { font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow:hidden; }
  .stage { position:relative; width:${w}px; height:${h}px; overflow:hidden;
    background:radial-gradient(120% 80% at 50% -12%, #4F46E5 0%, #3730A3 26%, #1E1B4B 62%, #0B0A1F 100%); }
  .grid{position:absolute;inset:0;opacity:.08;
    background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
    background-size:88px 88px;}
  .mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
  .devanagari{font-family:'Noto Sans Devanagari',sans-serif;}
  .tamil{font-family:'Noto Sans Tamil',sans-serif;}
  .gujarati{font-family:'Noto Sans Gujarati',sans-serif;}
`;

// Shared footer lockup, dark variant on every asset in this set.
const lockupCss = ({ inkH, url, gap }) => `
  .lockup{position:absolute;left:0;right:0;display:flex;flex-direction:column;
    align-items:center;gap:${gap}px;}
  .langbar{max-width:95%;text-align:center;font-weight:600;
    font-size:${url >= 44 ? 17 : 15}px;line-height:1.5;letter-spacing:.01em;
    color:rgba(199,210,254,.62);margin-bottom:${Math.round(gap * 0.35)}px;}
  .lockup .url{display:inline-flex;align-items:center;gap:${Math.round(url * 0.34)}px;
    font-weight:900;font-size:${url}px;letter-spacing:-1.5px;color:#fff;}
  .lockup .url .dot{width:${Math.round(url * 0.58)}px;height:${Math.round(url * 0.58)}px;
    border-radius:50%;background:linear-gradient(135deg,#818CF8,#2DD4BF);
    box-shadow:0 0 0 5px rgba(255,255,255,.22);}
  .badges{display:flex;align-items:${PLAY_SOON ? 'flex-start' : 'center'};
    gap:${Math.round(inkH * 0.34)}px;}
  .playcol{display:flex;flex-direction:column;align-items:center;}
  .soon{font-weight:800;font-size:${Math.round(inkH * 0.30)}px;letter-spacing:.14em;
    text-transform:uppercase;color:rgba(199,210,254,.72);margin-top:${Math.round(inkH * 0.06)}px;}
  .badges img{display:block;max-width:none;}
  .badges .apple{height:${inkH}px;width:auto;}
  .badges .play{height:${playBox(inkH).toFixed(1)}px;width:auto;
    margin:-${playBleed(inkH).toFixed(1)}px;
    ${PLAY_SOON ? 'filter:grayscale(1);opacity:.42;' : ''}}
`;
const lockupHtml = `
  <div class="lockup">
    <div class="langbar">Hindi &middot; Punjabi &middot; Urdu &middot; Bengali &middot; Tamil &middot; Telugu &middot; Gujarati &middot; Marathi &middot; Assamese &middot; Bodo &middot; Dogri &middot; Kannada &middot; Kashmiri &middot; Konkani &middot; Maithili &middot; Malayalam &middot; Manipuri &middot; Nepali &middot; Odia &middot; Sanskrit &middot; Santali &middot; Sindhi</div>
    <div class="url"><span class="dot"></span><span>TryBolo.app</span></div>
    <div class="badges">
      <img class="apple" src="${APPLE_BADGE}" alt="Download on the App Store"/>
      <div class="playcol">
        <img class="play" src="${PLAY_BADGE}" alt="Get it on Google Play"/>
        ${PLAY_SOON ? '<span class="soon">Coming soon</span>' : ''}
      </div>
    </div>
  </div>`;

// A fixed pseudo-waveform. Deterministic on purpose: Math.random would make
// every rebuild a different picture and the set would drift out of family.
const WAVE = [
  14, 26, 41, 33, 58, 74, 52, 88, 96, 71, 54, 38, 62, 84, 100, 79, 61, 44,
  29, 46, 68, 91, 73, 50, 34, 22, 40, 57, 76, 63, 45, 30, 19, 28, 43, 36,
];
const waveBars = (opts) =>
  WAVE.map((v, i) => {
    const h = Math.max(opts.min, Math.round((v / 100) * opts.max));
    const hot = i >= opts.hotFrom && i <= opts.hotTo;
    return `<span style="height:${h}px;background:${
      hot ? '#2DD4BF' : 'rgba(255,255,255,.30)'
    }"></span>`;
  }).join('');

// ---------------------------------------------------------------------------
// A — The thesis. "It's learning your pace."
// ---------------------------------------------------------------------------
const hero = (w, h, o) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(w, h)}
  ${lockupCss({ inkH: o.inkH, url: o.url, gap: o.lockGap })}
  .kicker{position:absolute;top:${o.kickerTop}px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:700;letter-spacing:.34em;text-transform:uppercase;font-size:${o.kicker}px;}
  .headline{position:absolute;top:${o.headTop}px;left:56px;right:56px;text-align:center;color:#fff;
    font-weight:900;font-size:${o.head}px;line-height:1.0;letter-spacing:-3px;}
  .headline .t{background:linear-gradient(100deg,#5EEAD4,#818CF8);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .wave{position:absolute;top:${o.waveTop}px;left:0;right:0;height:${o.max}px;
    display:flex;align-items:center;justify-content:center;gap:${o.gap}px;}
  .wave span{width:${o.bar}px;border-radius:99px;display:block;}
  .sub{position:absolute;top:${o.subTop}px;left:${o.subPad}px;right:${o.subPad}px;text-align:center;
    color:#C7D2FE;font-weight:600;font-size:${o.sub}px;line-height:1.4;}
  .sub b{color:#fff;font-weight:800;}
  .mascot{position:absolute;bottom:${o.mascotBottom}px;left:50%;transform:translateX(-50%);
    width:${o.mascot}px;filter:drop-shadow(0 30px 44px rgba(0,0,0,.5));}
  .lockup{bottom:${o.lock}px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">AI-driven</div>
    <h1 class="headline">It's learning<br/><span class="t">your pace.</span></h1>
    <div class="wave">${waveBars({ min: o.min, max: o.max, hotFrom: 12, hotTo: 22 })}</div>
    <div class="sub">Every word you say out loud is <b>heard, graded and remembered</b>.<br/>22 languages. From the very first phrase.</div>
    <img class="mascot" src="${mascot.thinking}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// B — The grading ladder. The real five bands and the real thresholds.
// ---------------------------------------------------------------------------
const BANDS = [
  { n: 'Perfect', r: '91 – 100', c: '#2DD4BF', w: 100 },
  { n: 'Great',   r: '80 – 90',  c: '#5EEAD4', w: 84 },
  { n: 'Good',    r: '68 – 79',  c: '#818CF8', w: 68 },
  { n: 'Almost',  r: '55 – 67',  c: '#A5B4FC', w: 52 },
  { n: 'Retry',   r: 'under 55', c: '#F0ABFC', w: 36 },
];
const bands = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1920)}
  ${lockupCss({ inkH: 52, url: 48, gap: 18 })}
  .kicker{position:absolute;top:130px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:700;letter-spacing:.34em;text-transform:uppercase;font-size:29px;}
  .headline{position:absolute;top:196px;left:60px;right:60px;text-align:center;color:#fff;
    font-weight:900;font-size:88px;line-height:1.0;letter-spacing:-3px;}
  .sub{position:absolute;top:392px;left:90px;right:90px;text-align:center;color:#C7D2FE;
    font-weight:600;font-size:33px;line-height:1.4;}
  .ladder{position:absolute;top:518px;left:74px;right:74px;display:flex;flex-direction:column;gap:24px;}
  .band{background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.13);
    border-radius:26px;padding:26px 32px;position:relative;overflow:hidden;}
  .band .fill{position:absolute;left:0;top:0;bottom:0;opacity:.20;}
  .band .row{position:relative;display:flex;align-items:baseline;justify-content:space-between;gap:20px;}
  .band .nm{font-weight:900;font-size:54px;letter-spacing:-1.5px;}
  .band .rg{font-weight:700;font-size:31px;color:#C7D2FE;letter-spacing:.02em;}
  .note{position:absolute;top:1244px;left:80px;right:80px;text-align:center;
    color:#A5B4FC;font-weight:600;font-size:28px;line-height:1.45;}
  .note b{color:#fff;font-weight:800;}
  .lockup{bottom:58px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">Every single attempt</div>
    <h1 class="headline">You get a real<br/>score. Not a tick.</h1>
    <div class="sub">Five bands, the same ones the app grades on.</div>
    <div class="ladder">
      ${BANDS.map((b) => `<div class="band">
        <div class="fill" style="width:${b.w}%;background:${b.c}"></div>
        <div class="row"><span class="nm" style="color:${b.c}">${b.n}</span>
        <span class="rg mono">${b.r}</span></div>
      </div>`).join('')}
    </div>
    <div class="note">Every one of them is <b>logged against that phrase, for you</b>.</div>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// C — The differentiator. Audio in, not text matching.
// ---------------------------------------------------------------------------
const listens = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1920)}
  ${lockupCss({ inkH: 52, url: 48, gap: 18 })}
  .kicker{position:absolute;top:126px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:700;letter-spacing:.34em;text-transform:uppercase;font-size:29px;}
  .headline{position:absolute;top:192px;left:58px;right:58px;text-align:center;color:#fff;
    font-weight:900;font-size:92px;line-height:1.0;letter-spacing:-3px;}
  .headline .t{background:linear-gradient(100deg,#5EEAD4,#818CF8);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .cards{position:absolute;top:520px;left:70px;right:70px;display:flex;flex-direction:column;gap:26px;}
  .c{border-radius:32px;padding:36px 38px;border:2px solid;}
  .c .lb{font-weight:700;font-size:24px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:16px;}
  .c .big{font-weight:900;font-size:50px;letter-spacing:-1.6px;line-height:1.14;}
  .c.no{background:rgba(248,113,113,.10);border-color:rgba(248,113,113,.34);}
  .c.no .lb{color:#FCA5A5;} .c.no .big{color:#FECACA;}
  .c.yes{background:rgba(45,212,191,.12);border-color:rgba(45,212,191,.40);}
  .c.yes .lb{color:#5EEAD4;} .c.yes .big{color:#fff;}
  .wave{position:absolute;top:1234px;left:0;right:0;height:120px;
    display:flex;align-items:center;justify-content:center;gap:9px;}
  .wave span{width:11px;border-radius:99px;display:block;}
  .verdict{position:absolute;top:1408px;left:72px;right:72px;text-align:center;
    color:#C7D2FE;font-weight:600;font-size:33px;line-height:1.42;}
  .verdict b{color:#fff;font-weight:800;}
  .mascot{position:absolute;bottom:300px;right:34px;width:214px;
    filter:drop-shadow(0 28px 38px rgba(0,0,0,.5));}
  .lockup{bottom:58px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">How the scoring works</div>
    <h1 class="headline">It doesn't check<br/>spelling. It <span class="t">listens.</span></h1>
    <div class="cards">
      <div class="c no">
        <div class="lb">Not this</div>
        <div class="big">Matching your words<br/>against a transcript</div>
      </div>
      <div class="c yes">
        <div class="lb">This</div>
        <div class="big">Your actual recording,<br/>sent to an audio model</div>
      </div>
    </div>
    <div class="wave">${waveBars({ min: 8, max: 108, hotFrom: 9, hotTo: 26 })}</div>
    <div class="verdict">So it hears <b>how you said it</b>, not just<br/>whether the right word came out.</div>
    <img class="mascot" src="${mascot.thinking}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// D — Memory. Spaced review, driven by your own scores.
// ---------------------------------------------------------------------------
const memory = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14 })}
  .kicker{position:absolute;top:66px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:700;letter-spacing:.32em;text-transform:uppercase;font-size:25px;}
  .headline{position:absolute;top:120px;left:56px;right:56px;text-align:center;color:#fff;
    font-weight:900;font-size:76px;line-height:1.02;letter-spacing:-2.4px;}
  .headline .t{background:linear-gradient(100deg,#5EEAD4,#818CF8);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .rows{position:absolute;top:352px;left:80px;right:80px;display:flex;flex-direction:column;gap:16px;}
  .r{display:flex;align-items:center;gap:20px;background:rgba(255,255,255,.07);
    border:2px solid rgba(255,255,255,.12);border-radius:22px;padding:17px 26px;}
  .r .ph{flex:1;font-weight:800;font-size:36px;color:#fff;line-height:1.2;}
  .r .st{font-weight:700;font-size:23px;letter-spacing:.05em;white-space:nowrap;}
  .r.due{border-color:rgba(45,212,191,.5);background:rgba(45,212,191,.13);}
  .r.due .st{color:#5EEAD4;}
  .r.ok .st{color:#818CF8;}
  .sub{position:absolute;top:690px;left:74px;right:74px;text-align:center;color:#C7D2FE;
    font-weight:600;font-size:29px;line-height:1.42;}
  .sub b{color:#fff;font-weight:800;}
  .mascot{position:absolute;bottom:12px;right:24px;width:148px;
    filter:drop-shadow(0 24px 32px rgba(0,0,0,.5));}
  .lockup{bottom:40px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">It remembers</div>
    <h1 class="headline">It knows which<br/>words are <span class="t">slipping.</span></h1>
    <div class="rows">
      <div class="r due"><span class="ph devanagari">नमस्ते</span><span class="st mono">DUE TODAY</span></div>
      <div class="r ok"><span class="ph tamil">வணக்கம்</span><span class="st mono">IN 6 DAYS</span></div>
      <div class="r ok"><span class="ph gujarati">કેમ છો?</span><span class="st mono">IN 21 DAYS</span></div>
    </div>
    <div class="sub">Every phrase gets its own schedule, built from<br/><b>how well you actually said it</b>.</div>
    <img class="mascot" src="${mascot.thinking}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// E — Conversation.
// ---------------------------------------------------------------------------
const chat = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14 })}
  .kicker{position:absolute;top:66px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:700;letter-spacing:.32em;text-transform:uppercase;font-size:25px;}
  .headline{position:absolute;top:120px;left:56px;right:56px;text-align:center;color:#fff;
    font-weight:900;font-size:78px;line-height:1.02;letter-spacing:-2.4px;}
  .headline .t{background:linear-gradient(100deg,#5EEAD4,#818CF8);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .thread{position:absolute;top:340px;left:78px;right:78px;display:flex;flex-direction:column;gap:16px;}
  .b{max-width:80%;border-radius:30px;padding:19px 28px;font-weight:700;font-size:34px;line-height:1.3;}
  .b.them{align-self:flex-start;background:rgba(255,255,255,.12);color:#fff;
    border:2px solid rgba(255,255,255,.16);border-bottom-left-radius:10px;}
  .b.you{align-self:flex-end;background:linear-gradient(120deg,#4F46E5,#0D9488);color:#fff;
    border-bottom-right-radius:10px;}
  .b .rom{display:block;margin-top:7px;font-size:20px;font-weight:600;opacity:.72;letter-spacing:.04em;}
  .sub{position:absolute;top:762px;left:74px;right:74px;text-align:center;color:#C7D2FE;
    font-weight:600;font-size:29px;line-height:1.42;}
  .sub b{color:#fff;font-weight:800;}
  .mascot{position:absolute;bottom:12px;right:24px;width:148px;
    filter:drop-shadow(0 24px 32px rgba(0,0,0,.5));}
  .lockup{bottom:40px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">Talk to Bolo</div>
    <h1 class="headline">A conversation,<br/><span class="t">out loud.</span></h1>
    <div class="thread">
      <div class="b them"><span class="devanagari">आप कैसे हैं?</span><span class="rom">aap kaise hain?</span></div>
      <div class="b you"><span class="devanagari">मैं ठीक हूँ!</span><span class="rom">main theek hoon!</span></div>
      <div class="b them"><span class="devanagari">बहुत बढ़िया!</span><span class="rom">bahut badhiya!</span></div>
    </div>
    <div class="sub">He talks, you talk back. <b>No typing.</b><br/>In any of the 22 languages.</div>
    <img class="mascot" src="${mascot.cheer}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// F — The roadmap tease. The ONE asset that touches adaptation, and it is
// explicit that it has not shipped. Optional: hold it until it has.
// ---------------------------------------------------------------------------
const next = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14 })}
  .kicker{position:absolute;top:82px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:700;letter-spacing:.32em;text-transform:uppercase;font-size:25px;}
  .headline{position:absolute;top:180px;left:60px;right:60px;text-align:center;color:#fff;
    font-weight:900;font-size:82px;line-height:1.04;letter-spacing:-2.6px;}
  .rule{position:absolute;top:466px;left:50%;transform:translateX(-50%);width:120px;height:5px;
    border-radius:99px;background:linear-gradient(90deg,#5EEAD4,#818CF8);}
  .beat{position:absolute;top:530px;left:60px;right:60px;text-align:center;
    font-weight:900;font-size:82px;line-height:1.04;letter-spacing:-2.6px;
    background:linear-gradient(100deg,#5EEAD4,#818CF8);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .sub{position:absolute;top:790px;left:80px;right:80px;text-align:center;color:#C7D2FE;
    font-weight:600;font-size:29px;line-height:1.42;}
  .mascot{position:absolute;bottom:12px;right:24px;width:142px;
    filter:drop-shadow(0 24px 32px rgba(0,0,0,.5));}
  .lockup{bottom:40px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">What's coming</div>
    <h1 class="headline">Right now it's<br/>learning your pace.</h1>
    <div class="rule"></div>
    <div class="beat">Next, it starts<br/>setting it.</div>
    <div class="sub">Every attempt you record is teaching it what<br/>you need. That is the groundwork.</div>
    <img class="mascot" src="${mascot.thumbsup}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const jobs = [
  { slug: 'a1-learning-your-pace-9x16', w: 1080, h: 1920, html: hero(1080, 1920, {
      kickerTop: 150, kicker: 30, headTop: 216, head: 116,
      waveTop: 520, min: 10, max: 150, bar: 13, gap: 11,
      subTop: 780, sub: 35, subPad: 84,
      mascot: 470, mascotBottom: 372, lock: 58, inkH: 52, url: 48, lockGap: 18,
    }) },
  { slug: 'a2-learning-your-pace-1x1', w: 1080, h: 1080, html: hero(1080, 1080, {
      kickerTop: 74, kicker: 25, headTop: 126, head: 90,
      waveTop: 336, min: 8, max: 104, bar: 11, gap: 9,
      subTop: 486, sub: 29, subPad: 76,
      mascot: 262, mascotBottom: 178, lock: 40, inkH: 40, url: 38, lockGap: 14,
    }) },
  { slug: 'b-five-bands-9x16', w: 1080, h: 1920, html: bands },
  { slug: 'c-it-listens-9x16', w: 1080, h: 1920, html: listens },
  { slug: 'd-remembers-1x1', w: 1080, h: 1080, html: memory },
  { slug: 'e-talk-to-bolo-1x1', w: 1080, h: 1080, html: chat },
  { slug: 'f-whats-next-1x1', w: 1080, h: 1080, html: next },
];

for (const j of jobs) {
  const htmlPath = resolve(TMP, `${j.slug}.html`);
  const pngPath = resolve(OUT, `${j.slug}.png`);
  writeFileSync(htmlPath, j.html);
  execFileSync(
    CHROME,
    [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--default-background-color=00000000',
      `--window-size=${j.w},${j.h}`, '--virtual-time-budget=20000',
      `--screenshot=${pngPath}`, `file://${htmlPath}`,
    ],
    { stdio: 'ignore' },
  );
  console.log(`wrote ${j.slug}.png`);
}
console.log(`\ndone: ${jobs.length} assets in ${OUT}`);
