/**
 * THE DAILY GIFT, on the web. Resting it is one row; opened it earns its height.
 *
 * REBUILT 2026-09-08 from the owner's design canvas, and the shape is his:
 * "this whole module needs to be much smaller", "expand if needed after
 * clicking the gift box", "the gift box should gently shake like it is alive
 * and begging for you to click it", "write directly on it, Day 4 Gift", "get
 * rid of tomorrow 5 to 25", "confetti pop for celebration".
 *
 * THE METER IS THE HALF THAT MATTERS, and the reasoning is his: "a spin with
 * nothing to spend it on is a number going up on its own. What gives it a
 * reason is knowing what it is FOR." Production said the old fixed ladder was
 * not working: 28 learners with any Chai and a MEDIAN BALANCE OF 1, which is
 * one box claimed and no second visit.
 *
 * ALL-ACCESS GETS NO METER, ON HIS RULING. They cannot buy a stop at all
 * (lib/stopUnlock.ts sells stops only in a language the plan EXCLUDES), so a bar
 * counting toward something unreachable would be a lie. They get their wallet
 * and the door to the bazaar.
 *
 * MOBILE TWIN: bolo-mobile/components/DailyGiftBox.tsx and DailyGiftCard.tsx.
 * The two are hand-maintained, as every pair in this repo is, and the shared
 * half is @workspace/daily-gift rather than a component. Three differences are
 * deliberate and none is drift:
 *
 *   - the box is DRAWN in svg on both sides, which is not a web convenience but
 *     the phone's constraint honoured here: asset maps on mobile are compile
 *     time, so cut art would have to ride a build weeks before the feature
 *     could be switched on. Drawing it means neither side waits;
 *   - the shake, the flip and the confetti are css keyframes here and Animated
 *     values there. The numbers are held in step by the comments beside
 *     `--gift-wobble`, `gift-flap-in` and `gift-burst` in index.css;
 *   - reduced motion needs nothing here. The global prefers-reduced-motion rule
 *     in index.css already stops every animation, which lands the opened state
 *     with the same words, and that is exactly "reduced motion just opens".
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Today's length on the track is named in words
 * beside the count rather than left to the difference between two ambers; the
 * locked stop is a grey ring AND a padlock; the tiers differ by SIZE and by
 * whether they wear a ribbon.
 */
