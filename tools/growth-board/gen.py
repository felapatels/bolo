import sys, html, datetime, re
sys.path.insert(0, sys.path[0] or '.')
from data import build
from sections import (CHANNELS, RUNBOOK, WA, DAYS, DAYKIND,
                      GRID_BADGE, GRID_SEED, GRID_LAYOUT, GRID_HELD)

weeks = build()
NEST_MODE = (len(sys.argv)>2 and sys.argv[2]=='nest')
TODAY = datetime.date(2026,8,26)
DIWALI = datetime.date(2026,11,8)

def esc(s): return html.escape(s, quote=True)
def d(dt): return dt.strftime("%a %-d %b").upper()
def dlong(dt): return dt.strftime("%A %-d %B")

KIND = {
  "video":  ("VIDEO",  "k-video"),
  "card":   ("CARD",   "k-card"),
  "pillar": ("PILLAR", "k-pillar"),
  "repost": ("REPOST", "k-repost"),
  # A withdrawn pillar. Deliberately loud: an empty slot on a schedule is a
  # thing to fix, not a thing to scroll past.
  "gap":    ("EMPTY",  "k-gap"),
}

out = []
A = out.append

A('<title>Bolo Departure Board</title>')
if not NEST_MODE:
    A('<link rel="preconnect" href="https://fonts.googleapis.com">')
    A('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    A('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
      'family=Archivo+Narrow:wght@500;600;700&'
      'family=IBM+Plex+Mono:wght@400;500;600&'
      'family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">')

