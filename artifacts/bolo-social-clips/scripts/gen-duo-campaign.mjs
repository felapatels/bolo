// Generates the "Duo forgot about us. Bolo didn't." social campaign.
//
// Same pipeline as gen-covers.mjs: self-contained HTML posters rendered with
// headless Chromium. Brand: indigo #4F46E5 / teal #0D9488 / accent #14B8A6 /
// gold #F59E0B, Inter + the 13 Noto script families the 22 languages need.
//
// THE FACTUAL CLAIM THIS CAMPAIGN RESTS ON, verified 2026-08-22:
// Duolingo teaches exactly ONE of India's 22 Eighth Schedule languages to
// English speakers: Hindi. Their April 2025 India expansion added Hindi,
// Bengali, Tamil and Telugu as INTERFACE languages (learn Spanish *from*
// Tamil), which is the opposite direction and teaches none of them.
// So: 21 forgotten, 1 taught. Hindi therefore gets its own card and must
// NEVER appear in the "forgot" series, or the whole campaign is falsifiable
// on its most-shared asset.
//
// TRADE DRESS: the word "Duo" appears in copy; the owl, the wordmark and
// Duolingo green (#58CC02) appear nowhere. Truthful comparison is lawful,
// borrowing their marks is not.
//
// Usage: CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//          node scripts/gen-duo-campaign.mjs
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
const OUT = resolve(ROOT, 'campaign-duo' + (PLAY_SOON ? '-playsoon' : ''));
const TMP = '/tmp/bolo-duo-campaign';

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

// The official store badges, straight from the web app's public dir and
// UNMODIFIED: Apple and Google both require their artwork be used as
// distributed, uncropped and unrecoloured.
const svg64 = (p) =>
  `data:image/svg+xml;base64,${readFileSync(p).toString('base64')}`;
const APPLE_BADGE = svg64(resolve(WEB_PUBLIC, 'appstore-badge.svg'));
const PLAY_BADGE = svg64(resolve(WEB_PUBLIC, 'googleplay-badge.svg'));

// Apple's badge is drawn edge to edge, so its box height IS its ink height.
// Google distributes theirs with clear space baked in: the viewBox is
// -13.05 -13.05 206.1 79.433, so the ink is 53.333/79.433 = 0.6714 of the
// file. To land both inks at the same optical height the Play badge gets a
// taller box and a negative margin that pulls the transparent margin back out
// of the layout. Same correction the web app applies (app-store-badge.tsx
// pairs h-[4.5rem] with -m-3 against Apple's h-12); derived here rather than
// hardcoded so any badge height stays aligned.
const PLAY_INK_RATIO = 53.333 / 79.433;
const playBox = (inkH) => inkH / PLAY_INK_RATIO;
const playBleed = (inkH) => (playBox(inkH) - inkH) / 2;

