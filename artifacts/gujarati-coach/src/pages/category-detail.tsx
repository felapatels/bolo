import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import {
  useListCategoryPhrases,
  useListCategories,
  useListCategorySentences,
  useAddCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  getListCategorySentencesQueryKey,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, CheckCircle2, Circle, Loader2, Lock, Plus, Sparkles, X } from "lucide-react";
import { motion } from "framer-motion";
import { springs, FloatingTag } from "@/lib/motion";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { CategoryLessonSkeleton, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeCard, UpgradeScreen } from "@/components/plus";
import { asUpgradeRequired, upgradeHref, upgradeHrefForDenial, useEntitlements } from "@/lib/entitlements";

// Matches FREE_PHRASE_CEILING in phraseReplenisher.ts — the hard cap on how
// many phrases a Free topic may grow to via background replenishment.
const FREE_PHRASE_CEILING = 20;

export default function CategoryDetail() {
  const { categoryId } = useParams();
  const id = parseInt(categoryId || "0", 10);
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const queryClient = useQueryClient();
  const { isPlus } = useEntitlements();

  const {
    data: phrases,
    isLoading: loadingPhrases,
    isError,
    error,
    isFetching,
    refetch,
  } = useListCategoryPhrases(id, activeLang, {
    query: {
      queryKey: getListCategoryPhrasesQueryKey(id, activeLang),
      // Background replenishment (Plus) generates fresh phrases server-side
      // while the learner practices — a gentle poll (plus the default
      // refetch-on-focus) makes them appear here without any manual action.
      // The poll only re-renders this list; it never touches an in-progress
      // recording on the practice screen.
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });
  const { data: categories } = useListCategories({ lang: activeLang });
  const category = categories?.find(c => c.id === id);

  // The topic's final step: the Plus-only sentence stage. Only fetched once
  // the server says this caller can open it — the lock state itself is
  // server-authoritative via `sentencesLocked` on the category listing.
  const canLoadSentences = !!category && !category.sentencesLocked;
  const sentencesQuery = useListCategorySentences(id, activeLang, {
    query: {
      enabled: canLoadSentences,
      queryKey: getListCategorySentencesQueryKey(id, activeLang),
    },
  });
  const addPhrases = useAddCategoryPhrases();
  const [noNewPhrases, setNoNewPhrases] = useState(false);

  // Clear the "no new phrases" note whenever the lesson context changes — a
  // different category, a language switch, or the phrase list changing (e.g. it
  // later gained new phrases). Otherwise the stale note can linger on screen.
  useEffect(() => {
    setNoNewPhrases(false);
  }, [id, activeLang, phrases]);

  const handleAddPhrases = async () => {
    setNoNewPhrases(false);
    try {
      const created = await addPhrases.mutateAsync({
        id,
        lang: activeLang,
        data: { count: 3 },
      });
      if (!created || created.length === 0) {
        // Request succeeded but the AI only came back with duplicates, so
        // nothing new was added — let the learner know instead of appearing idle.
        setNoNewPhrases(true);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getListCategoryPhrasesQueryKey(id, activeLang),
        }),
        queryClient.invalidateQueries({
          queryKey: getListCategoriesQueryKey({ lang: activeLang }),
        }),
      ]);
    } catch (error) {
      console.error("Failed to add phrases", error);
    }
  };

  const upgrade = asUpgradeRequired(error);
  if (upgrade) {
    return (
      <UpgradeScreen
        backHref="/app"
        title={
          upgrade.reason === "daily_lesson_limit"
            ? "You've hit today's free lessons"
            : upgrade.reason === "teaser_exhausted"
              ? "You've tried this language!"
              : "Unlock this language"
        }
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
        showTrial={upgrade.reason === "daily_lesson_limit"}
      />
    );
  }

  if (isError) {
    return (
      <LessonErrorScreen
        backHref="/app"
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

  if (loadingPhrases || !category) {
    return (
      <CategoryLessonSkeleton
        languageName={activeLanguage?.name}
        categoryTitle={category?.title}
      />
    );
  }

  const masteredCount = phrases?.filter(p => p.mastered).length || 0;
  const totalCount = phrases?.length ?? 0;
  // Show "Resume" (and skip to the first unmastered phrase) when the learner
  // has made some progress but hasn't mastered everything yet.
  const canResume = masteredCount > 0 && masteredCount < totalCount;

  // Show the "more phrases coming" hint only to Free learners who have engaged
  // (attempted or mastered) at least 80 % of the topic's visible phrases and
  // are still below the free ceiling — the exact condition that triggers
  // background replenishment in phraseReplenisher.shouldReplenishFree.
  const showReplenishHint = (() => {
    if (isPlus) return false;
    const list = phrases ?? [];
    if (list.length === 0 || list.length >= FREE_PHRASE_CEILING) return false;
    const engaged = list.filter(p => p.mastered || p.bestScore !== null).length;
    return engaged / list.length >= 0.8;
  })();

  return (
    <div className="app-surface min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <Link href="/app" className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors button-spring">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="text-center">
            <h1 className="font-bold text-lg text-foreground">{category.title}</h1>
            {category.titleNative && (
              <p className="text-xs text-muted-foreground" style={native.style} dir={native.dir}>{category.titleNative}</p>
            )}
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-6 animate-content-enter">
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start lg:gap-8">
          {/* Progress Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.smooth}
            className="bg-white rounded-3xl p-6 border-2 shadow-sm text-center flex flex-col items-center lg:sticky lg:top-24"
            style={{ borderColor: category.accent || 'var(--color-primary)' }}
          >
            <Mascot pose="thumbsup" size={88} className="mb-2" />
            <h2 className="text-2xl font-black mb-1">{masteredCount} / {phrases?.length}</h2>
            <p className="text-muted-foreground font-medium mb-4">Phrases Mastered</p>

            {activeLanguage && (
              <FloatingTag
                className="mb-6 bg-secondary/10 text-secondary"
                style={native.style}
                dir={native.dir}
              >
                {activeLanguage.nativeName}
              </FloatingTag>
            )}

            <Link
              href={canResume ? `/practice/${id}?skipMastered=true` : `/practice/${id}`}
              className="w-full bg-primary text-primary-foreground font-bold text-lg py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
            >
              <Play className="w-6 h-6 fill-current" />
              <span>{canResume ? "Resume" : "Practice All"}</span>
            </Link>
          </motion.div>

          {/* Phrase List */}
          <div className="space-y-3">
            <h3 className="font-bold text-lg text-foreground px-2">Phrases to learn</h3>
          {phrases?.map((phrase, i) => (
            <motion.div
              key={phrase.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/practice/${id}?phrase=${phrase.id}`}
                className="bg-white rounded-2xl p-4 border border-card-border shadow-sm flex items-start gap-4 cursor-pointer card-lift hover:border-primary/50"
              >
                <div className="mt-1 shrink-0">
                  {phrase.mastered ? (
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  ) : (
                    <Circle className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-2xl font-bold text-foreground leading-tight" style={native.style} dir={native.dir}>{phrase.nativeScript}</p>
                  <p className="text-primary font-medium text-sm">{phrase.romanized}</p>
                  <p className="text-muted-foreground text-sm">{phrase.english}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end justify-between gap-2 self-stretch">
                  {phrase.bestScore !== null ? (
                    <div className={cn(
                      "text-xs font-bold px-2 py-1 rounded-full",
                      phrase.bestScore >= 80 ? "bg-success/15 text-success" : 
                      phrase.bestScore >= 60 ? "bg-primary/15 text-primary" : 
                      "bg-destructive/15 text-destructive"
                    )}>
                      {Math.round(phrase.bestScore)}
                    </div>
                  ) : <span />}
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4 fill-current" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}

          {category.lockedPhraseCount > 0 && (
            <UpgradeCard
              icon={<Lock className="h-6 w-6" />}
              title={`${category.lockedPhraseCount} more ${
                category.lockedPhraseCount === 1 ? "phrase" : "phrases"
              } with Plus`}
              description="Unlock the full phrase library for this topic and keep going."
              cta="Unlock with Plus"
              href={upgradeHref({ plan: "plus" })}
            />
          )}

          {showReplenishHint && (
            <div className="flex items-center gap-3 rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 text-sm text-primary font-medium">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>More phrases on the way — check back tomorrow.</span>
            </div>
          )}

          <button
            onClick={handleAddPhrases}
            disabled={addPhrases.isPending}
            className="w-full bg-white rounded-2xl p-4 border-2 border-dashed border-primary/40 text-primary font-bold flex items-center justify-center gap-2 transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98] disabled:opacity-60 button-spring"
          >
            {addPhrases.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating new phrases…</span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>Add more phrases</span>
              </>
            )}
          </button>

          {addPhrases.isError &&
            (asUpgradeRequired(addPhrases.error) ? (
              <Link
                href={upgradeHrefForDenial(
                  asUpgradeRequired(addPhrases.error)!,
                  activeLang,
                )}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-secondary px-6 py-4 text-center text-base font-black text-white shadow-sm active:scale-[0.98]"
              >
                <Sparkles className="h-5 w-5" />
                {asUpgradeRequired(addPhrases.error)?.reason === "daily_lesson_limit"
                  ? "Daily limit reached — go unlimited with Plus"
                  : "Unlock with Plus"}
              </Link>
            ) : (
              <p className="text-sm text-destructive text-center font-medium">
                Couldn't add new phrases. Please try again.
              </p>
            ))}

          {/* Final step: the Plus-only sentence stage. Locked callers see the
              upgrade nudge; Plus learners see the full-sentence list. */}
          {(category.sentencesLocked || (sentencesQuery.data?.length ?? 0) > 0 || sentencesQuery.isLoading) && (
            <div className="pt-6 space-y-3">
              <h3 className="font-bold text-lg text-foreground px-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-secondary" />
                Final step: Full sentences
              </h3>
              {category.sentencesLocked ? (
                <UpgradeCard
                  icon={<Lock className="h-6 w-6" />}
                  title={
                    category.sentenceCount > 0
                      ? `${category.sentenceCount} full ${
                          category.sentenceCount === 1 ? "sentence" : "sentences"
                        } with Plus`
                      : "Full sentences with Plus"
                  }
                  description="Graduate from phrases to real, natural sentences — the final step for every topic."
                  cta="Unlock with Plus"
                  href={upgradeHref({ plan: "plus" })}
                />
              ) : sentencesQuery.isLoading ? (
                <div className="bg-white rounded-2xl p-4 border border-card-border shadow-sm flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium text-sm">Preparing your sentences…</span>
                </div>
              ) : (
                <>
                  {sentencesQuery.data?.map((sentence, i) => (
                    <motion.div
                      key={sentence.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Link
                        href={`/practice/${id}?stage=sentences&phrase=${sentence.id}`}
                        className="bg-white rounded-2xl p-4 border border-card-border shadow-sm flex items-start gap-4 cursor-pointer card-lift hover:border-secondary/60"
                      >
                        <div className="mt-1 shrink-0">
                          {sentence.mastered ? (
                            <CheckCircle2 className="w-6 h-6 text-success" />
                          ) : (
                            <Circle className="w-6 h-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-xl font-bold text-foreground leading-snug" style={native.style} dir={native.dir}>{sentence.nativeScript}</p>
                          <p className="text-primary font-medium text-sm">{sentence.romanized}</p>
                          <p className="text-muted-foreground text-sm">{sentence.english}</p>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-secondary/10 text-secondary flex items-center justify-center shrink-0 self-center">
                          <Play className="w-4 h-4 fill-current" />
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                  <Link
                    href={`/practice/${id}?stage=sentences`}
                    className="w-full bg-secondary text-white font-bold text-lg py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-sm active:scale-[0.98] transition-all button-spring"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Practice sentences</span>
                  </Link>
                </>
              )}
            </div>
          )}

          {noNewPhrases && !addPhrases.isPending && (
            <div className="flex flex-col gap-3 rounded-2xl bg-success/10 border border-success/20 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <p className="flex-1 text-sm text-success font-medium">
                  You've mastered every phrase — nice work! Keep them sharp with a review session.
                </p>
                <button
                  type="button"
                  onClick={() => setNoNewPhrases(false)}
                  aria-label="Dismiss"
                  className="shrink-0 -mr-1 -mt-1 rounded-full p-1 text-success/70 hover:text-success hover:bg-success/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Link
                href="/review"
                className="w-full bg-success text-white font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Review phrases</span>
              </Link>
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}