A('''<style>
:root{
  --ground:#EAEDE8; --surface:#FFFFFF; --surface-2:#DEE5DD; --sunk:#F2F5F1;
  --ink:#101C1A; --muted:#556661; --faint:#7F908B; --line:#C7D1C6;
  --teal:#0B6B5C; --ochre:#A24A16; --indigo:#3B3AA8;
  --board:#132320; --board-ink:#E8F0EA; --board-muted:#8FA69F;
  --shadow:0 1px 2px rgba(16,28,26,.06), 0 12px 30px rgba(16,28,26,.07);
  --disp:__DISP__;
  --body:__BODY__;
  --mono:__MONO__;
  --indic:"Noto Sans Devanagari","Noto Sans Tamil","Noto Sans Gujarati","Noto Sans Gurmukhi",
          "Noto Sans Bengali","Noto Sans Telugu","Noto Sans Kannada","Noto Sans Malayalam",
          "Noto Sans Oriya","Noto Nastaliq Urdu","Noto Sans Ol Chiki","Noto Sans Meetei Mayek",
          "Devanagari Sangam MN","Tamil Sangam MN","Gujarati Sangam MN","Gurmukhi Sangam MN",
          "Bangla Sangam MN","Telugu Sangam MN","Kannada Sangam MN","Malayalam Sangam MN",
          "Oriya Sangam MN","Geeza Pro","Nirmala UI", sans-serif;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0C1513; --surface:#14201E; --surface-2:#1D2A27; --sunk:#101A18;
    --ink:#E7EEE9; --muted:#93A5A0; --faint:#748680; --line:#26332F;
    --teal:#4ECDB6; --ochre:#E9945B; --indigo:#9391FF;
    --board:#08100F; --board-ink:#E7EEE9; --board-muted:#7C918B;
    --shadow:0 1px 2px rgba(0,0,0,.45), 0 12px 30px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"]{
  --ground:#0C1513; --surface:#14201E; --surface-2:#1D2A27; --sunk:#101A18;
  --ink:#E7EEE9; --muted:#93A5A0; --faint:#748680; --line:#26332F;
  --teal:#4ECDB6; --ochre:#E9945B; --indigo:#9391FF;
  --board:#08100F; --board-ink:#E7EEE9; --board-muted:#7C918B;
  --shadow:0 1px 2px rgba(0,0,0,.45), 0 12px 30px rgba(0,0,0,.4);
}

*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:var(--body);font-size:16.5px;line-height:1.62;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
h1,h2,h3{font-family:var(--disp);margin:0;line-height:1.02;text-wrap:balance;letter-spacing:-.015em}
a{color:var(--teal)}
:focus-visible{outline:2.5px solid var(--ochre);outline-offset:3px;border-radius:4px}

/* ---- masthead ---- */
header{padding:64px 0 30px}
.kicker{font-family:var(--mono);font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--ochre);margin:0 0 16px}
h1{font-size:clamp(46px,7.4vw,86px);font-weight:700;text-transform:uppercase;letter-spacing:-.02em}
.sub{font-size:19px;color:var(--muted);max-width:60ch;margin:18px 0 0}

/* ---- now boarding ---- */
.boarding{background:var(--board);color:var(--board-ink);border-radius:4px;margin-top:32px;
  overflow:hidden;box-shadow:var(--shadow)}
.boarding .bhead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;
  padding:20px 26px 16px;border-bottom:1px solid rgba(232,240,234,.16)}
.blamp{width:9px;height:9px;border-radius:50%;background:var(--ochre);flex:none;
  box-shadow:0 0 0 4px rgba(162,74,22,.22)}
.bhead .t{font-family:var(--mono);font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--board-muted)}
.bhead .n{font-family:var(--disp);font-size:26px;font-weight:700;text-transform:uppercase;
  letter-spacing:.01em;margin-left:auto}
.brow{display:grid;grid-template-columns:104px 1fr auto;gap:18px;align-items:center;
  padding:16px 26px;border-bottom:1px solid rgba(232,240,234,.09)}
.brow:last-child{border-bottom:0}
.brow .when{font-family:var(--mono);font-size:12.5px;font-weight:500;letter-spacing:.06em;
  color:var(--ochre);font-variant-numeric:tabular-nums}
.brow .what{font-family:var(--mono);font-size:14px;word-break:break-word}
.brow .plat{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--board-muted);text-align:right}

/* ---- rule strip ---- */
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:4px;margin-top:34px;overflow:hidden}
.rule{background:var(--surface);padding:20px 22px}
.rule .n{font-family:var(--disp);font-size:38px;font-weight:700;line-height:1;color:var(--teal);
  font-variant-numeric:tabular-nums}
.rule .l{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--faint);margin-top:8px}
.rule p{margin:9px 0 0;font-size:14.5px;line-height:1.48;color:var(--muted)}

/* ---- sections ---- */
section{padding:56px 0 0}
.shead{border-top:2px solid var(--ink);padding-top:15px;margin-bottom:22px}
.shead h2{font-size:clamp(26px,3.4vw,38px);font-weight:700;text-transform:uppercase}
.shead p{margin:10px 0 0;color:var(--muted);max-width:66ch}

/* ---- the board ---- */
.board{border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--surface)}
details.week{border-bottom:1px solid var(--line)}
details.week:last-child{border-bottom:0}
summary{list-style:none;cursor:pointer;display:grid;
  grid-template-columns:50px 152px 1fr auto;gap:16px;align-items:center;
  padding:14px 20px;background:var(--surface);transition:background .12s}
summary::-webkit-details-marker{display:none}
summary:hover{background:var(--sunk)}
details[open]>summary{background:var(--sunk);border-bottom:1px solid var(--line)}
.wk{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--faint);
  font-variant-numeric:tabular-nums;letter-spacing:.06em}
.glyph{font-family:var(--indic);font-size:23px;line-height:1.3;color:var(--indigo);
  white-space:nowrap;overflow:hidden;text-overflow:clip}
.lang{display:block;font-family:var(--disp);font-size:21px;font-weight:600;
  text-transform:uppercase;letter-spacing:.01em;line-height:1.12}
.span{display:block;font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.05em;
  font-variant-numeric:tabular-nums;margin-top:3px}
.chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.chip{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;
  padding:3px 8px;border-radius:2px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.k-video{border-color:var(--teal);color:var(--teal)}
.k-gap{border-color:var(--ochre);color:var(--ochre);border-style:dashed}
.k-card{border-color:var(--indigo);color:var(--indigo)}
.k-pillar{border-color:var(--ochre);color:var(--ochre)}
.k-repost{border-style:dashed}
.wnote{grid-column:1/-1;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ochre);padding-top:6px}

/* ---- slots ---- */
.slots{padding:6px 20px 22px;display:flex;flex-direction:column;gap:2px}
.slot{display:grid;grid-template-columns:104px 1fr;gap:18px;padding:18px 0;
  border-bottom:1px dashed var(--line)}
.slot:last-child{border-bottom:0}
.slot .when{font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.06em;
  color:var(--ink);font-variant-numeric:tabular-nums;padding-top:2px}
.slot .when em{display:block;font-style:normal;font-weight:400;color:var(--faint);font-size:11px;margin-top:3px}
.file{font-family:var(--mono);font-size:14px;font-weight:500;word-break:break-word}
.meta,.call p,ul.plain li{font-family:var(--body),var(--indic)}
.meta{font-size:14px;color:var(--muted);margin:6px 0 0;max-width:64ch}
.meta b{color:var(--ink);font-weight:600}
.capwrap{margin-top:12px;border:1px solid var(--line);border-radius:3px;background:var(--sunk);overflow:hidden}
.captop{display:flex;align-items:center;gap:10px;padding:7px 10px 7px 12px;
  border-bottom:1px solid var(--line);background:var(--surface-2)}
.captop .cl{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
button.copy{margin-left:auto;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;
  text-transform:uppercase;padding:5px 11px;border:1px solid var(--line);border-radius:2px;
  background:var(--surface);color:var(--ink);cursor:pointer;transition:background .12s,color .12s}
button.copy:hover{background:var(--teal);border-color:var(--teal);color:var(--surface)}
button.copy[data-done="1"]{background:var(--teal);border-color:var(--teal);color:var(--surface)}
pre.cap{margin:0;padding:14px 16px;font-family:__CAPFONT__,var(--indic);font-size:14.5px;line-height:1.72;
  white-space:pre-wrap;word-break:break-word;color:var(--ink)}
pre.cap .ind{font-family:var(--indic)}
label.done{display:inline-flex;align-items:center;gap:8px;margin-top:11px;cursor:pointer;
  font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint)}
label.done input{accent-color:var(--teal);width:15px;height:15px;cursor:pointer}
.slot.is-done .file,.slot.is-done .meta{opacity:.42}
.slot.is-done .file{text-decoration:line-through}

/* ---- callouts ---- */
.call{border:1px solid var(--line);border-left:3px solid var(--ochre);border-radius:3px;
  background:var(--surface);padding:20px 24px;margin-top:20px}
.call h3{font-family:var(--disp);font-size:20px;font-weight:700;text-transform:uppercase;
  letter-spacing:.01em;color:var(--ochre)}
.call p{margin:9px 0 0;color:var(--muted);font-size:15px}
.call p b{color:var(--ink)}
.call.teal{border-left-color:var(--teal)} .call.teal h3{color:var(--teal)}
.call.indigo{border-left-color:var(--indigo)} .call.indigo h3{color:var(--indigo)}

ul.plain{margin:12px 0 0;padding-left:19px;color:var(--muted);font-size:15px}
ul.plain li{margin:6px 0}
ul.plain b{color:var(--ink)}

footer{padding:56px 0 76px;color:var(--faint);font-family:var(--mono);font-size:11.5px;
  letter-spacing:.08em;border-top:1px solid var(--line);margin-top:56px}

@media (max-width:760px){
  summary{grid-template-columns:44px 1fr;gap:12px;row-gap:4px}
  .glyph{grid-column:2;font-size:22px}
  .chips{grid-column:2;justify-content:flex-start;margin-top:4px}
  .slot{grid-template-columns:1fr;gap:8px}
}
@media (prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important}}
/* ---- launch picker ---- */
.picker{background:var(--surface);border:1px solid var(--line);border-radius:4px;
  padding:20px 24px 22px;margin-top:32px}
.picker .pl{font-family:var(--mono);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--faint);margin:0 0 5px}
.picker .ph{font-family:var(--disp);font-size:23px;font-weight:700;text-transform:uppercase;
  letter-spacing:.01em;margin:0}
.picker .pd{margin:9px 0 16px;font-size:14.5px;color:var(--muted);max-width:62ch}
.picker .pd b{color:var(--ink)}
.opts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button.opt{font-family:var(--mono);font-size:12px;letter-spacing:.07em;padding:9px 14px;
  border:1px solid var(--line);border-radius:2px;background:var(--sunk);color:var(--ink);
  cursor:pointer;transition:background .12s,border-color .12s,color .12s;
  font-variant-numeric:tabular-nums;text-transform:uppercase;line-height:1.15}
button.opt:hover{border-color:var(--teal)}
button.opt[aria-pressed="true"]{background:var(--teal);border-color:var(--teal);color:var(--surface)}
button.opt .rec{display:block;font-size:9px;letter-spacing:.14em;opacity:.75;margin-top:3px}
.opts .other{display:flex;align-items:center;gap:9px;margin-left:4px}
.opts .other span{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--faint)}
input[type="date"]{font-family:var(--mono);font-size:12px;padding:8px 10px;border:1px solid var(--line);
  border-radius:2px;background:var(--sunk);color:var(--ink);color-scheme:light dark}
/* ---- runbook ---- */
.rank{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:4px;overflow:hidden;margin-top:22px}
.rk{background:var(--surface);display:grid;grid-template-columns:44px 1fr 132px;gap:16px;
  padding:16px 20px;align-items:start}
.rk .p{font-family:var(--disp);font-size:27px;font-weight:700;line-height:1;color:var(--teal);
  font-variant-numeric:tabular-nums}
.rk h4{font-family:var(--disp);font-size:19px;font-weight:600;text-transform:uppercase;
  letter-spacing:.01em;margin:0}
.rk p{margin:6px 0 0;font-size:14.5px;color:var(--muted);font-family:var(--body),var(--indic)}
.rk p b{color:var(--ink)}
.rk .temp{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;
  text-align:right;padding-top:6px}
.t-warm{color:var(--ochre)} .t-cold{color:var(--faint)}
.rk.dim .p{color:var(--faint)}

.run{border:1px solid var(--line);border-radius:4px;overflow:hidden;margin-top:22px;background:var(--surface)}
.step{display:grid;grid-template-columns:126px 1fr;gap:18px;padding:16px 20px;
  border-bottom:1px dashed var(--line)}
.step:last-child{border-bottom:0}
.step .clock{font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.05em;
  color:var(--ochre);font-variant-numeric:tabular-nums}
.step .clock em{display:block;font-style:normal;font-weight:400;color:var(--faint);
  font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;margin-top:3px}
.step h4{font-family:var(--disp);font-size:18px;font-weight:600;text-transform:uppercase;
  letter-spacing:.01em;margin:0}
.step p{margin:6px 0 0;font-size:14.5px;color:var(--muted);max-width:64ch;
  font-family:var(--body),var(--indic)}
.step p b{color:var(--ink)}
.step.hot{background:var(--sunk)}
@media (max-width:760px){
  .rk{grid-template-columns:38px 1fr} .rk .temp{grid-column:2;text-align:left;padding-top:2px}
  .step{grid-template-columns:1fr;gap:6px}
}
/* ---- 30 day plan ---- */
.days{border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--surface);margin-top:22px}
.day{display:grid;grid-template-columns:56px 104px 1fr;gap:16px;padding:13px 20px;
  border-bottom:1px solid var(--line);align-items:start}
.day:last-child{border-bottom:0}
.day .dn{font-family:var(--disp);font-size:21px;font-weight:700;line-height:1.2;
  font-variant-numeric:tabular-nums;color:var(--ink)}
.day .dd{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--faint);
  display:block;font-weight:400;margin-top:2px}
.day .kd{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;
  padding:3px 7px;border:1px solid var(--line);border-radius:2px;color:var(--muted);
  display:inline-block;white-space:nowrap;margin-top:3px}
.day h4{font-family:var(--disp);font-size:18px;font-weight:600;margin:0;letter-spacing:.005em;
  text-transform:none}
.day p{margin:5px 0 0;font-size:14.5px;color:var(--muted);max-width:66ch;
  font-family:var(--body),var(--indic)}
.day p b{color:var(--ink)}
.d-launch{border-color:var(--ochre);color:var(--ochre)}
.d-post{border-color:var(--teal);color:var(--teal)}
.d-rest{border-style:dashed}
.d-own{border-color:var(--indigo);color:var(--indigo)}
.day.is-launch{background:var(--sunk)}
.day.is-launch .dn{color:var(--ochre)}
.day.is-rest .dn,.day.is-rest h4{color:var(--faint)}
.after{margin-top:22px}
@media (max-width:760px){
  .day{grid-template-columns:52px 1fr;gap:12px}
  .day .kd{grid-column:2;margin-top:0}
  .day h4,.day p{grid-column:2}
}
</style>''')

