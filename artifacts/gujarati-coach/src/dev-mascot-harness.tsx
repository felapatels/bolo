// THE WAY TO LOOK AT THE WEB MASCOT. Not built or deployed: vite's only
// rollup input is index.html, so this entry is dev-server only.
//
//   PORT=5178 BASE_PATH=/ pnpm --filter @workspace/gujarati-coach exec vite
//   open http://localhost:5178/mascot-harness.html
//   node qa/mascot-overlay-register.mjs      # the assertion version
//
// The sprite canvas went 1024 square -> 1024x1200 in build 26 and the web
// Mascot grew a -MASCOT_SKY_PCT% margin to compensate. That change has never
// been rendered in a browser. This mounts the REAL <Mascot> inside the REAL
// ancestor chains copied verbatim from practice.tsx and join.tsx, so the
// question "does the fill chain still put the bird where it was" is answered
// by layout rather than by reading CSS.
//
// <Mascot> needs no provider: useEquippedOutfit falls back to nothing-worn
// outside one, and outfit/accessory can be forced by prop.
import { createRoot } from "react-dom/client";
import { Mascot } from "@/components/mascot";
import "@/index.css";

/** One labelled case. The dashed box is the container the bird must fill. */
function Case({
  id,
  title,
  note,
  width,
  height,
  children,
}: {
  id: string;
  title: string;
  note: string;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ margin: "0 18px 26px 0", display: "inline-block", verticalAlign: "top" }}>
      <div style={{ font: "600 12px ui-sans-serif, system-ui", marginBottom: 2 }}>{title}</div>
      <div style={{ font: "400 11px ui-sans-serif, system-ui", color: "#555", marginBottom: 6, maxWidth: width + 40 }}>
        {note}
      </div>
      {/* data-case marks the CONTAINER whose box the bird is supposed to fill. */}
      <div
        data-case={id}
        style={{ width, height, outline: "2px dashed #111", position: "relative" }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── practice.tsx, verbatim ────────────────────────────────────────────────
   2308  <div className="app-surface min-h-[100dvh] flex flex-col ...">
   2465    <main className="mx-auto w-full max-w-2xl flex-1 flex flex-col px-4 pb-4 min-h-0">
   2643      <div className="relative flex flex-col items-center justify-center min-h-0 mt-1 flex-1">
   2651        <div className="relative w-full h-full flex items-center justify-center">
   2706          <div className="w-full h-full">
   2711            <motion.div className="w-full h-full">
   2714              <div className="w-full h-full transition-transform duration-100">
   2720                <Mascot pose fill />
   Note min-h-[100dvh] is a MINIMUM, so the root height is indefinite. That is
   the whole question: whether h-full resolves down this chain.                */
function PracticeChain({ compact, outfit, accessory }: { compact: boolean; outfit?: string | null; accessory?: string | null }) {
  return (
    <div className="app-surface min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* stand-ins for the header and phrase card above the parrot zone */}
      <div className="shrink-0 h-10" />
      <main className="mx-auto w-full max-w-2xl flex-1 flex flex-col px-4 pb-4 min-h-0">
        <div className="shrink-0 h-16" />
        <div
          className={
            "relative flex flex-col items-center justify-center min-h-0 mt-1 " +
            (compact ? "flex-none h-[72px] shrink-0" : "flex-1")
          }
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="w-full h-full">
              <div className="w-full h-full">
                <div className="w-full h-full transition-transform duration-100">
                  <Mascot pose="wave" fill idle="none" ambient="calm" outfit={outfit} accessory={accessory} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 h-14" />
      </main>
    </div>
  );
}

/* ── join.tsx:110, verbatim: a DEFINITE 96x96 box with fill ─────────────── */
function JoinChain({ accessory }: { accessory?: string | null }) {
  return (
    <div className="mx-auto mb-2 h-24 w-24">
      <Mascot pose="wave" fill idle="none" accessory={accessory} />
    </div>
  );
}

function Harness() {
  return (
    <div style={{ padding: 20, background: "#fff" }}>
      <h1 style={{ font: "800 18px ui-sans-serif, system-ui", marginBottom: 4 }}>
        Mascot geometry after the 1024x1200 canvas change
      </h1>
      <p style={{ font: "400 12px ui-sans-serif, system-ui", color: "#444", marginBottom: 18 }}>
        Dashed box = the container the bird is meant to occupy. Build 27 scratch harness.
      </p>

      <Case
        id="practice-idle"
        title="A. practice, idle (fill, flex-1)"
        note="The real chain. 430x760 viewport slice."
        width={430}
        height={760}
      >
        <PracticeChain compact={false} />
      </Case>

      <Case
        id="practice-idle-pagdi"
        title="B. practice idle + pagdi"
        note="Same chain, accessory overlay on. Plume needs the new sky."
        width={430}
        height={760}
      >
        <PracticeChain compact={false} accessory="pagdi" />
      </Case>

      <Case
        id="practice-compact"
        title="C. practice, result band (h-72px)"
        note="Definite 72px band. fill inside a definite height."
        width={430}
        height={760}
      >
        <PracticeChain compact />
      </Case>

      <Case
        id="join"
        title="D. join.tsx (fill in a definite h-24 w-24)"
        note="The other fill call site. Definite 96x96."
        width={140}
        height={140}
      >
        <div className="flex items-center justify-center h-full w-full">
          <JoinChain />
        </div>
      </Case>

      <Case
        id="join-pagdi"
        title="E. join + pagdi"
        note="Definite 96x96 with the head overlay."
        width={140}
        height={140}
      >
        <div className="flex items-center justify-center h-full w-full">
          <JoinChain accessory="pagdi" />
        </div>
      </Case>

      {/* GROUND TRUTH: the two PNGs stacked at identical geometry, no Mascot,
          no margins, no chain. Whatever this looks like IS what the art says.
          If the component matches this, any remaining "too high" is the art. */}
      <Case
        id="raw-composite"
        title="R. RAW ART: base + overlay, same box, zero CSS"
        note="Ground truth for where the hat sits. 1024x1200 frame at 300px wide."
        width={300}
        height={352}
      >
        <div style={{ position: "relative", width: 300, height: 351.5625 }}>
          <img src="/mascot/mascot-wave.png" width={300} style={{ position: "absolute", inset: 0 }} />
          <img src="/mascot/outfits/pagdi/overlay-wave.png" width={300} style={{ position: "absolute", inset: 0 }} />
        </div>
      </Case>

      {/* THREE SLOTS (build 27). Left is the shipped baked render; right is the
          same garment rebuilt from stackable layers. If they match, a top and a
          bottom can be worn together. */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 26 }}>
        {[
          { id: "baked", title: "BAKED (shipped today)", layers: ["/mascot/outfits/kurta/mascot-wave.png"] },
          {
            id: "stacked",
            title: "STACKED from layers",
            layers: [
              "/mascot/mascot-wave.png",
              "/mascot/outfits/kurta/cloth-wave.png",
              "/mascot/front-wave.png",
            ],
          },
          {
            id: "twopart",
            title: "TWO cloth layers at once",
            layers: [
              "/mascot/mascot-wave.png",
              "/mascot/outfits/kurta/cloth-wave.png",
              "/mascot/outfits/saree/cloth-wave.png",
              "/mascot/front-wave.png",
              "/mascot/outfits/pagdi/overlay-wave.png",
            ],
          },
        ].map((c) => (
          <div key={c.id}>
            <div style={{ font: "700 12px ui-sans-serif, system-ui", marginBottom: 4 }}>{c.title}</div>
            <div
              data-case={`slots-${c.id}`}
              style={{ position: "relative", width: 260, height: 260 * (1200 / 1024), outline: "2px dashed #111" }}
            >
              {c.layers.map((src, i) => (
                <img key={i} src={src} width={260} style={{ position: "absolute", left: 0, top: 0 }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Case
        id="sized"
        title="F. size=140, NOT fill (reference)"
        note="The 128-call-site path. aspect-[1024/1200] + pull-up. Should be correct by construction."
        width={140}
        height={140}
      >
        <Mascot pose="wave" size={140} idle="none" ambient="calm" />
      </Case>

      <Case
        id="sized-pagdi"
        title="G. size=140 + pagdi (reference)"
        note="Head overlay must register with the base."
        width={140}
        height={140}
      >
        <Mascot pose="wave" size={140} idle="none" ambient="calm" accessory="pagdi" />
      </Case>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
