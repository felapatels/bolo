// Generates 9:16 (1080x1920) cover/thumbnail PNGs for each social clip.
// Renders self-contained HTML posters with headless Chromium.
//
// Brand: indigo #4F46E5 / teal #0D9488 / accent #14B8A6 / gold #F59E0B,
// Inter + Noto scripts, parrot mascot. Text is kept clear of the platform
// bottom caption/UI safe zone (bottom ~420px reserved).
//
// Usage: node scripts/gen-covers.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMG = resolve(ROOT, 'public/images');
const OUT = resolve(ROOT, 'covers');
const TMP = '/tmp/bolo-covers';

const CHROME =
  process.env.CHROME_BIN ||
  '/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium';

const W = 1080;
const H = 1920;

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

const b64 = (name) => {
  const buf = readFileSync(resolve(IMG, name));
  return `data:image/png;base64,${buf.toString('base64')}`;
};

const mascot = {
  wave: b64('mascot-wave.png'),
  cheer: b64('mascot-cheer.png'),
  thumbsup: b64('mascot-thumbsup.png'),
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@600..800&family=Noto+Sans+Devanagari:wght@600..800&family=Noto+Sans+Gujarati:wght@600..800&family=Noto+Sans+Gurmukhi:wght@600..800&family=Noto+Sans+Kannada:wght@600..800&family=Noto+Sans+Malayalam:wght@600..800&family=Noto+Sans+Tamil:wght@600..800&family=Noto+Sans+Telugu:wght@600..800&display=swap');
`;

const BASE_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; }
  body { font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow:hidden; }
  .stage { position:relative; width:${W}px; height:${H}px; overflow:hidden; }
  /* Bottom safe zone: keep hooks/logo above ~y=1500 (bottom ~420px reserved) */
  .safe-guide { position:absolute; left:0; right:0; bottom:0; height:420px; }
  .font-devanagari{font-family:'Noto Sans Devanagari',sans-serif;}
  .font-bengali{font-family:'Noto Sans Bengali',sans-serif;}
  .font-tamil{font-family:'Noto Sans Tamil',sans-serif;}
  .font-telugu{font-family:'Noto Sans Telugu',sans-serif;}
  .font-gujarati{font-family:'Noto Sans Gujarati',sans-serif;}
  .font-kannada{font-family:'Noto Sans Kannada',sans-serif;}
  .font-gurmukhi{font-family:'Noto Sans Gurmukhi',sans-serif;}
  .font-malayalam{font-family:'Noto Sans Malayalam',sans-serif;}
  .brandpill{display:inline-flex;align-items:center;gap:16px;background:#fff;
    padding:22px 44px;border-radius:999px;box-shadow:0 24px 60px rgba(15,23,42,.28);}
  .brandpill .dot{width:34px;height:34px;border-radius:50%;
    background:linear-gradient(135deg,#4F46E5,#14B8A6);}
  .brandpill .name{font-weight:900;font-size:54px;color:#4F46E5;letter-spacing:-1px;}
`;

/* ---------- Cover 1: Heritage / roots (light, warm) ---------- */
const cover1 = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE_CSS}
  .c1{background:
    radial-gradient(120% 90% at 80% 0%, rgba(20,184,166,.20), transparent 55%),
    radial-gradient(120% 90% at 0% 20%, rgba(79,70,229,.16), transparent 55%),
    linear-gradient(180deg,#FBFCFF 0%, #F1F5FF 55%, #E9FBF6 100%);}
  .blob{position:absolute;border-radius:50%;filter:blur(60px);}
  .kicker{position:absolute;top:150px;left:0;right:0;text-align:center;
    font-weight:800;letter-spacing:.36em;text-transform:uppercase;font-size:34px;color:#0D9488;}
  .headline{position:absolute;top:230px;left:70px;right:70px;text-align:center;
    font-weight:900;font-size:132px;line-height:.98;color:#0F172A;letter-spacing:-3px;}
  .headline em{font-style:normal;background:linear-gradient(120deg,#4F46E5,#14B8A6);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .word-card{position:absolute;top:690px;left:50%;transform:translateX(-50%);
    background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:2px solid rgba(255,255,255,.7);
    border-radius:46px;padding:44px 80px;box-shadow:0 30px 70px rgba(79,70,229,.22);text-align:center;}
  .word-card .native{font-size:150px;font-weight:800;color:#4F46E5;line-height:1;}
  .word-card .rom{margin-top:18px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;
    font-size:32px;color:#64748B;}
  .mascot{position:absolute;bottom:250px;left:50%;transform:translateX(-50%);width:640px;
    filter:drop-shadow(0 40px 50px rgba(15,23,42,.22));}
  .brandpill{position:absolute;bottom:130px;left:50%;transform:translateX(-50%);}
</style></head><body>
  <div class="stage c1">
    <div class="blob" style="width:520px;height:520px;top:-80px;right:-120px;background:rgba(20,184,166,.35);"></div>
    <div class="blob" style="width:560px;height:560px;bottom:340px;left:-160px;background:rgba(79,70,229,.28);"></div>
    <div class="kicker">Your mother tongue</div>
    <h1 class="headline">Get back<br/>to your <em>roots</em></h1>
    <div class="word-card">
      <div class="native font-devanagari">नमस्ते</div>
      <div class="rom">Namaste · Hindi</div>
    </div>
    <img class="mascot" src="${mascot.wave}" alt=""/>
    <div class="brandpill"><span class="dot"></span><span class="name">Bolo!</span></div>
  </div>
</body></html>`;

/* ---------- Cover 2: How it works / speak (dark demo) ---------- */
const cover2 = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE_CSS}
  .c2{background:
    radial-gradient(120% 80% at 50% -10%, #6366F1 0%, #4F46E5 32%, #312E81 72%, #1E1B4B 100%);}
  .grid{position:absolute;inset:0;opacity:.10;
    background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);
    background-size:90px 90px;}
  .kicker{position:absolute;top:160px;left:0;right:0;text-align:center;color:#5EEAD4;
    font-weight:800;letter-spacing:.34em;text-transform:uppercase;font-size:34px;}
  .headline{position:absolute;top:236px;left:64px;right:64px;text-align:center;color:#fff;
    font-weight:900;font-size:128px;line-height:.98;letter-spacing:-3px;}
  .headline .teal{color:#5EEAD4;}
  .demo{position:absolute;top:720px;left:50%;transform:translateX(-50%);
    background:rgba(255,255,255,.98);border-radius:44px;padding:40px 52px;width:840px;
    box-shadow:0 34px 80px rgba(0,0,0,.35);display:flex;align-items:center;gap:34px;}
  .demo .mic{width:118px;height:118px;border-radius:50%;flex:0 0 auto;
    background:linear-gradient(135deg,#4F46E5,#14B8A6);display:flex;align-items:center;justify-content:center;
    box-shadow:0 14px 30px rgba(79,70,229,.4);}
  .demo .mic svg{width:60px;height:60px;}
  .demo .body{flex:1;}
  .demo .body .say{font-size:34px;color:#64748B;font-weight:700;letter-spacing:.02em;}
  .demo .body .phrase{font-size:64px;font-weight:800;color:#0F172A;line-height:1.05;}
  .wave{display:flex;align-items:center;gap:9px;height:74px;margin-top:6px;}
  .wave span{width:11px;border-radius:6px;background:linear-gradient(180deg,#4F46E5,#14B8A6);}
  .score{position:absolute;top:1000px;right:150px;background:#10B981;color:#fff;
    font-weight:900;font-size:44px;padding:20px 40px;border-radius:999px;
    box-shadow:0 18px 40px rgba(16,185,129,.45);transform:rotate(-6deg);}
  .mascot{position:absolute;bottom:250px;left:50%;transform:translateX(-50%);width:600px;
    filter:drop-shadow(0 40px 55px rgba(0,0,0,.4));}
  .brandpill{position:absolute;bottom:130px;left:50%;transform:translateX(-50%);}
</style></head><body>
  <div class="stage c2">
    <div class="grid"></div>
    <div class="kicker">Instant AI feedback</div>
    <h1 class="headline">Stop typing.<br/><span class="teal">Start speaking.</span></h1>
    <div class="demo">
      <div class="mic"><svg viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" fill="#fff"/><path d="M6 11a6 6 0 0 0 12 0M12 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></div>
      <div class="body">
        <div class="say">SAY IT OUT LOUD</div>
        <div class="phrase font-devanagari">नमस्ते</div>
        <div class="wave">
          ${[26,52,70,40,64,30,58,44,72,36,54,24].map((h)=>`<span style="height:${h}px"></span>`).join('')}
        </div>
      </div>
    </div>
    <div class="score">98% ✓</div>
    <img class="mascot" src="${mascot.cheer}" alt=""/>
    <div class="brandpill"><span class="dot"></span><span class="name">Bolo!</span></div>
  </div>
</body></html>`;

/* ---------- Cover 3: Breadth + CTA (bold indigo) ---------- */
const chips = [
  { t: 'নমস্কার', f: 'font-bengali' },
  { t: 'வணக்கம்', f: 'font-tamil' },
  { t: 'નમસ્તે', f: 'font-gujarati' },
  { t: 'ನಮಸ್ಕಾರ', f: 'font-kannada' },
  { t: 'నమస్కారం', f: 'font-telugu' },
  { t: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', f: 'font-gurmukhi' },
];
const cover3 = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE_CSS}
  .c3{background:radial-gradient(ellipse 120% 90% at 50% 12%, #6366F1 0%, #4F46E5 40%, #3730A3 78%, #1E1B4B 100%);}
  .spark{position:absolute;border-radius:50%;background:rgba(255,255,255,.55);}
  .big{position:absolute;top:150px;left:0;right:0;text-align:center;}
  .big .num{font-weight:900;font-size:340px;line-height:.82;color:#fff;letter-spacing:-10px;
    text-shadow:0 30px 60px rgba(0,0,0,.3);}
  .big .num b{color:#5EEAD4;}
  .big .sub{margin-top:8px;font-weight:800;font-size:60px;color:#fff;letter-spacing:-1px;}
  .big .sub .g{color:#FBBF24;}
  .chips{position:absolute;top:730px;left:60px;right:60px;display:flex;flex-wrap:wrap;
    justify-content:center;gap:20px 22px;}
  .chip{background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.28);
    color:#fff;font-weight:800;font-size:50px;padding:15px 36px;border-radius:999px;
    backdrop-filter:blur(6px);}
  .cta{position:absolute;top:1110px;left:50%;transform:translateX(-50%);
    background:#FBBF24;color:#1E1B4B;font-weight:900;font-size:50px;padding:26px 60px;
    border-radius:999px;box-shadow:0 22px 50px rgba(251,191,36,.5);letter-spacing:-.5px;white-space:nowrap;}
  .mascot{position:absolute;bottom:150px;right:-70px;width:470px;
    filter:drop-shadow(0 40px 55px rgba(0,0,0,.4));}
  .brandpill{position:absolute;bottom:130px;left:110px;}
</style></head><body>
  <div class="stage c3">
    ${[[120,240,20],[900,320,14],[200,700,12],[980,760,18],[540,150,10],[820,120,12]].map(([x,y,s])=>`<div class="spark" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;"></div>`).join('')}
    <div class="big">
      <div class="num"><b>22</b></div>
      <div class="sub">official languages.<br/><span class="g">One app.</span></div>
    </div>
    <div class="chips">
      ${chips.map((c)=>`<span class="chip ${c.f}">${c.t}</span>`).join('')}
    </div>
    <div class="cta">Which one are you learning?</div>
    <img class="mascot" src="${mascot.thumbsup}" alt=""/>
    <div class="brandpill"><span class="dot"></span><span class="name">Bolo!</span></div>
  </div>
</body></html>`;

const covers = [
  { id: 1, slug: 'cover-1-roots', html: cover1 },
  { id: 2, slug: 'cover-2-how-it-works', html: cover2 },
  { id: 3, slug: 'cover-3-languages', html: cover3 },
];

for (const c of covers) {
  const htmlPath = resolve(TMP, `${c.slug}.html`);
  const pngPath = resolve(OUT, `${c.slug}.png`);
  writeFileSync(htmlPath, c.html);
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${W},${H}`,
      '--virtual-time-budget=15000',
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore' }
  );
  console.log(`wrote ${pngPath}`);
}
console.log('done');