SCRIPT_BLOCK = """<script>
(function(){
  var CKEY="bolo-board-v2", LKEY="bolo-board-launch", DEF="2026-08-31";
  var DIWALI=new Date(2026,10,8);
  var DAYS=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  var MONS=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  var LONGD=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var LONGM=["January","February","March","April","May","June","July","August",
             "September","October","November","December"];

  function parse(iso){var p=iso.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
  function add(d,n){var x=new Date(d.getTime());x.setDate(x.getDate()+n);return x;}
  function fmt(d,k){
    if(k==="dayabbr")return DAYS[d.getDay()];
    if(k==="daymon")return d.getDate()+" "+MONS[d.getMonth()];
    if(k==="long")return LONGD[d.getDay()]+" "+d.getDate()+" "+LONGM[d.getMonth()];
    return DAYS[d.getDay()]+" "+d.getDate()+" "+MONS[d.getMonth()];
  }
  function readL(){try{return localStorage.getItem(LKEY)||DEF}catch(e){return DEF}}
  function writeL(v){try{localStorage.setItem(LKEY,v)}catch(e){}}

  var opts=document.getElementById("opts");
  var anyday=document.getElementById("anyday");

  function render(iso){
    var base=parse(iso);
    document.querySelectorAll("[data-off]").forEach(function(el){
      var f=el.getAttribute("data-fmt"); if(!f) return;
      el.textContent=fmt(add(base,+el.getAttribute("data-off")),f);
    });
    // cadence line
    var c=document.getElementById("rcadence");
    if(c){c.textContent=fmt(base,"dayabbr")+", "+fmt(add(base,2),"dayabbr")+", "
      +fmt(add(base,4),"dayabbr")+". Two days apart, every week.";}
    // runway
    var r=document.getElementById("rrunway");
    if(r){r.textContent=fmt(base,"long")+" to "+fmt(add(base,151),"long")
      +". Nothing new to invent in between.";}
    // buttons
    Array.prototype.forEach.call(opts.querySelectorAll("button.opt"),function(b){
      b.setAttribute("aria-pressed", b.getAttribute("data-iso")===iso ? "true":"false");
    });
    if(anyday.value!==iso) anyday.value=iso;
    // diwali week
    var dw=0;
    document.querySelectorAll("details.week").forEach(function(dt){
      var s=add(base,+dt.getAttribute("data-off")), e=add(s,6);
      var hit = DIWALI>=s && DIWALI<=e;
      var n=dt.querySelector(".wnote");
      if(n){ if(hit){n.removeAttribute("hidden"); dw=+dt.getAttribute("data-week");}
             else n.setAttribute("hidden",""); }
    });
    var dl=document.getElementById("dwk");
    if(dl) dl.textContent = dw ? String(dw) : "the gap between 10 and 11";
    boarding(base);
  }

  function boarding(base){
    var today=new Date(); today.setHours(0,0,0,0);
    var diff=Math.floor((today-base)/86400000);
    var wk = diff<0 ? 1 : Math.min(22, Math.floor(diff/7)+1);
    var dt=document.querySelector('details.week[data-week="'+wk+'"]');
    if(!dt) return;
    document.getElementById("bstate").textContent =
      diff<0 ? ("Launches "+fmt(base,"long")) : "Now boarding";
    document.getElementById("btitle").textContent =
      "Week "+(wk<10?"0":"")+wk+" \u00b7 "+dt.querySelector(".lang").textContent;
    var rows=document.getElementById("brows"); rows.innerHTML="";
    dt.querySelectorAll(".slot").forEach(function(sl){
      var when=sl.querySelector(".when span").textContent;
      var file=sl.querySelector(".file").textContent;
      var meta=sl.querySelector(".meta b").textContent.replace(/\\.$/,"");
      var row=document.createElement("div"); row.className="brow";
      var a=document.createElement("span"); a.className="when"; a.textContent=when;
      var b=document.createElement("span"); b.className="what"; b.textContent=file;
      var c=document.createElement("span"); c.className="plat"; c.textContent=meta;
      row.appendChild(a); row.appendChild(b); row.appendChild(c); rows.appendChild(row);
    });
  }

  opts.addEventListener("click",function(e){
    var b=e.target.closest("button.opt"); if(!b) return;
    var iso=b.getAttribute("data-iso"); writeL(iso); render(iso);
  });
  anyday.addEventListener("change",function(){
    if(!anyday.value) return; writeL(anyday.value); render(anyday.value);
  });

  // ticks
  function readC(){try{return JSON.parse(localStorage.getItem(CKEY))||{}}catch(e){return{}}}
  function writeC(o){try{localStorage.setItem(CKEY,JSON.stringify(o))}catch(e){}}
  var st=readC();
  document.querySelectorAll(".slot").forEach(function(slot){
    var id=slot.getAttribute("data-slot"), box=slot.querySelector("label.done input");
    if(!box) return;
    if(st[id]){box.checked=true;slot.classList.add("is-done");}
    box.addEventListener("change",function(){
      slot.classList.toggle("is-done",box.checked);
      var s=readC(); if(box.checked){s[id]=1}else{delete s[id]} writeC(s);
    });
  });

  // copy
  function fallback(txt,cb){
    var ta=document.createElement("textarea"); ta.value=txt; ta.setAttribute("readonly","");
    ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select();
    try{document.execCommand("copy");cb()}catch(e){}
    document.body.removeChild(ta);
  }
  document.querySelectorAll("button.copy").forEach(function(btn){
    btn.addEventListener("click",function(){
      var txt=btn.closest(".capwrap").querySelector("pre.cap").textContent;
      var done=function(){btn.textContent="Copied";btn.setAttribute("data-done","1");
        setTimeout(function(){btn.textContent="Copy";btn.removeAttribute("data-done")},1600);};
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(done,function(){fallback(txt,done)});
      }else{fallback(txt,done)}
    });
  });

  render(readL());
})();
</script>"""