// ---------------------------------------------------------------------------
// The 22 Eighth Schedule languages, mirroring artifacts/gujarati-coach's
// LANGUAGE_PAGES (native name, script family, direction) plus its free
// starter greeting. `duo` marks the one Duolingo actually teaches.
// `scale` trims the native word where a script runs visually large or small
// at poster size; Nastaliq in particular sets small and needs headroom.
// ---------------------------------------------------------------------------
const LANGS = [
  { code:'hi',  name:'Hindi',     native:'हिन्दी',      word:'नमस्ते',      rom:'namaste',    font:'devanagari', duo:true },
  { code:'bn',  name:'Bengali',   native:'বাংলা',       word:'নমস্কার',      rom:'nomoshkar',  font:'bengali' },
  { code:'ta',  name:'Tamil',     native:'தமிழ்',        word:'வணக்கம்',      rom:'vanakkam',   font:'tamil' },
  { code:'te',  name:'Telugu',    native:'తెలుగు',       word:'నమస్తే',       rom:'namaste',    font:'telugu' },
  { code:'mr',  name:'Marathi',   native:'मराठी',       word:'नमस्कार',     rom:'namaskaar',  font:'devanagari' },
  { code:'ur',  name:'Urdu',      native:'اردو',        word:'سلام',        rom:'salaam',     font:'nastaliq',  rtl:true, scale:0.78 },
  { code:'gu',  name:'Gujarati',  native:'ગુજરાતી',      word:'નમસ્તે',       rom:'namaste',    font:'gujarati' },
  { code:'kn',  name:'Kannada',   native:'ಕನ್ನಡ',        word:'ನಮಸ್ಕಾರ',      rom:'namaskara',  font:'kannada' },
  { code:'ml',  name:'Malayalam', native:'മലയാളം',      word:'നമസ്കാരം',     rom:'namaskaram', font:'malayalam', scale:0.86 },
  { code:'or',  name:'Odia',      native:'ଓଡ଼ିଆ',        word:'ନମସ୍କାର',      rom:'namaskara',  font:'oriya' },
  { code:'pa',  name:'Punjabi',   native:'ਪੰਜਾਬੀ',       word:'ਸਤ ਸ੍ਰੀ ਅਕਾਲ',  rom:'sat sri akal', font:'gurmukhi', scale:0.62 },
  { code:'as',  name:'Assamese',  native:'অসমীয়া',      word:'নমস্কাৰ',      rom:'nomoskar',   font:'bengali' },
  { code:'mai', name:'Maithili',  native:'मैथिली',       word:'नमस्कार',     rom:'namaskar',   font:'devanagari' },
  { code:'sa',  name:'Sanskrit',  native:'संस्कृतम्',     word:'नमस्ते',      rom:'namaste',    font:'devanagari' },
  { code:'ne',  name:'Nepali',    native:'नेपाली',       word:'नमस्ते',      rom:'namaste',    font:'devanagari' },
  { code:'sd',  name:'Sindhi',    native:'سنڌي',        word:'سلام',        rom:'salaam',     font:'naskh',     rtl:true, scale:0.86 },
  { code:'ks',  name:'Kashmiri',  native:'کٲشُر',        word:'آداب',        rom:'aadaab',     font:'nastaliq',  rtl:true, scale:0.78 },
  { code:'kok', name:'Konkani',   native:'कोंकणी',       word:'नमस्कार',     rom:'namaskar',   font:'devanagari' },
  { code:'doi', name:'Dogri',     native:'डोगरी',       word:'नमस्ते',      rom:'namaste',    font:'devanagari' },
  { code:'brx', name:'Bodo',      native:'बड़ो',         word:'जों',          rom:'jong',       font:'devanagari' },
  { code:'mni', name:'Manipuri',  native:'ꯃꯤꯇꯩ ꯂꯣꯟ',    word:'ꯎꯏ',           rom:'ui',         font:'meetei',    scale:0.9 },
  { code:'sat', name:'Santali',   native:'ᱥᱟᱱᱛᱟᱲᱤ',      word:'ᱡᱚᱦᱟᱨ',        rom:'johar',      font:'olchiki',   scale:0.9 },
];

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@500..800&family=Noto+Sans+Devanagari:wght@500..800&family=Noto+Sans+Gujarati:wght@500..800&family=Noto+Sans+Gurmukhi:wght@500..800&family=Noto+Sans+Kannada:wght@500..800&family=Noto+Sans+Malayalam:wght@500..800&family=Noto+Sans+Oriya:wght@500..800&family=Noto+Sans+Tamil:wght@500..800&family=Noto+Sans+Telugu:wght@500..800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Ol+Chiki:wght@500..800&family=Noto+Sans+Meetei+Mayek:wght@500..800&family=Noto+Naskh+Arabic:wght@500..700&family=Noto+Nastaliq+Urdu:wght@500..700&display=swap');
`;

const SCRIPT_CSS = `
  .devanagari{font-family:'Noto Sans Devanagari',sans-serif;}
  .bengali{font-family:'Noto Sans Bengali',sans-serif;}
  .tamil{font-family:'Noto Sans Tamil',sans-serif;}
  .telugu{font-family:'Noto Sans Telugu',sans-serif;}
  .gujarati{font-family:'Noto Sans Gujarati',sans-serif;}
  .kannada{font-family:'Noto Sans Kannada',sans-serif;}
  .malayalam{font-family:'Noto Sans Malayalam',sans-serif;}
  .gurmukhi{font-family:'Noto Sans Gurmukhi',sans-serif;}
  .oriya{font-family:'Noto Sans Oriya',sans-serif;}
  .olchiki{font-family:'Noto Sans Ol Chiki',sans-serif;}
  .meetei{font-family:'Noto Sans Meetei Mayek',sans-serif;}
  .naskh{font-family:'Noto Naskh Arabic',serif;}
  .nastaliq{font-family:'Noto Nastaliq Urdu',serif;line-height:1.9;}