import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDailyGiftQueryKey,
  getGetTokensQueryKey,
  useClaimDailyGift,
  useGetDailyGift,
  useGetTokens,
} from "@workspace/api-client-react";
import { giftRangeCopy, type GiftTier } from "@workspace/daily-gift";
import { webHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * RETAINED FOR THE SUITE THAT PINS IT, and it no longer lifts a lid. The opened
 * state replaces the box with the fare panel rather than opening it in place,
 * which is the owner's "expand if needed after clicking".
 */
export const GIFT_LID_LIFT = 18;

/** Box width in px per tier. The tier is the picture of how long you kept it up. */
export const GIFT_TIER_SIZE: Record<GiftTier, number> = {
  small: 60,
  medium: 66,
  large: 72,
  grand: 80,
};

/** The gold ribbon is the grand box's alone: a week, and it looks like one. */
function hasRibbon(tier: GiftTier): boolean {
  return tier === "grand";
}

/** Fixed scene colours, twinned with the phone's constants of the same names. */
const MARIGOLD = "#F0A32B";
const MARIGOLD_DEEP = "#E08A16";
const MARIGOLD_LIGHT = "#FBBF24";
const TRACK_SPENT = "#C97F17";
const RAIL_VIOLET = "#8B5CF6";
const SLEEPER = "#6B4130";
const PAPER_EDGE = "#B48628";
const PAPER_INK = "#8E672D";
const FLAP_FACE = "#42240F";
const FLAP_TEXT = "#FFF5DC";

/** The confetti's inks: the app's own, never a party palette. */
const CONFETTI_INK = [MARIGOLD, "#4F46E5", RAIL_VIOLET, PAPER_EDGE, FLAP_TEXT, "#F59E0B", "#0D9488"];

/**
 * THE BOX, with its own day written on it so it carries its label even if it is
 * ever seen without its row. Drawn rather than cut: see the file header.
 */
function BoxArt({ tier, day }: { tier: GiftTier; day: number }) {
  const w = GIFT_TIER_SIZE[tier];
  const h = Math.round(w * (104 / 96));
  const ribbon = hasRibbon(tier);
  return (
    <svg
      data-testid="gift-box-frame"
      data-tier={tier}
      width={w}
      height={h}
      viewBox="0 0 96 104"
      className="shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id="giftBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
        <linearGradient id="giftRibbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARIGOLD_LIGHT} />
          <stop offset="1" stopColor={MARIGOLD_DEEP} />
        </linearGradient>
      </defs>
      <ellipse cx={48} cy={99} rx={31} ry={4} fill="#0F172A" opacity={0.14} />
      <rect x={10} y={44} width={76} height={52} rx={5} fill="url(#giftBody)" />
      <rect x={10} y={44} width={20} height={52} rx={5} fill="#FFFFFF" opacity={0.08} />
      <rect x={10} y={48} width={76} height={10} fill="url(#giftRibbon)" />
      <rect x={10} y={58} width={76} height={1.5} fill="#0F172A" opacity={0.18} />
      <text x={48} y={76} fill={FLAP_TEXT} fontSize={13} fontWeight={800} textAnchor="middle">
        {`Day ${day}`}
      </text>
      <text
        x={48}
        y={88}
        fill={FLAP_TEXT}
        fontSize={9}
        fontWeight={700}
        letterSpacing={1.6}
        textAnchor="middle"
        opacity={0.88}
      >
        GIFT
      </text>
      <rect x={4} y={30} width={88} height={16} rx={4} className="fill-primary" />
      <rect x={4} y={43} width={88} height={3} rx={1.5} fill="#0F172A" opacity={0.16} />
      <rect x={42} y={30} width={12} height={16} fill="url(#giftRibbon)" />
      {ribbon ? (
        <>
          {/* THE GRAND BOX'S BOW: a difference in SHAPE, not in hue, because the
              tiers must be tellable apart without colour. */}
          <path d="M 48 31 C 33 26, 28 11, 39 11 C 47 11, 48 25, 48 31 Z" fill={MARIGOLD_LIGHT} />
          <path d="M 48 31 C 63 26, 68 11, 57 11 C 49 11, 48 25, 48 31 Z" fill={MARIGOLD} />
          <circle cx={48} cy={30} r={5} fill={MARIGOLD_DEEP} />
        </>
      ) : null}
    </svg>
  );
}

/**
 * THE THIN TRACK. The app already owns a picture of "how far along you are" and
 * it is a railway. IT IS NOT THE JOURNEY'S RAIL AND MUST NOT BORROW ITS COLOUR:
 * the map's lime means TRAVELLED, and this measures Chai, which is money.
 */
function StopTrack({ spentPct, todayPct }: { spentPct: number; todayPct: number }) {
  const sleepers = useMemo(() => {
    const out: number[] = [];
    for (let x = 8; x <= 224; x += 15) out.push(x);
    return out;
  }, []);
  return (
    <div className="relative h-[26px]" data-testid="daily-gift-track">
      <svg
        width="100%"
        height={26}
        viewBox="0 0 240 26"
        preserveAspectRatio="none"
        className="absolute inset-0"
        aria-hidden
      >
        {sleepers.map((x) => (
          <rect key={x} x={x} y={6} width={4} height={14} rx={1} fill={SLEEPER} />
        ))}
        <rect x={4} y={9} width={222} height={2} rx={1} fill={RAIL_VIOLET} />
        <rect x={4} y={15} width={222} height={2} rx={1} fill={RAIL_VIOLET} />
      </svg>
      <div className="pointer-events-none absolute left-1.5 right-[22px] top-[11.5px] h-[3px]">
        <div
          className="absolute left-0 top-0 h-[3px] rounded-sm"
          style={{ width: `${spentPct}%`, background: TRACK_SPENT }}
        />
        {todayPct > 0 ? (
          <div
            className="absolute -top-px h-[5px] rounded-sm"
            style={{ left: `${spentPct}%`, width: `${todayPct}%`, background: MARIGOLD }}
          />
        ) : null}
      </div>
      {/* LOCKED, AND IT SAYS SO WITH A SHAPE: a grey ring AND a padlock, never a
          shade the reader has to tell apart from another shade. */}
      <div className="absolute right-0 top-[5px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-muted-foreground bg-card">
        <svg width={8} height={8} viewBox="0 0 24 24" aria-hidden>
          <rect
            x={4}
            y={11}
            width={16}
            height={10}
            rx={2}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth={3}
          />
          <path
            d="M8 11V7a4 4 0 0 1 8 0v4"
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

export interface DailyGiftBoxProps {
  /** The streak day this box belongs to. NEVER the amount: see lib/daily-gift. */
  day: number;
  /** What is banked, after any plan multiplier. */
  chai: number;
  /** The draw before the multiplier, so the sum can be shown both ways. */
  baseAmount?: number;
  /** What the base was multiplied by. 1 for Free. */
  multiplier?: number;
  tier: GiftTier;
  claimed: boolean;
  claimable: boolean;
  chaiToNextStop?: number;
  stopCost?: number;
  balance?: number;
  /** True for All-Access: no meter, a shop door instead. */
  isPlus?: boolean;
  onClaim: () => void;
  onShop?: () => void;
  onGetMore?: () => void;
  testId?: string;
}

export function DailyGiftBox({
  day,
  chai,
  baseAmount,
  multiplier = 1,
  tier,
  claimed,
  claimable,
  chaiToNextStop,
  stopCost,
  balance,
  isPlus = false,
  onClaim,
  onShop,
  onGetMore,
  testId = "daily-gift-box",
}: DailyGiftBoxProps) {
  const openable = claimable && !claimed;
  const doubled = multiplier > 1 && baseAmount != null && baseAmount !== chai;
  const digits = String(Math.max(0, Math.floor(chai))).padStart(2, "0").split("");

  const spentPct = useMemo(() => {
    if (isPlus || stopCost == null || chaiToNextStop == null || stopCost <= 0) return 0;
    const have = Math.max(0, stopCost - chaiToNextStop);
    return Math.min(100, Math.round((have / stopCost) * 100));
  }, [isPlus, stopCost, chaiToNextStop]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        key: i,
        ink: CONFETTI_INK[i % CONFETTI_INK.length]!,
        round: i % 3 === 0,
        angle: -74 + i * 9.8,
        reach: 0.55 + ((i * 37) % 100) / 160,
        delay: i * 16,
      })),
    [],
  );

  const remainLabel =
    chaiToNextStop != null && chaiToNextStop > 0
      ? `${chaiToNextStop} more Chai to open your next stop`
      : "Enough for your next stop";

  // ── RESTING ───────────────────────────────────────────────────────────────
  if (!claimed) {
    return (
      <button
        type="button"
        data-testid={testId}
        disabled={!openable}
        aria-label={`Open today's gift, day ${day}. ${giftRangeCopy(multiplier)}`}
        onClick={() => {
          if (!openable) return;
          webHaptic("success");
          onClaim();
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-[18px] border border-border bg-card p-3 text-left",
          openable && "transition-colors hover:border-primary/40",
        )}
      >
        <div className={cn(openable && "animate-gift-wobble origin-bottom")}>
          <BoxArt tier={tier} day={day} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {isPlus ? (
            <>
              <div className="text-[10px] font-black tracking-widest text-muted-foreground">
                TODAY&rsquo;S GIFT
              </div>
              <div className="text-[13px] font-bold text-foreground">Tap to open</div>
              <div data-testid={`${testId}-range`} className="text-[11px] text-muted-foreground">
                {giftRangeCopy(multiplier)}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-black tracking-widest text-muted-foreground">
                  NEXT STOP
                </span>
                <span data-testid={`${testId}-count`} className="text-[11px] text-muted-foreground">
                  {stopCost != null && chaiToNextStop != null
                    ? `${Math.max(0, stopCost - chaiToNextStop)} of ${stopCost}`
                    : ""}
                </span>
              </div>
              <StopTrack spentPct={spentPct} todayPct={0} />
              <div data-testid={`${testId}-remain`} className="text-[13px] font-bold text-foreground">
                {remainLabel}
              </div>
            </>
          )}
        </div>
      </button>
    );
  }

  // ── OPENED ────────────────────────────────────────────────────────────────
  return (
    <div
      data-testid={testId}
      className="space-y-2.5 rounded-[18px] border border-border bg-card p-3"
    >
      <div
        className="relative overflow-hidden rounded-xl border px-2.5 pb-2 pt-1.5"
        style={{ borderColor: PAPER_EDGE, background: "linear-gradient(160deg,#FBEECF,#F3DFB8 55%,#FAEDCC)" }}
      >
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-[10px] font-black tracking-widest" style={{ color: PAPER_INK }}>
            TODAY&rsquo;S FARE
          </span>
          {doubled ? (
            <span
              data-testid={`${testId}-multiplier`}
              className="flex items-center gap-1.5 rounded-full border px-2 py-[3px]"
              style={{ background: FLAP_FACE, borderColor: "#D4AC52" }}
            >
              <span className="text-xs font-black" style={{ color: MARIGOLD_LIGHT }}>
                {`×${multiplier}`}
              </span>
              <span className="text-[9px] font-black tracking-widest" style={{ color: "#F3DFB8" }}>
                ALL-ACCESS
              </span>
            </span>
          ) : (
            <span className="text-[10px] font-semibold" style={{ color: "#9E6F25" }}>
              {`Day ${day}`}
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-[7px] py-1.5">
          {digits.map((ch, i) => (
            <span
              key={`${i}-${ch}`}
              data-testid={`${testId}-flap-${i}`}
              className="animate-gift-flap-in relative flex h-[50px] w-10 items-center justify-center rounded-md border text-[27px] font-black"
              style={{
                background: FLAP_FACE,
                borderColor: PAPER_INK,
                color: FLAP_TEXT,
                animationDelay: `${i * 60}ms`,
              }}
            >
              {ch}
              {/* The hinge is what makes it read as a flap rather than as a
                  number that changed. */}
              <span className="absolute inset-x-0 top-1/2 h-px bg-black/55" />
            </span>
          ))}
          <span
            className="self-end pb-[7px] text-[11px] font-black tracking-widest"
            style={{ color: PAPER_INK }}
          >
            CHAI
          </span>
        </div>

        {/* THE SUM BOTH WAYS, so a learner can check it. A doubled number with
            its base hidden is a number nobody can verify. */}
        <div
          data-testid={`${testId}-sum`}
          className="text-center text-[10px] font-semibold"
          style={{ color: "#9E6F25" }}
        >
          {doubled ? `${baseAmount} drawn, doubled to ${chai}` : giftRangeCopy(multiplier)}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-[62px] flex justify-center">
          {confetti.map((p) => (
            <span
              key={p.key}
              className="absolute"
              style={{ transform: `rotate(${p.angle}deg) scale(${p.reach})` }}
            >
              <span
                className="animate-gift-burst block"
                style={{
                  width: p.round ? 7 : 5,
                  height: p.round ? 7 : 9,
                  borderRadius: p.round ? "50%" : 1,
                  background: p.ink,
                  animationDelay: `${p.delay}ms`,
                }}
              />
            </span>
          ))}
        </div>
      </div>

      {isPlus ? (
        // NO METER FOR ALL-ACCESS, on the owner's ruling. They cannot buy a
        // stop, so a bar counting toward one would be a lie.
        <>
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-black tracking-widest text-muted-foreground">
              YOUR CHAI
            </span>
            <span data-testid={`${testId}-balance`} className="text-xl font-black text-foreground">
              {balance ?? 0}
            </span>
          </div>
          <button
            type="button"
            data-testid={`${testId}-shop`}
            onClick={onShop}
            className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            Go Shopping
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-black tracking-widest text-muted-foreground">
                NEXT STOP
              </span>
              {/* TODAY'S LENGTH IS NAMED IN WORDS, not left to the difference
                  between two ambers. The reader may not see that difference. */}
              <span data-testid={`${testId}-count`} className="text-[11px] text-muted-foreground">
                {stopCost != null && chaiToNextStop != null
                  ? `${Math.max(0, stopCost - chaiToNextStop)} of ${stopCost}, +${chai} today`
                  : `+${chai} today`}
              </span>
            </div>
            <StopTrack
              spentPct={Math.max(0, spentPct - (stopCost ? (chai / stopCost) * 100 : 0))}
              todayPct={stopCost ? Math.min(spentPct, (chai / stopCost) * 100) : 0}
            />
            <div data-testid={`${testId}-remain`} className="text-[13px] font-bold text-foreground">
              {remainLabel}
            </div>
          </div>
          <button
            type="button"
            data-testid={`${testId}-getmore`}
            onClick={onGetMore}
            className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            Get more Chai
          </button>
        </>
      )}
    </div>
  );
}

/**
 * THE GIFT, WIRED. Reads today's box, opens it, and tells the wallet.
 *
 * ONE CONNECTED COMPONENT FOR BOTH PLACES IT APPEARS, which is the ruling rather
 * than tidiness: the box has to be offered where practice ENDS as well as on
 * Home, or a learner who practised and never scrolled home forfeits the day.
 * Two copies of this wiring would be two chances for one to stop claiming.
 *
 * IT RENDERS NOTHING UNTIL THERE IS A BOX. No box before the query answers, no
 * box on a day nothing has been practised, and no "practise first" placeholder:
 * a permanent nag at the top of home every morning is a worse screen than an
 * empty one, and the end-of-practice placement catches the learner at the moment
 * the day becomes earned anyway.
 */
export function DailyGiftCard({ testId }: { testId?: string }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const giftQuery = useGetDailyGift();
  const tokensQuery = useGetTokens();
  const claim = useClaimDailyGift();
  const gift = giftQuery.data;

  // WHETHER THIS LEARNER IS ALL-ACCESS, read from the payload this card already
  // fetches rather than from an entitlements hook.
  //
  // THE HOOK WAS TRIED FIRST AND IT IS THE WRONG DEPENDENCY. web's
  // useEntitlements reaches Clerk's useUser, which throws outside a
  // ClerkProvider, so importing it here broke every suite that renders the
  // practice page: the gift is offered where practice ENDS as well as on home,
  // so this component's dependencies are paid for by both. The phone had the
  // same shape one layer along.
  //
  // `multiplier` is exact for this purpose under the owner's ruling: it is what
  // THIS learner drew, 1 for Free and ALL_ACCESS_GIFT_MULTIPLIER otherwise. THE
  // COUPLING IS REAL AND WORTH NAMING: the day All-Access is given a multiplier
  // of 1, they would be shown a meter they cannot use. If that day comes, the
  // server should say so in a field of its own rather than this being quietly
  // adjusted, because a bar counting toward something unreachable is the lie
  // the ruling exists to prevent.
  const isPlus = (gift?.multiplier ?? 1) > 1;

  const onClaim = useCallback(() => {
    claim.mutate(undefined, {
      onSuccess: () => {
        // The box's own state and the wallet both moved, and the Chai figures on
        // this very page read the wallet. Refetching rather than patching: the
        // balance is server-authoritative everywhere else and this is not the
        // surface to invent an exception on.
        queryClient.invalidateQueries({ queryKey: getGetDailyGiftQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    });
  }, [claim, queryClient]);

  // THE TWO DOORS, and which one a learner gets is the owner's ruling rather
  // than a layout choice. All-Access cannot buy a stop at all, so they go to the
  // bazaar; a Free learner short of one goes to the Chai packs.
  const onShop = useCallback(() => navigate("/bazaar"), [navigate]);
  const onGetMore = useCallback(() => navigate("/bazaar/tickets"), [navigate]);

  if (!gift) return null;
  if (!gift.earnedToday && !gift.claimed) return null;

  return (
    <DailyGiftBox
      testId={testId}
      day={gift.day}
      chai={gift.chai}
      baseAmount={gift.baseAmount}
      multiplier={gift.multiplier}
      tier={gift.tier as GiftTier}
      claimed={gift.claimed || claim.isPending}
      claimable={gift.claimable && !claim.isPending}
      chaiToNextStop={gift.chaiToNextStop}
      stopCost={gift.stopCost}
      balance={tokensQuery.data?.balance}
      isPlus={isPlus}
      onClaim={onClaim}
      onShop={onShop}
      onGetMore={onGetMore}
    />
  );
}