# ---------- masthead ----------
A('<div class="wrap">')
A('<header>')
A('<p class="kicker">Bolo! &middot; 22 languages &middot; 22 weeks &middot; 66 posts</p>')
A('<h1>Departure Board</h1>')
A('<p class="sub">One language a week. Three posts, two days apart, anchored to whatever day you '
  'launch on. Every caption below is finished and ready to paste, so nothing has to be written '
  'on the day.</p>')

# ---- launch picker ----
A('<div class="picker">')
A('<p class="pl">Launch day</p>')
A('<h2 class="ph">Pick day one. The board re-anchors to it.</h2>')
A('<p class="pd">The build ships this weekend, and it carries most of the value. '
  '<b>Do not point your first fifty people at a store listing on the same day the build lands.</b> '
  'Give it a day to settle and to be installed by someone who is not you.</p>')
A('<div class="opts" id="opts">')
for iso,label,rec in [
    ("2026-08-29","Sat 29 Aug",""),
    ("2026-08-30","Sun 30 Aug",""),
    ("2026-08-31","Mon 31 Aug","Recommended"),
    ("2026-09-01","Tue 1 Sep",""),
]:
    A('<button class="opt" type="button" data-iso="%s" aria-pressed="false">%s%s</button>'
      % (iso, label, ('<span class="rec">%s</span>' % rec) if rec else ''))
