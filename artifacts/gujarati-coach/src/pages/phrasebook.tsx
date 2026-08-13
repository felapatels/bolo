// Phrasebook: the full topic library (Task #906). Home's topic grid moved
// here behind a single quiet "Phrasebook" door card; this page is the
// browse-anything surface while the journey stays the guided path. Cards open
// the existing /learn/:id topic detail unchanged, so gating (free caps,
// locked phrases, Plus sentences) behaves exactly as it did on the home grid.
import { useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  useListCategories,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Flame,
  HandHeart,
  Hash,
  Smile,
  Sparkles,
  Star,
  Sun,
  Users,
  Utensils,
} from "lucide-react";
import { motion } from "framer-motion";
import { springs } from "@/lib/motion";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";
import type { CSSProperties } from "react";

// Same icon vocabulary the home grid used; categories carry an iconName.
const iconMap: Record<string, React.ElementType> = {
  HandHeart,
  Users,
  Hash,
  Utensils,
  Sun,
  Smile,
  BookOpen,
  Star,
  Sparkles,
  Flame,
};

export default function Phrasebook() {
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();

  const openedTracked = useRef(false);
  useEffect(() => {
    // Fire once per visit to the surface; language changes while the page is
    // open are a language switch, not a fresh open. The ref keeps the event
    // single even if the mount effect re-runs (e.g. React Strict Mode).
    if (openedTracked.current) return;
    openedTracked.current = true;
    track(ANALYTICS_EVENTS.PHRASEBOOK_OPENED, { language: activeLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    data: categories,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useListCategories(
    { lang: activeLang },
    {
      query: {
        placeholderData: keepPreviousData,
        queryKey: getListCategoriesQueryKey({ lang: activeLang }),
      },
    },
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-nav lg:pb-12">
      <header className="mx-auto w-full max-w-6xl px-6 pt-8 lg:px-10">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-foreground lg:text-3xl">
              Phrasebook
            </h1>
            <p className="text-sm font-semibold text-muted-foreground">
              Every {activeLanguage?.name ?? ""} topic in your library. Browse
              and practice any of them, in any order.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 w-full max-w-6xl px-6 lg:px-10">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-3xl border-2 border-card-border bg-card"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-card-border bg-card p-8 text-center">
            <p className="text-sm font-bold text-foreground">
              Your topics couldn&apos;t load.
            </p>
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-full bg-primary px-5 py-2 text-sm font-black text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {isFetching ? "Retrying..." : "Try again"}
            </button>
          </div>
        ) : (categories ?? []).length === 0 ? (
          <div className="rounded-3xl border-2 border-card-border bg-card p-8 text-center">
            <p className="text-sm font-bold text-foreground">
              No topics available for this language yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {categories?.map((cat, i) => {
              const Icon = iconMap[cat.iconName] || BookOpen;
              const accent = cat.accent || "var(--color-primary)";
              const progress =
                cat.phraseCount > 0
                  ? Math.round((cat.masteredCount / cat.phraseCount) * 100)
                  : 0;
              const done = progress >= 100;

              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springs.gentle, delay: 0.05 + i * 0.05 }}
                >
                  <Link
                    href={`/learn/${cat.id}`}
                    data-testid={`phrasebook-topic-${cat.id}`}
                    onClick={() =>
                      track(ANALYTICS_EVENTS.TOPIC_OPENED, {
                        categoryId: cat.id,
                        language: activeLang,
                        source: "phrasebook",
                      })
                    }
                    className="block h-full"
                  >
                    <div
                      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border-2 bg-card p-4 shadow-[0_6px_0_var(--tile)] transition-all hover:-translate-y-0.5 active:translate-y-[6px] active:shadow-[0_0px_0_var(--tile)]"
                      style={{ borderColor: accent, ["--tile" as string]: accent } as CSSProperties}
                    >
                      <div
                        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-10"
                        style={{ backgroundColor: accent }}
                      />

                      <div className="flex items-center justify-between">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm"
                          style={{ backgroundColor: accent }}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className="text-xs font-black" style={{ color: accent }}>
                          {done ? "Done!" : `${progress}%`}
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-black leading-tight text-foreground">
                        {cat.title}
                      </h3>
                      {cat.titleNative && (
                        <p
                          className="mt-0.5 truncate text-sm text-muted-foreground"
                          style={native.style}
                          dir={native.dir}
                        >
                          {cat.titleNative}
                        </p>
                      )}

                      <div className="mt-auto pt-4">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${progress}%`, backgroundColor: accent }}
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] font-bold text-muted-foreground">
                          {cat.masteredCount}/{cat.phraseCount} phrases mastered
                        </p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
