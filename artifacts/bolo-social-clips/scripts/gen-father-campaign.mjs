// Generates the "You speak it. They answer in English." campaign.
//
// Third of three, and deliberately the third visual register. The Duo set is
// bright and combative; the AI set is dark and instrument-like; this one is
// warm paper, domestic and quiet, because the thing being sold is a feeling
// every South Asian household already recognises.
//
// THE CREATIVE DEVICE, and the reason the assets need almost no copy: the
// parent's line is set in full colour, in its own script. The child's reply is
// set flat, grey and in English. The picture makes the argument. The payoff
// asset (f-answer-back) inverts exactly that treatment and nothing else.
//
// PHRASES ARE TAKEN FROM THE APP'S OWN VETTED CATALOGUE where one exists
// (artifacts/gujarati-coach/src/lib/languagePages.ts), rather than conjugated
// here. "खाना खा लिया?" is the one addition: it is the archetypal parent line
// and is plain, standard Hindi.
//
// CLAIMS. The Family plan is real: FAMILY_SEATS = 4 and "one bill covers up to
// 4 people, each person's progress stays their own" (gujarati-coach/src/lib/
// pricing.ts). NO PRICE APPEARS ON ANY ASSET: prices are served from Stripe at
// runtime via GET /api/pricing precisely so a quoted number can never drift
// from the real charge, and a number burned into a PNG cannot be corrected.
// Family is also a WEB tier, so its call to action is TryBolo.app, not a store.
//
// Usage: CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//          node scripts/gen-father-campaign.mjs
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
const OUT = resolve(ROOT, 'campaign-father' + (PLAY_SOON ? '-playsoon' : ''));
const TMP = '/tmp/bolo-father-campaign';

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
const PLAY_INK_RATIO = 53.333 / 79.433;
const playBox = (h) => h / PLAY_INK_RATIO;
const playBleed = (h) => (playBox(h) - h) / 2;

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@500..800&family=Noto+Sans+Gujarati:wght@500..800&family=Noto+Sans+Gurmukhi:wght@500..800&family=Noto+Sans+Tamil:wght@500..800&family=Noto+Sans+Bengali:wght@500..800&display=swap');
`;

// Warm paper, not the cool near-white of the other two sets.
const base = (w, h) => `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${w}px; height:${h}px; }
  body { font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow:hidden; }
  .stage { position:relative; width:${w}px; height:${h}px; overflow:hidden;
    background:
      radial-gradient(120% 70% at 82% -4%, rgba(217,119,6,.10), transparent 56%),
      radial-gradient(110% 70% at 4% 22%, rgba(79,70,229,.09), transparent 54%),
      linear-gradient(180deg,#FDFAF4 0%,#F8F2E8 56%,#F4EFE6 100%); }
  .devanagari{font-family:'Noto Sans Devanagari',sans-serif;}
  .gujarati{font-family:'Noto Sans Gujarati',sans-serif;}
  .gurmukhi{font-family:'Noto Sans Gurmukhi',sans-serif;}
  .tamil{font-family:'Noto Sans Tamil',sans-serif;}
  .bengali{font-family:'Noto Sans Bengali',sans-serif;}
`;

const lockupCss = ({ inkH, url, gap }) => `
  .lockup{position:absolute;left:0;right:0;display:flex;flex-direction:column;
    align-items:center;gap:${gap}px;}
  .langbar{max-width:95%;text-align:center;font-weight:600;
    font-size:${url >= 44 ? 17 : 15}px;line-height:1.5;letter-spacing:.01em;
    color:#A8A29E;margin-bottom:${Math.round(gap * 0.35)}px;}
  .maker{font-weight:800;font-size:${Math.round(url * 0.56)}px;color:#78716C;
    letter-spacing:.01em;margin-bottom:${Math.round(gap * -0.2)}px;}
  .maker b{color:#0D9488;font-weight:900;}
  .lockup .url{display:inline-flex;align-items:center;gap:${Math.round(url * 0.34)}px;
    font-weight:900;font-size:${url}px;letter-spacing:-1.5px;color:#4F46E5;}
  .lockup .url .dot{width:${Math.round(url * 0.58)}px;height:${Math.round(url * 0.58)}px;
    border-radius:50%;background:linear-gradient(135deg,#4F46E5,#14B8A6);}
  .badges{display:flex;align-items:${PLAY_SOON ? 'flex-start' : 'center'};
    gap:${Math.round(inkH * 0.34)}px;}
  .playcol{display:flex;flex-direction:column;align-items:center;}
  .soon{font-weight:800;font-size:${Math.round(inkH * 0.30)}px;letter-spacing:.14em;
    text-transform:uppercase;color:#A8A29E;margin-top:${Math.round(inkH * 0.06)}px;}
  .badges img{display:block;max-width:none;filter:drop-shadow(0 10px 22px rgba(28,25,23,.18));}
  .badges .apple{height:${inkH}px;width:auto;}
  .badges .play{height:${playBox(inkH).toFixed(1)}px;width:auto;
    margin:-${playBleed(inkH).toFixed(1)}px;
    ${PLAY_SOON ? 'filter:grayscale(1);opacity:.42;' : ''}}
`;
const lockupHtml = `
  <div class="lockup">
    <div class="langbar">Hindi &middot; Punjabi &middot; Urdu &middot; Bengali &middot; Tamil &middot; Telugu &middot; Gujarati &middot; Marathi &middot; Assamese &middot; Bodo &middot; Dogri &middot; Kannada &middot; Kashmiri &middot; Konkani &middot; Maithili &middot; Malayalam &middot; Manipuri &middot; Nepali &middot; Odia &middot; Sanskrit &middot; Santali &middot; Sindhi</div>
    <div class="maker">Made by a <b>father of ABCDs</b></div>
    <div class="url"><span class="dot"></span><span>TryBolo.app</span></div>
    <div class="badges">
      <img class="apple" src="${APPLE_BADGE}" alt="Download on the App Store"/>
      <div class="playcol">
        <img class="play" src="${PLAY_BADGE}" alt="Get it on Google Play"/>
        ${PLAY_SOON ? '<span class="soon">Coming soon</span>' : ''}
      </div>
    </div>
  </div>`;

// The bubble pair. `.them` is the parent: full colour, native script.
// `.you` is the child: flat, grey, English. That contrast IS the campaign.
const bubbleCss = (o) => `
  .ex{display:flex;flex-direction:column;gap:${o.gap}px;}
  .bub{max-width:${o.max}%;border-radius:${o.r}px;padding:${o.py}px ${o.px}px;}
  .bub.them{align-self:flex-start;background:#fff;border:2px solid rgba(79,70,229,.16);
    border-bottom-left-radius:${o.tail}px;box-shadow:0 14px 34px rgba(79,70,229,.13);}
  .bub.them .l{font-size:${o.native}px;font-weight:700;color:#4F46E5;line-height:1.34;}
  .bub.them .r{display:block;margin-top:${o.romGap}px;font-size:${o.rom}px;font-weight:600;
    color:#A8A29E;letter-spacing:.05em;}
  .bub.you{align-self:flex-end;background:#E9E5DF;border:2px solid #DDD8D0;
    border-bottom-right-radius:${o.tail}px;}
  .bub.you .l{font-size:${o.en}px;font-weight:700;color:#8A8279;line-height:1.3;}
  .who{font-size:${o.who}px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;
    margin-bottom:${o.whoGap}px;}
  .them .who{color:#14B8A6;} .you .who{color:#B4ADA3;text-align:right;}
`;

const bubble = (side, script, line, rom, who) => `
  <div class="bub ${side}">
    ${who ? `<div class="who">${who}</div>` : ''}
    <span class="l ${script}">${line}</span>
    ${rom ? `<span class="r">${rom}</span>` : ''}
  </div>`;

// ---------------------------------------------------------------------------
// A — The hero. One exchange, and the turn.
// ---------------------------------------------------------------------------
const hero = (w, h, o) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(w, h)}
  ${lockupCss({ inkH: o.inkH, url: o.url, gap: o.lockGap })}
  ${bubbleCss(o.b)}
  .kicker{position:absolute;top:${o.kickerTop}px;left:0;right:0;text-align:center;color:#0D9488;
    font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:${o.kicker}px;}
  .ex{position:absolute;top:${o.exTop}px;left:${o.pad}px;right:${o.pad}px;}
  .head{position:absolute;top:${o.headTop}px;left:${o.pad}px;right:${o.pad}px;text-align:center;
    font-weight:900;font-size:${o.head}px;line-height:1.04;color:#1C1917;letter-spacing:-2.6px;}
  .turn{position:absolute;top:${o.turnTop}px;left:${o.pad}px;right:${o.pad}px;text-align:center;
    font-weight:900;font-size:${o.turn}px;line-height:1.04;letter-spacing:-2.6px;
    background:linear-gradient(110deg,#4F46E5,#0D9488);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .sub{position:absolute;top:${o.subTop}px;left:${o.subPad}px;right:${o.subPad}px;text-align:center;
    font-weight:600;font-size:${o.sub}px;line-height:1.4;color:#57534E;}
  .mascot{position:absolute;bottom:${o.mBottom}px;right:${o.mRight}px;width:${o.mascot}px;
    filter:drop-shadow(0 26px 34px rgba(28,25,23,.22));}
  .lockup{bottom:${o.lock}px;}
</style></head><body>
  <div class="stage">
    <div class="kicker">Sound familiar?</div>
    <div class="ex">
      ${bubble('them', 'gujarati', 'કેમ છો?', 'kem chho?', 'You')}
      ${bubble('you', '', "I'm good.", '', 'Them')}
    </div>
    <div class="head">You speak it.<br/>They answer in English.</div>
    <div class="turn">It's not too late.</div>
    <div class="sub">Bolo teaches all 22 languages by speaking them out loud.<br/>Learn it together, on one family plan.</div>
    <img class="mascot" src="${mascot.wave}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// B — Every single time. The same scene three times over.
// ---------------------------------------------------------------------------
const everytime = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1920)}
  ${lockupCss({ inkH: 52, url: 48, gap: 18 })}
  ${bubbleCss({ gap: 20, max: 78, r: 34, py: 22, px: 32, tail: 10,
    native: 50, rom: 24, romGap: 8, en: 46, who: 0, whoGap: 0 })}
  .kicker{position:absolute;top:120px;left:0;right:0;text-align:center;color:#0D9488;
    font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:29px;}
  .head{position:absolute;top:180px;left:62px;right:62px;text-align:center;
    font-weight:900;font-size:92px;line-height:1.02;color:#1C1917;letter-spacing:-3px;}
  .ex{position:absolute;top:396px;left:66px;right:66px;gap:20px;}
  .ex .pair{display:flex;flex-direction:column;gap:16px;margin-bottom:34px;}
  .foot{position:absolute;top:1362px;left:70px;right:70px;text-align:center;
    font-weight:900;font-size:62px;line-height:1.06;color:#1C1917;letter-spacing:-2px;}
  .foot .t{background:linear-gradient(110deg,#4F46E5,#0D9488);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .sub{position:absolute;top:1534px;left:88px;right:88px;text-align:center;
    font-weight:600;font-size:31px;line-height:1.4;color:#57534E;}
  .lockup{bottom:50px;}
</style></head><body>
  <div class="stage">
    <div class="kicker">Every single time</div>
    <div class="head">Three languages<br/>in, one out.</div>
    <div class="ex">
      <div class="pair">
        ${bubble('them', 'gujarati', 'કેમ છો?', 'kem chho?')}
        ${bubble('you', '', "I'm good.")}
      </div>
      <div class="pair">
        ${bubble('them', 'devanagari', 'खाना खा लिया?', 'khaana kha liya?')}
        ${bubble('you', '', 'Yeah.')}
      </div>
      <div class="pair">
        ${bubble('them', 'gurmukhi', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'sat sri akal')}
        ${bubble('you', '', 'Hey.')}
      </div>
    </div>
    <div class="foot">You never stopped.<br/><span class="t">They never started.</span></div>
    <div class="sub">Bolo gets them speaking, out loud, from the first phrase.</div>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// C — It is not just your house.
// ---------------------------------------------------------------------------
const universal = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14 })}
  .kicker{position:absolute;top:66px;left:0;right:0;text-align:center;color:#0D9488;
    font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:25px;}
  .head{position:absolute;top:116px;left:60px;right:60px;text-align:center;
    font-weight:900;font-size:74px;line-height:1.03;color:#1C1917;letter-spacing:-2.4px;}
  .rows{position:absolute;top:328px;left:70px;right:70px;display:flex;flex-direction:column;gap:15px;}
  .row{display:flex;align-items:center;gap:18px;background:#fff;border:2px solid rgba(79,70,229,.12);
    border-radius:22px;padding:18px 26px;box-shadow:0 10px 26px rgba(79,70,229,.09);}
  .row .n{font-size:40px;font-weight:700;color:#4F46E5;line-height:1.25;flex:0 0 auto;}
  .row .ar{color:#D6D3D1;font-size:30px;font-weight:900;}
  .row .e{font-size:34px;font-weight:700;color:#A8A29E;margin-left:auto;}
  .foot{position:absolute;top:706px;left:74px;right:74px;text-align:center;
    font-weight:900;font-size:48px;line-height:1.08;color:#1C1917;letter-spacing:-1.6px;}
  .foot .t{background:linear-gradient(110deg,#4F46E5,#0D9488);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .mascot{position:absolute;bottom:12px;right:24px;width:146px;
    filter:drop-shadow(0 24px 32px rgba(28,25,23,.22));}
  .lockup{bottom:32px;}
</style></head><body>
  <div class="stage">
    <div class="kicker">It's not just your house</div>
    <div class="head">Every one of these<br/>gets the same reply.</div>
    <div class="rows">
      <div class="row"><span class="n gujarati">કેમ છો?</span><span class="ar">&rarr;</span><span class="e">&ldquo;I'm good.&rdquo;</span></div>
      <div class="row"><span class="n devanagari">खाना खा लिया?</span><span class="ar">&rarr;</span><span class="e">&ldquo;Yeah.&rdquo;</span></div>
      <div class="row"><span class="n tamil">வணக்கம்</span><span class="ar">&rarr;</span><span class="e">&ldquo;Hey.&rdquo;</span></div>
      <div class="row"><span class="n bengali">নমস্কার</span><span class="ar">&rarr;</span><span class="e">&ldquo;Hi.&rdquo;</span></div>
    </div>
    <div class="foot">22 languages.<br/><span class="t">One very familiar answer.</span></div>
    <img class="mascot" src="${mascot.wave}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// D — The family plan. The commercial asset. No price: see the header note.
// ---------------------------------------------------------------------------
const family = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14 })}
  .kicker{position:absolute;top:70px;left:0;right:0;text-align:center;color:#0D9488;
    font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:25px;}
  .head{position:absolute;top:122px;left:58px;right:58px;text-align:center;
    font-weight:900;font-size:80px;line-height:1.02;color:#1C1917;letter-spacing:-2.6px;}
  .head .t{background:linear-gradient(110deg,#4F46E5,#0D9488);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .seats{position:absolute;top:352px;left:0;right:0;display:flex;justify-content:center;gap:22px;}
  .seat{width:158px;height:158px;border-radius:34px;background:#fff;
    border:2px solid rgba(79,70,229,.14);box-shadow:0 14px 30px rgba(79,70,229,.11);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
  .seat .ic{font-size:54px;line-height:1;}
  .seat .lb{font-size:22px;font-weight:800;color:#78716C;letter-spacing:.04em;}
  .bullets{position:absolute;top:548px;left:96px;right:96px;display:flex;flex-direction:column;gap:15px;}
  .bl{display:flex;align-items:flex-start;gap:14px;font-size:31px;font-weight:600;color:#44403C;line-height:1.32;}
  .bl .tick{color:#0D9488;font-weight:900;font-size:31px;line-height:1.32;flex:0 0 auto;}
  .bl b{color:#1C1917;font-weight:800;}
  .mascot{position:absolute;bottom:12px;right:24px;width:146px;
    filter:drop-shadow(0 24px 32px rgba(28,25,23,.22));}
  .lockup{bottom:32px;}
</style></head><body>
  <div class="stage">
    <div class="kicker">Bolo! Family</div>
    <div class="head">Don't make them<br/>do it <span class="t">alone.</span></div>
    <div class="seats">
      <div class="seat"><span class="ic">&#128100;</span><span class="lb">You</span></div>
      <div class="seat"><span class="ic">&#128100;</span><span class="lb">Them</span></div>
      <div class="seat"><span class="ic">&#128100;</span><span class="lb">+2</span></div>
    </div>
    <div class="bullets">
      <div class="bl"><span class="tick">&#10003;</span><span>One bill covers <b>up to 4 people</b></span></div>
      <div class="bl"><span class="tick">&#10003;</span><span>Each person's <b>progress stays their own</b></span></div>
      <div class="bl"><span class="tick">&#10003;</span><span>All <b>22 languages</b>, every game, unlimited chat</span></div>
    </div>
    <img class="mascot" src="${mascot.cheer}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// E — The payoff. The child's bubble finally gets the parent's treatment, and
// that inversion is the entire idea. Nothing else on the card changes.
// ---------------------------------------------------------------------------
const answerBack = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1080)}
  ${lockupCss({ inkH: 40, url: 38, gap: 14 })}
  .kicker{position:absolute;top:68px;left:0;right:0;text-align:center;color:#0D9488;
    font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:25px;}
  .head{position:absolute;top:118px;left:60px;right:60px;text-align:center;
    font-weight:900;font-size:78px;line-height:1.03;color:#1C1917;letter-spacing:-2.5px;}
  .ex{position:absolute;top:336px;left:82px;right:82px;display:flex;flex-direction:column;gap:20px;}
  .bub{max-width:76%;border-radius:32px;padding:22px 32px;}
  .bub .l{font-size:50px;font-weight:700;line-height:1.32;}
  .bub .r{display:block;margin-top:8px;font-size:23px;font-weight:600;letter-spacing:.05em;}
  .bub.them{align-self:flex-start;background:#fff;border:2px solid rgba(79,70,229,.16);
    border-bottom-left-radius:10px;box-shadow:0 14px 34px rgba(79,70,229,.13);}
  .bub.them .l{color:#4F46E5;} .bub.them .r{color:#A8A29E;}
  /* The inversion: the child's reply now carries the brand gradient instead of
     the flat grey it wears on every other asset in this set. */
  .bub.kid{align-self:flex-end;background:linear-gradient(120deg,#4F46E5,#0D9488);
    border:2px solid transparent;border-bottom-right-radius:10px;
    box-shadow:0 18px 40px rgba(13,148,136,.30);}
  .bub.kid .l{color:#fff;} .bub.kid .r{color:rgba(255,255,255,.76);}
  .foot{position:absolute;top:706px;left:78px;right:78px;text-align:center;
    font-weight:900;font-size:52px;line-height:1.08;color:#1C1917;letter-spacing:-1.7px;}
  .sub{position:absolute;top:826px;left:88px;right:88px;text-align:center;
    font-weight:600;font-size:28px;line-height:1.4;color:#57534E;}
  .mascot{position:absolute;bottom:12px;right:24px;width:146px;
    filter:drop-shadow(0 24px 32px rgba(28,25,23,.22));}
  .lockup{bottom:32px;}
</style></head><body>
  <div class="stage">
    <div class="kicker">The whole point</div>
    <div class="head">One day, they<br/>answer back.</div>
    <div class="ex">
      <div class="bub them"><span class="l gujarati">કેમ છો?</span><span class="r">kem chho?</span></div>
      <div class="bub kid"><span class="l gujarati">મજામાં!</span><span class="r">majaa maa!</span></div>
    </div>
    <div class="foot">That's what we're building.</div>
    <div class="sub">Start them speaking today. All 22 languages, out loud.</div>
    <img class="mascot" src="${mascot.thumbsup}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// F — The founder asset. The maker's mark gets a whole card.
//
// THE FIRST-PERSON COPY IS A DRAFT, written for the owner to approve or
// rewrite, not to be posted as-is on someone else's say-so. The claims inside
// it are deliberately ones only he can confirm; nothing here asserts a product
// fact that is not already covered by the rest of the set.
// ---------------------------------------------------------------------------
const founder = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${base(1080, 1920)}
  ${lockupCss({ inkH: 52, url: 48, gap: 18 })}
  .kicker{position:absolute;top:132px;left:0;right:0;text-align:center;color:#0D9488;
    font-weight:800;letter-spacing:.3em;text-transform:uppercase;font-size:29px;}
  .head{position:absolute;top:196px;left:62px;right:62px;text-align:center;
    font-weight:900;font-size:96px;line-height:1.0;color:#1C1917;letter-spacing:-3.2px;}
  .head .t{background:linear-gradient(110deg,#4F46E5,#0D9488);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .expand{position:absolute;top:432px;left:70px;right:70px;text-align:center;
    font-weight:700;font-size:36px;color:#A8A29E;letter-spacing:.02em;}
  .card{position:absolute;top:540px;left:66px;right:66px;background:#fff;
    border:2px solid rgba(79,70,229,.14);border-radius:40px;padding:52px 54px;
    box-shadow:0 26px 60px rgba(79,70,229,.13);}
  .card p{font-size:39px;font-weight:600;color:#44403C;line-height:1.44;margin-bottom:28px;}
  .card p:last-child{margin-bottom:0;}
  .card b{color:#1C1917;font-weight:800;}
  .card .q{color:#4F46E5;font-weight:800;}
  .card .g{color:#8A8279;font-weight:800;}
  .sign{position:absolute;top:1338px;left:0;right:0;text-align:center;
    font-weight:900;font-size:44px;color:#1C1917;letter-spacing:-1.2px;}
  .sign .s{display:block;margin-top:12px;font-size:27px;font-weight:700;
    color:#78716C;letter-spacing:.02em;}
  .mascot{position:absolute;bottom:330px;right:38px;width:212px;
    filter:drop-shadow(0 26px 34px rgba(28,25,23,.22));}
  .lockup{bottom:50px;}
</style></head><body>
  <div class="stage">
    <div class="kicker">Why this app exists</div>
    <div class="head">Made by a father<br/>of <span class="t">ABCDs.</span></div>
    <div class="expand">American Born Confused Desis</div>
    <div class="card">
      <p>I said <span class="q gujarati">કેમ છો?</span> to my kids every day for years.</p>
      <p>Every day I got <span class="g">&ldquo;I&rsquo;m good.&rdquo;</span></p>
      <p>No app taught our language. So I built the one I wanted: <b>all 22, taught out
      loud</b>, for the whole family.</p>
    </div>
    <div class="sign">Bolo!<span class="s">Built in one house, for yours.</span></div>
    <img class="mascot" src="${mascot.wave}" alt=""/>
    ${lockupHtml}
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const jobs = [
  { slug: 'a1-they-answer-in-english-9x16', w: 1080, h: 1920, html: hero(1080, 1920, {
      kickerTop: 128, kicker: 29, pad: 66,
      exTop: 200, headTop: 620, head: 88, turnTop: 838, turn: 88,
      subTop: 990, sub: 33, subPad: 92,
      mascot: 250, mBottom: 330, mRight: 40,
      lock: 50, inkH: 52, url: 48, lockGap: 18,
      b: { gap: 22, max: 76, r: 36, py: 26, px: 36, tail: 10,
           native: 62, rom: 26, romGap: 10, en: 56, who: 22, whoGap: 10 },
    }) },
  { slug: 'a2-they-answer-in-english-1x1', w: 1080, h: 1080, html: hero(1080, 1080, {
      kickerTop: 64, kicker: 24, pad: 62,
      exTop: 118, headTop: 428, head: 64, turnTop: 588, turn: 64,
      subTop: 692, sub: 27, subPad: 84,
      mascot: 150, mBottom: 186, mRight: 30,
      lock: 34, inkH: 40, url: 38, lockGap: 14,
      b: { gap: 16, max: 74, r: 28, py: 19, px: 28, tail: 8,
           native: 46, rom: 21, romGap: 7, en: 42, who: 18, whoGap: 8 },
    }) },
  { slug: 'b-every-single-time-9x16', w: 1080, h: 1920, html: everytime },
  { slug: 'c-not-just-your-house-1x1', w: 1080, h: 1080, html: universal },
  { slug: 'd-family-plan-1x1', w: 1080, h: 1080, html: family },
  { slug: 'e-answer-back-1x1', w: 1080, h: 1080, html: answerBack },
  { slug: 'f-made-by-a-father-9x16', w: 1080, h: 1920, html: founder },
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