A('<span class="other"><span>or</span><input type="date" id="anyday" value="2026-08-31" '
  'min="2026-08-26" max="2027-06-30"></span>')
A('</div></div>')

# ---- now boarding ----
A('<div class="boarding">')
A('<div class="bhead"><span class="blamp"></span><span class="t" id="bstate">Now boarding</span>'
  '<span class="n" id="btitle"></span></div>')
A('<div id="brows"></div>')
A('</div>')

# ---- rules ----
A('<div class="rules">')
A('<div class="rule"><span class="n">3</span><div class="l">posts per week</div>'
  '<p id="rcadence">Two days apart, anchored to your launch day.</p></div>')
A('<div class="rule"><span class="n">1</span><div class="l">language per week</div>'
  '<p>Concentrated signal teaches a cold account faster than a scattered one.</p></div>')
A('<div class="rule"><span class="n">1</span><div class="l">sitting per week</div>'
  '<p>One evening, twenty minutes, schedule all three. Never open the app to post.</p></div>')
A('<div class="rule"><span class="n">22</span><div class="l">weeks of runway</div>'
  '<p id="rrunway"></p></div>')
A('</div>')
A('</header>')

# ---------- why this shape ----------
A('<section><div class="shead"><h2>Why one language a week</h2>'
  '<p>The old plan spread three campaigns across every week. That was right when the only assets were '
  'stills. You now have a video in all 22 languages, and a video plus its matching card, posted to the '
  'same community two days apart, hits the same people twice in the format each does best.</p></div>')
A('<div class="call teal"><h3>Never post the variants together</h3>'
  '<p><b>Only 3 seconds of 33 differ between them.</b> Both platforms hash for exactly that, so a block '
  'of near-identical uploads reads as duplicate content and most of them get suppressed. One a week is '
  'not caution, it is the only way they all get seen.</p></div>')
A('<div class="call indigo"><h3>Gujarati leads, not Punjabi</h3>'
  '<p>Punjabi is the larger diaspora, which is why it led the old plan. <b>On a brand new account the '
  'first fifty viewers are hand-delivered, not discovered</b>, and the network you can actually fill a '
  'room from is Gujarati. Post to the room you have.</p></div>')
A('<div class="call"><h3>The build is the reason to wait a day</h3>'
  '<p>This build carries most of the value, so week one sends real traffic at it. '
  '<b>A Saturday or Sunday launch puts your first fifty installs on a binary that shipped hours '
  'earlier</b>, with nobody but you having opened it. Monday costs you two days and buys you a '
  'weekend of the build being live, plus the time to seed the WhatsApp groups and '
  'r/ABCDesis before anything posts.</p></div>')