`;

// ---------------------------------------------------------------------------
// The footer lockup: TryBolo.app over both official store badges. EVERY asset
// carries it, so a screenshot of any single post still tells someone where to
// get the app.
// ---------------------------------------------------------------------------
const lockupCss = ({ inkH, url, gap, dark }) => `
  .lockup{position:absolute;left:0;right:0;display:flex;flex-direction:column;
    align-items:center;gap:${gap}px;}
  .langbar{max-width:95%;text-align:center;font-weight:600;
    font-size:${url >= 44 ? 17 : 15}px;line-height:1.5;letter-spacing:.01em;
    color:#94A3B8;margin-bottom:${Math.round(gap * 0.35)}px;}
  .lockup .url{display:inline-flex;align-items:center;gap:${Math.round(url * 0.34)}px;
    font-weight:900;font-size:${url}px;letter-spacing:-1.5px;
    color:${dark ? '#fff' : '#4F46E5'};}
  .lockup .url .dot{width:${Math.round(url * 0.58)}px;height:${Math.round(url * 0.58)}px;
    border-radius:50%;background:linear-gradient(135deg,#4F46E5,#14B8A6);
    ${dark ? 'box-shadow:0 0 0 5px rgba(255,255,255,.24);' : ''}}
  .badges{display:flex;align-items:${PLAY_SOON ? 'flex-start' : 'center'};
    gap:${Math.round(inkH * 0.34)}px;}
  .playcol{display:flex;flex-direction:column;align-items:center;}
  .soon{font-weight:800;font-size:${Math.round(inkH * 0.30)}px;letter-spacing:.14em;
    text-transform:uppercase;color:#94A3B8;margin-top:${Math.round(inkH * 0.06)}px;}
  .badges img{display:block;max-width:none;}
  .badges .apple{height:${inkH}px;width:auto;
    ${dark ? '' : 'filter:drop-shadow(0 10px 22px rgba(15,23,42,.18));'}}
  .badges .play{height:${playBox(inkH).toFixed(1)}px;width:auto;
    margin:-${playBleed(inkH).toFixed(1)}px;
    ${PLAY_SOON ? 'filter:grayscale(1);opacity:.42;' : ''}
    ${dark || PLAY_SOON ? '' : 'filter:drop-shadow(0 10px 22px rgba(15,23,42,.18));'}}
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

// Some greetings are simply wider than the frame at the nominal size:
// Tamil's வணக்கம் and Punjabi's ਸਤ ਸ੍ਰੀ ਅਕਾਲ both overrun 1080px. Rather than
// hand-tune a scale per language and have it rot the next time a greeting
// changes, every [data-fit] element shrinks itself until it fits.
// It MUST wait on document.fonts.ready: measured against fallback metrics the
// result is wrong for precisely the scripts that need the correction.
const AUTOFIT = `<script>
  document.fonts.ready.then(function () {
    document.querySelectorAll('[data-fit]').forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-fit'));
      var size = parseFloat(getComputedStyle(el).fontSize);
      var guard = 0;
      while (el.scrollWidth > max && size > 24 && guard++ < 300) {
        size -= 3;
        el.style.fontSize = size + 'px';
      }
    });
  });
<\/script>`;

const base = (w, h) => `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${w}px; height:${h}px; }
  body { font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow:hidden; }
  .stage { position:relative; width:${w}px; height:${h}px; overflow:hidden; }
  ${SCRIPT_CSS}
`;

// ---------------------------------------------------------------------------
// A1 / A2 — The wall of 22. Every language at once, in its own script.
// ---------------------------------------------------------------------------
const wall = (w, h, o) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(w, h)}
  ${lockupCss({ inkH: o.inkH, url: o.url, gap: o.lockGap, dark: false })}
  .stage{background:
    radial-gradient(120% 80% at 85% -5%, rgba(20,184,166,.20), transparent 55%),
    radial-gradient(110% 80% at 0% 15%, rgba(79,70,229,.18), transparent 55%),
    linear-gradient(180deg,#FBFCFF 0%, #F1F5FF 55%, #E9FBF6 100%);}
  .blob{position:absolute;border-radius:50%;filter:blur(70px);}
  .head{position:absolute;top:${o.top}px;left:60px;right:60px;text-align:center;}
  .kicker{font-weight:800;letter-spacing:.3em;text-transform:uppercase;
    font-size:${o.kicker}px;color:#0D9488;margin-bottom:${o.kickerGap}px;}
  .headline{font-weight:900;font-size:${o.headline}px;line-height:.98;
    color:#0F172A;letter-spacing:-3px;}
  .headline em{font-style:normal;background:linear-gradient(120deg,#4F46E5,#14B8A6);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .cloud{position:absolute;top:${o.cloudTop}px;bottom:${o.cloudBottom}px;left:${o.pad}px;right:${o.pad}px;
    display:flex;flex-wrap:wrap;gap:${o.gap}px;align-items:center;justify-content:center;align-content:center;}
  .chip{display:inline-flex;align-items:baseline;gap:12px;background:#fff;
    border:2px solid rgba(79,70,229,.10);border-radius:24px;
    padding:${o.chipY}px ${o.chipX}px;box-shadow:0 10px 26px rgba(79,70,229,.10);}
  .chip .n{font-size:${o.native}px;font-weight:700;line-height:1.15;}
  .chip .e{font-size:${o.en}px;font-weight:700;color:#94A3B8;letter-spacing:-.3px;}
  .chip.nastaliq-chip .n{font-size:${Math.round(o.native * 0.8)}px;}
  .foot{position:absolute;bottom:${o.foot}px;left:0;right:0;text-align:center;}
  .foot .line{font-weight:900;font-size:${o.footSize}px;color:#0F172A;letter-spacing:-1.5px;}
  .foot .line .t{color:#0D9488;}
  .lockup{bottom:${o.lock}px;}
</style></head><body>
  <div class="stage">
    <div class="blob" style="width:520px;height:520px;top:-120px;right:-140px;background:rgba(20,184,166,.32);"></div>
    <div class="blob" style="width:560px;height:560px;bottom:${o.lock + 60}px;left:-180px;background:rgba(79,70,229,.24);"></div>
    <div class="head">
      <div class="kicker">Every one of them</div>
      <h1 class="headline">All <em>22</em> official<br/>languages of India</h1>
    </div>
    <div class="cloud">
      ${LANGS.map((l, i) => `<span class="chip ${l.font === 'nastaliq' ? 'nastaliq-chip' : ''}">
        <span class="n ${l.font}" ${l.rtl ? 'dir="rtl"' : ''} style="color:${
          ['#4F46E5', '#0D9488', '#6366F1'][i % 3]
        }">${l.native}</span>
        <span class="e">${l.name}</span></span>`).join('')}
    </div>
    <div class="foot">
      <div class="line">Duo teaches 1. <span class="t">Bolo teaches 22.</span></div>
    </div>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// B — The scoreboard. The comparison table, 22 rows, ticks and crosses.
// ---------------------------------------------------------------------------
const scoreboard = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1920)}
  ${lockupCss({ inkH: 52, url: 48, gap: 18, dark: false })}
  .stage{background:linear-gradient(180deg,#FBFCFF 0%,#F4F6FF 60%,#EAFBF7 100%);}
  .head{position:absolute;top:84px;left:56px;right:56px;text-align:center;}
  .kicker{font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:27px;
    color:#0D9488;margin-bottom:14px;}
  .headline{font-weight:900;font-size:90px;line-height:.96;color:#0F172A;letter-spacing:-3px;}
  .headline em{font-style:normal;color:#4F46E5;}
  .table{position:absolute;top:322px;left:56px;right:56px;background:#fff;border-radius:36px;
    box-shadow:0 26px 60px rgba(79,70,229,.14);overflow:hidden;}
  .thead{display:flex;align-items:center;background:#0F172A;padding:19px 40px;}
  .thead .lang{flex:1;color:#fff;font-weight:800;font-size:24px;letter-spacing:.18em;text-transform:uppercase;}
  .thead .col{width:140px;text-align:center;font-weight:900;font-size:28px;letter-spacing:-.5px;}
  .thead .duo{color:#94A3B8;}
  .thead .bolo{color:#5EEAD4;}
  .row{display:flex;align-items:center;padding:0 40px;height:45px;border-top:1px solid #F1F5F9;}
  .row.duo-yes{background:#FFFBEB;}
  .row .lang{flex:1;display:flex;align-items:baseline;gap:13px;}
  .row .native{font-size:28px;font-weight:700;color:#4F46E5;line-height:1;}
  .row .en{font-size:22px;font-weight:700;color:#334155;}
  .row .col{width:140px;text-align:center;}
  .mark{display:inline-flex;align-items:center;justify-content:center;
    width:33px;height:33px;border-radius:50%;font-size:19px;font-weight:900;}
  .no{background:#FEE2E2;color:#DC2626;}
  .yes{background:#CCFBF1;color:#0D9488;}
  .tally{display:flex;align-items:center;background:#F8FAFC;padding:17px 40px;border-top:3px solid #0F172A;}
  .tally .lang{flex:1;font-weight:900;font-size:27px;color:#0F172A;letter-spacing:-.5px;}
  .tally .col{width:140px;text-align:center;font-weight:900;font-size:48px;letter-spacing:-2px;}
  .tally .duo{color:#DC2626;}
  .tally .bolo{color:#0D9488;}
  .foot{position:absolute;bottom:274px;left:0;right:0;text-align:center;}
  .foot .l1{font-weight:900;font-size:52px;color:#0F172A;letter-spacing:-2px;}
  .foot .l1 .t{color:#0D9488;}
  .lockup{bottom:58px;}
</style></head><body>
  <div class="stage">
    <div class="head">
      <div class="kicker">India's 22 official languages</div>
      <h1 class="headline">Duo forgot.<br/><em>Bolo didn't.</em></h1>
    </div>
    <div class="table">
      <div class="thead">
        <div class="lang">Language</div>
        <div class="col duo">Duo</div>
        <div class="col bolo">Bolo!</div>
      </div>
      ${LANGS.map((l) => `<div class="row ${l.duo ? 'duo-yes' : ''}">
        <div class="lang">
          <span class="native ${l.font}" ${l.rtl ? 'dir="rtl"' : ''}>${l.native}</span>
          <span class="en">${l.name}</span>
        </div>
        <div class="col"><span class="mark ${l.duo ? 'yes' : 'no'}">${l.duo ? '✓' : '✕'}</span></div>
        <div class="col"><span class="mark yes">✓</span></div>
      </div>`).join('')}
      <div class="tally">
        <div class="lang">Taught</div>
        <div class="col duo">1</div>
        <div class="col bolo">22</div>
      </div>
    </div>
    <div class="foot">
      <div class="l1">Find yours. <span class="t">Speak it out loud.</span></div>
    </div>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// C — The on-ramp. The sharpest fact in the campaign.
// ---------------------------------------------------------------------------
const onramp = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1920)}
  ${lockupCss({ inkH: 52, url: 48, gap: 18, dark: true })}
  .stage{background:radial-gradient(120% 80% at 50% -10%, #6366F1 0%, #4F46E5 30%, #312E81 70%, #1E1B4B 100%);}
  .grid{position:absolute;inset:0;opacity:.09;
    background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
    background-size:90px 90px;}
  .kicker{position:absolute;top:126px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:800;letter-spacing:.32em;text-transform:uppercase;font-size:29px;}
  .headline{position:absolute;top:192px;left:64px;right:64px;text-align:center;color:#fff;
    font-weight:900;font-size:88px;line-height:1.02;letter-spacing:-2.5px;}
  .beat{position:absolute;top:436px;left:64px;right:64px;text-align:center;
    font-weight:900;font-size:98px;line-height:1.0;color:#FDE68A;letter-spacing:-3px;}
  .arrowrow{position:absolute;top:690px;left:80px;right:80px;display:flex;align-items:center;
    justify-content:center;gap:26px;}
  .pillbox{background:rgba(255,255,255,.10);border:2px solid rgba(255,255,255,.22);
    border-radius:28px;padding:24px 32px;text-align:center;min-width:246px;}
  .pillbox .s{font-size:54px;font-weight:800;color:#fff;line-height:1.25;}
  .pillbox .c{margin-top:8px;font-size:23px;font-weight:700;color:#A5B4FC;letter-spacing:.14em;text-transform:uppercase;}
  .arrow{font-size:62px;color:#5EEAD4;font-weight:900;}
  .verdict{position:absolute;top:952px;left:70px;right:70px;background:#fff;border-radius:40px;
    padding:46px 56px;text-align:center;box-shadow:0 34px 80px rgba(0,0,0,.34);}
  .verdict .big{font-weight:900;font-size:72px;color:#0F172A;letter-spacing:-2.5px;line-height:1.02;}
  .verdict .big .t{color:#0D9488;}
  .verdict .sub{margin-top:20px;font-size:32px;font-weight:700;color:#64748B;line-height:1.35;}
  .mascot{position:absolute;bottom:318px;right:32px;width:262px;
    filter:drop-shadow(0 30px 40px rgba(0,0,0,.4));}
  .lockup{bottom:58px;}
</style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="kicker">Duolingo, April 2025</div>
    <h1 class="headline">They taught Tamil<br/>speakers Spanish.</h1>
    <div class="beat">They still don't<br/>teach Tamil.</div>
    <div class="arrowrow">
      <div class="pillbox"><div class="s tamil">தமிழ்</div><div class="c">Your language</div></div>
      <div class="arrow">&rarr;</div>
      <div class="pillbox"><div class="s">Español</div><div class="c">Their catalogue</div></div>
    </div>
    <div class="verdict">
      <div class="big">Bolo teaches<br/><span class="t">all 22.</span></div>
      <div class="sub">Out loud, with real pronunciation<br/>coaching. Yours first.</div>
    </div>
    <img class="mascot" src="${mascot.thumbsup}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// D — The per-language series. 21 "forgot" cards, plus Hindi's own card,
// because Duolingo genuinely does teach Hindi.
// ---------------------------------------------------------------------------
const card = (l) => {
  const wordSize = Math.round(204 * (l.scale ?? 1));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14, dark: false })}
  .stage{background:
    radial-gradient(110% 80% at 88% 0%, rgba(20,184,166,.22), transparent 52%),
    radial-gradient(110% 80% at 0% 30%, rgba(79,70,229,.18), transparent 52%),
    linear-gradient(180deg,#FBFCFF 0%,#F2F5FF 58%,#E9FBF6 100%);}
  .blob{position:absolute;border-radius:50%;filter:blur(60px);}
  .strike{position:absolute;top:56px;left:0;right:0;text-align:center;
    font-weight:800;font-size:37px;color:#94A3B8;letter-spacing:-.5px;}
  .strike b{color:#DC2626;font-weight:900;}
  /* One centred stack rather than three absolute rows: a script that sets
     short (Nastaliq) or a long greeting scaled down (Gurmukhi) then closes
     its own gap instead of leaving a hole above the language name. */
  .stack{position:absolute;top:116px;left:52px;right:52px;height:382px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;}
  .word{text-align:center;font-size:${wordSize}px;font-weight:800;line-height:1.18;
    color:#4F46E5;text-shadow:0 18px 40px rgba(79,70,229,.18);white-space:nowrap;}
  /* Nastaliq hangs a long tail well below its line box, which the flex row
     does not reserve room for: unchecked it lands on top of the language
     name. Trade the oversized global line-height for explicit descender
     padding so the stack measures the ink, not the em box. */
  .word.nastaliq{line-height:1.3;padding-bottom:.55em;}
  .langname{font-weight:900;font-size:60px;color:#0F172A;letter-spacing:-1.5px;line-height:1.1;}
  .rom{font-weight:700;font-size:27px;color:#94A3B8;letter-spacing:.24em;text-transform:uppercase;}
  .band{position:absolute;top:528px;left:50%;transform:translateX(-50%);
    display:inline-flex;align-items:center;gap:20px;
    background:linear-gradient(120deg,#4F46E5,#0D9488);border-radius:999px;
    padding:21px 52px;box-shadow:0 24px 54px rgba(13,148,136,.34);}
  .band .t{font-weight:900;font-size:56px;color:#fff;letter-spacing:-1.5px;}
  .sub{position:absolute;top:656px;left:70px;right:70px;text-align:center;
    font-weight:700;font-size:31px;color:#475569;line-height:1.34;}
  .sub .hl{color:#0D9488;font-weight:900;}
  .mascot{position:absolute;bottom:14px;right:22px;width:150px;
    filter:drop-shadow(0 24px 32px rgba(15,23,42,.22));}
  .lockup{bottom:40px;}
</style></head><body>
  <div class="stage">
    <div class="blob" style="width:400px;height:400px;top:-110px;right:-120px;background:rgba(20,184,166,.34);"></div>
    <div class="blob" style="width:420px;height:420px;bottom:-140px;left:-130px;background:rgba(79,70,229,.24);"></div>
    <div class="strike">${
      l.duo
        ? 'Duo teaches <b>1</b> Indian language.'
        : 'Duo forgot <b>&#8203;</b>'
    }</div>
    <div class="stack">
      <div class="word ${l.font}" data-fit="964" ${l.rtl ? 'dir="rtl"' : ''}>${l.word}</div>
      <div class="langname">${l.name}</div>
      <div class="rom">${l.rom}</div>
    </div>
    <div class="band"><span class="t">${l.duo ? 'Bolo teaches 22.' : "Bolo didn't."}</span></div>
    <div class="sub">${
      l.duo
        ? 'Hindi <span class="hl">out loud</span>, plus the other 21.<br/>Say it, and get coached on the spot.'
        : `Learn <span class="hl">${l.name}</span> by speaking it.<br/>All 22 official languages, one app.`
    }</div>
    <img class="mascot" src="${l.duo ? mascot.cheer : mascot.wave}" alt=""/>
    ${lockupHtml}
  </div>
  ${AUTOFIT}
</body></html>`;
};

// The "Duo forgot" line reads better with the language name inline, but the
// name has to sit in its own span so the native script font applies only to
// the script. Patch it in rather than branching the template again.
const cardHtml = (l) =>
  card(l).replace(
    'Duo forgot <b>&#8203;</b>',
    `Duo forgot <b>${l.name}</b> &#128542;`,
  );

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const jobs = [
  { slug: 'a1-wall-of-22-9x16', w: 1080, h: 1920, html: wall(1080, 1920, {
      top: 108, kicker: 29, kickerGap: 18, headline: 86,
      cloudTop: 362, cloudBottom: 404, pad: 52, gap: 16,
      chipY: 13, chipX: 24, native: 47, en: 23,
      foot: 288, footSize: 52, lock: 58, inkH: 52, url: 48, lockGap: 18,
    }) },
  { slug: 'a2-wall-of-22-1x1', w: 1080, h: 1080, html: wall(1080, 1080, {
      top: 44, kicker: 21, kickerGap: 11, headline: 57,
      cloudTop: 204, cloudBottom: 292, pad: 38, gap: 11,
      chipY: 9, chipX: 16, native: 33, en: 16,
      foot: 208, footSize: 38, lock: 40, inkH: 40, url: 38, lockGap: 14,
    }) },
  { slug: 'b-scoreboard-1v22', w: 1080, h: 1920, html: scoreboard },
  { slug: 'c-onramp-tamil-spanish', w: 1080, h: 1920, html: onramp },
  ...LANGS.map((l, i) => ({
    slug: `d${String(i + 1).padStart(2, '0')}-forgot-${l.code}-${l.name.toLowerCase()}`,
    w: 1080,
    h: 1080,
    html: cardHtml(l),
  })),
];

for (const j of jobs) {
  const htmlPath = resolve(TMP, `${j.slug}.html`);
  const pngPath = resolve(OUT, `${j.slug}.png`);
  writeFileSync(htmlPath, j.html);
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${j.w},${j.h}`,
      '--virtual-time-budget=20000',
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore' },
  );
  console.log(`wrote ${j.slug}.png`);
}
console.log(`\ndone: ${jobs.length} assets in ${OUT}`);