A('</section>')

# ---------- seeding + 30 day plan ----------
A('<section><div class="shead"><h2>The first fifty</h2>'
  '<p>Everything on the board assumes someone sees post one. On an account with no followers, '
  'nobody does unless you put them there by hand. This is that part, and it is the part that '
  'actually decides whether any of the rest works.</p></div>')

A('<div class="call"><h3>Ranked by what you actually own</h3>'
  '<p>Worth saying plainly: <b>organic social is fourth on this list by expected value and first by '
  'the amount of work you have put into it.</b> The board is worth building because it compounds. '
  'It is not where your first hundred users come from.</p></div>')
A('<div class="rank">')
for n,title,temp,desc in CHANNELS:
    A('<div class="rk%s"><span class="p">%d</span>'
      '<div><h4>%s</h4><p>%s</p></div>'
      '<span class="temp t-%s">%s</span></div>'
      % ("" if n<=3 else " dim", n, title, desc, temp,
         "Warm &middot; yours" if temp=="warm" else "Cold &middot; rented"))
A('</div>')

# ---- seed the grid, BEFORE launch night ----
# Placed here rather than in the 30 day plan because it is chronologically
# before the launch post, and the launch post is what makes an empty grid
# expensive: it sends its first fifty visitors to a profile.
A('<div class="shead" style="margin-top:52px"><h2>Seed the grid first</h2>'
  '<p>The launch post sends people to a <b>profile</b>, and an empty grid is where they decide '
  'this is not a real thing yet. Nine posts is the smallest number that fills a visible 3x3. '
  '<b>All of this happens before the runbook below, not on the night.</b></p></div>')

A('<div class="call"><h3>One badge set, and never mix them</h3>'
  '<p>Both folders hold the same 40 filenames and differ only in the store badge. '
  '<b>A feed carrying both states reads as a rendering bug, not a launch.</b></p></div>')
A('<div class="rank">')
for i,(cond,folder) in enumerate(GRID_BADGE):
    A('<div class="rk%s"><span class="p">%d</span>'
      '<div><h4>%s</h4><p class="file">%s</p></div></div>'
      % ("" if i==0 else " dim", i+1, esc(cond), esc(folder)))
A('</div>')
A('<p class="meta"><b>Mind the folder name.</b> <span class="file">bolocampaignsplaysoon</span> '
  'without the <span class="file">2</span> is an older nested copy with subfolders and no images '
  'at the top level. The one you want is <span class="file">bolocampaignsplaysoon 2</span>.</p>')

A('<div class="call teal" style="margin-top:26px"><h3>Post 1 first, 9 last</h3>'
  '<p>Instagram puts the newest post top-left, so <b>this list is deliberately the reverse of how '
  'the grid will read.</b> Space them over two or three days, three a day. '
  'Nine in one sitting looks automated and can get throttled.</p></div>')

for n,fname,why,cap in GRID_SEED:
    A('<div class="capwrap" style="margin-top:14px"><div class="captop">'
      '<span class="cl">%d &middot; %s</span>'
      '<button class="copy" type="button">Copy</button></div>' % (n, esc(why)))
    A('<p class="file" style="padding:12px 16px 0">%s</p>' % esc(fname))
    A('<pre class="cap">%s</pre></div>' % esc(cap))

A('<div class="shead" style="margin-top:40px"><h3>What the grid reads like when you are done</h3></div>')
A('<div class="capwrap"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line)">')
for row in GRID_LAYOUT:
    for cell in row:
        A('<div class="file" style="background:var(--surface);padding:14px 12px;font-size:11.5px">%s</div>' % esc(cell))
A('</div></div>')

A('<div class="shead" style="margin-top:40px"><h3>What this deliberately leaves unspent</h3></div>')
A('<div class="rules">')
for title,body in GRID_HELD:
    A('<div class="rule"><h4>%s</h4><p>%s</p></div>' % (esc(title), body))
A('</div>')

A('<div class="shead" style="margin-top:52px"><h2>Launch night, minute by minute</h2>'
  '<p>Two and a half hours. Put nothing else in the evening.</p></div>')
A('<div class="run">')
for clock,rel,title,body in RUNBOOK:
    hot = ' hot' if rel=="The hour that counts" else ''
    A('<div class="step%s"><div class="clock">%s<em>%s</em></div>'
      '<div><h4>%s</h4><p>%s</p></div></div>' % (hot, clock, rel, title, body))
A('</div>')

A('<div class="shead" style="margin-top:52px"><h2>What to actually send</h2>'
  '<p>Send the point, never the link and a favour. <b>Ask for a comment, not a like</b>, because a '
  'comment is worth more to the algorithm and it is an easier thing to give.</p></div>')
for label,txt in WA:
    A('<div class="capwrap" style="margin-top:14px"><div class="captop">'
      '<span class="cl">%s</span><button class="copy" type="button">Copy</button></div>' % esc(label))
    A('<pre class="cap">%s</pre></div>' % esc(txt))

A('<div class="call teal" style="margin-top:26px"><h3>I was wrong about Reddit on day one</h3>'
  '<p>I told you to seed r/ABCDesis at launch. <b>Do not.</b> A brand new account posting a link to '
  'its own product gets auto-filtered or banned, and most subreddits ban self-promotion outright. '
  'Read the sidebar rules, spend two weeks commenting as a person, then post the story rather than '
  'the ad and say plainly that you built it. That is day 25 on the plan below, not day one.</p></div>')
A('</section>')

# ---------- the 30 days ----------
A('<section><div class="shead"><h2>Thirty days, one thing a day</h2>'
  '<p>Five days of prep, then thirty. <b>Every day has exactly one action</b>, including the days '
  'where the action is to do nothing. The dates follow whatever launch day you picked.</p></div>')
A('<div class="days">')
for dnum,kind,title,body in DAYS:
    lab,cls = DAYKIND[kind]
    off = dnum-1 if dnum>=1 else dnum
    extra = " is-launch" if kind=="launch" else (" is-rest" if kind=="rest" else "")
    dlabel = ("D%d" % dnum) if dnum>=1 else ("D&minus;%d" % abs(dnum))
    A('<div class="day%s"><div class="dn">%s<span class="dd" data-off="%d" data-fmt="daymon"></span></div>'
      '<div><span class="kd %s">%s</span></div>'
      '<div><h4>%s</h4><p>%s</p></div></div>' % (extra, dlabel, off, cls, lab, title, body))
A('</div>')

A('<div class="call after"><h3>And then it repeats</h3>'
  '<p>After day 30 the week has a shape and you stop needing a calendar for it. '
  '<b>Three posting days, one reply day, one rest day, one fix day, one read day.</b> '
  'The board carries the posting slots out to week 22. Everything else on this page is the same '
  'seven day loop, and the only thing that changes is which language week you are in.</p></div>')
A('</section>')

# ---------- the board ----------
A('<section><div class="shead"><h2>The board</h2>'
  '<p>Every slot carries its file, where it goes, and the caption to paste. '
  'Open a week to work it. Tick a slot when it is scheduled; the ticks are remembered in this '
  'browser only, so they will not follow you to another device.</p></div>')
A('<div class="board">')

for w in weeks:
    A('<details class="week" data-week="%d" data-off="%d"%s>'
      % (w["wk"], w["base"], ' open' if w["wk"]==1 else ''))
    A('<summary>')
    A('<span class="wk">W%02d</span>' % w["wk"])
    A('<span class="glyph">%s</span>' % esc(w["script"]))
    A('<span><span class="lang">%s</span><span class="span">'
      '<span data-off="%d" data-fmt="daymon"></span> &ndash; '
      '<span data-off="%d" data-fmt="daymon"></span></span></span>'
      % (esc(w["name"]), w["base"], w["base"]+4))
    A('<span class="chips">')
    for s in w["slots"]:
        lab,cls = KIND[s["kind"]]
        A('<span class="chip %s"><b data-off="%d" data-fmt="dayabbr"></b> %s</span>'
          % (cls, s["off"], lab))
    A('</span>')
    A('<span class="wnote" hidden>Diwali falls Sunday 8 November, inside this week</span>')
    A('</summary>')

    A('<div class="slots">')
    for s in w["slots"]:
        lab,cls = KIND[s["kind"]]
        sid = "w%02d-s%d" % (w["wk"], s["off"])
        A('<div class="slot" data-slot="%s">' % sid)
        A('<div class="when"><span data-off="%d" data-fmt="dayfull"></span><em>%s</em></div>'
          % (s["off"], lab))
        A('<div>')
        A('<div class="file">%s</div>' % esc(s["asset"]))
        A('<p class="meta"><b>%s.</b> %s</p>' % (esc(s["where"]), esc(s["why"])))
        if s["cap"]:
            A('<div class="capwrap"><div class="captop"><span class="cl">Caption, paste whole</span>'
              '<button class="copy" type="button">Copy</button></div>')
            A('<pre class="cap">%s</pre>' % esc(s["cap"]))
            A('</div>')
        A('<label class="done"><input type="checkbox"> Scheduled</label>')
        A('</div></div>')
    A('</div></details>')
A('</div>')

A('<div class="call"><h3>Diwali lands in week <span id="dwk">&mdash;</span></h3>'
  '<p>Diwali 2026 is <b>Sunday 8 November</b>, and the five days run 6 to 10 November. '
  '<b>Spend that week\'s last slot on a Diwali post instead of the pillar</b> and push the pillar '
  'one week down the board. That week is also your vendor table window, which means the referral QR '
  'and the First Words badge card get printed <b>before</b> it, not during it.</p></div>')

A('<div class="call"><h3>The pillars run out at week 18</h3>'
  '<p>There are <b>17 usable pillar stills</b> and 22 pillar slots. Weeks 18 to 22 are marked REPOST on '
  'purpose rather than padded, because a silent cap reads as coverage when it is not. By then you '
  'will know which three posts actually earned reach; those are the reposts.</p></div>')

A('<div class="call teal"><h3>Two things are held back deliberately</h3>'
  '<p><b>ai-f-whats-next-1x1</b> stays in the drawer. It pre-announces adaptive pacing, so it posts the '
  'week that ships and not before. <b>Bolo Social 4</b>, the jeweller video, is your Android relaunch '
  'video and still needs the Coming Soon badge recut. <b>bolo social 3</b>, the auntie video, is '
  'pillarboxed inside a landscape frame and needs cropping to 9:16 before it can go anywhere; it is '
  'Tamil-led, so week 3 is its natural home once it is fixed.</p></div>')
A('</section>')

# ---------- rules that make it survivable ----------
A('<section><div class="shead"><h2>The rules that make it survivable</h2>'
  '<p>Everything here exists so a missed week costs you nothing.</p></div>')
A('<ul class="plain">')
for t in [
  "<b>Schedule, never post live.</b> One sitting a week, all three queued. Opening the app to post is how a week gets skipped.",
  "<b>Post 6 to 9pm your audience's time.</b> Diaspora scrolling is an evening habit, after dinner and after the kids are down.",
  "<b>Change the cover frame every time.</b> Pick a frame from the first 3 seconds while the script is still on screen. The cover is the only thing a profile visitor sees.",
  "<b>Five hashtags, not thirty.</b> The community tag finds the community. #languagelearning finds nobody.",
  "<b>Never mix badge states.</b> A feed carrying both a live and a coming-soon Play badge looks like a rendering bug, not a launch.",
  "<b>Seed the first fifty by hand.</b> WhatsApp family groups, r/ABCDesis, temple and gurdwara pages. On a cold account this is the whole game, and it matters more than anything in the caption.",
  "<b>Miss a week without guilt.</b> The board is a queue, not a calendar. Pick up at the next unticked slot. Nothing here expires.",
]:
    A('<li>%s</li>' % t)
A('</ul>')
A('</section>')

# ---------- what to watch ----------
A('<section><div class="shead"><h2>The one number that re-orders the board</h2>'
  '<p>PostHog is already instrumented on the web app, so this needs no new tooling.</p></div>')
A('<ul class="plain">')
A('<li><b>language_entry_click</b> fires when someone taps a language on the landing page, tagged with '
  'which one. After four weeks you have a real ranking of which communities are responding. '
  '<b>Re-order the remaining weeks to match.</b> The order above is a reasoned guess. Your data beats it.</li>')
A('<li><b>signup_started</b> carries a source. Compare a video week against a card week against a pillar '
  'week, and give the winner more slots in the back half. Do not keep a balanced rotation out of tidiness.</li>')
A('<li><b>Check it monthly, not weekly.</b> Three posts a week is too little signal to read weekly, and '
  'reading it daily is how a plan turns into anxiety. Fifteen minutes, once a month.</li>')
A('</ul>')
A('</section>')

A('<footer>')
if NEST_MODE:
    A('<b style="color:var(--teal)">Canonical copy.</b> Edits are made here, in '
      '<span style="font-family:var(--mono)">artifacts/api-server/assets/nest-growth.html</span>. '
      'The published artifact is a mirror and may lag.<br><br>')
else:
    A('<b style="color:var(--ochre)">Mirror, not canonical.</b> The live copy lives in the Nest. '
      'This page may lag behind it.<br><br>')
A('Videos in <span style="font-family:var(--mono)">BOLO Social Video Ads/Grandma language '
  'variants/</span>. Stills in the flat play-soon set, 40 files, in '
  '<span style="font-family:var(--mono)">Downloads/bolocampaignsplaysoon 2/</span>.<br><br>'
  '<b>The live-badge set already exists.</b> '
  '<span style="font-family:var(--mono)">Downloads/bolocampaignslive/</span> holds the same 40 '
  'filenames, all 40 differing only in the badge. So the day Google Play goes public the swap is '
  '<b>a folder change, not a rebuild</b>. Nothing needs regenerating and there is no generator to '
  'run. Swap the whole set at once, never a feed carrying both states.')
A('</footer>')
A('</div>')

A(SCRIPT_BLOCK)
html = "\n".join(out)

WEB_FONTS = {
    "__DISP__":    '"Archivo Narrow", "Helvetica Neue", Arial, sans-serif',
    "__BODY__":    '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    "__MONO__":    '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    "__CAPFONT__": '"Instrument Sans"',
}
# Nest mode serves from the API with no external requests allowed, so every face
# must already be on the device. Dropping the Google Fonts <link> is not enough on
# its own: the NAMES have to go too, or the page asks for three faces that can
# never load. Caught by the Nest session on 2026-08-26, when `gen.py out nest` did
# not reproduce the committed file.
SYS_FONTS = {
    "__DISP__":    '"Avenir Next Condensed","Helvetica Neue",Arial,sans-serif',
    "__BODY__":    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,ui-sans-serif,system-ui,sans-serif',
    "__MONO__":    'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace',
    "__CAPFONT__": 'var(--body)',
}
for k, v in (SYS_FONTS if NEST_MODE else WEB_FONTS).items():
    html = html.replace(k, v)

if NEST_MODE:
    # The artifact runtime supplies its own skeleton, so the body above is a
    # fragment. Served from the API it needs a real document around it.
    m = re.match(r"\s*<title>(.*?)</title>\s*", html, re.S)
    title, html = m.group(1), html[m.end():]
    html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<meta name="robots" content="noindex,nofollow">\n'
            '<title>' + title + ' &middot; Bolo Nest</title>\n'
            '<style>html,body{margin:0;padding:0}</style>\n'
            '</head>\n<body>\n' + html + '\n</body>\n</html>\n')

open(sys.argv[1], "w", encoding="utf-8").write(html)
print("wrote", sys.argv[1], len(html.encode("utf-8")), "bytes")
