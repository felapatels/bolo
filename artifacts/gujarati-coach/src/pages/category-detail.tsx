import { useParams, Link } from "wouter";
import { useState } from "react";
import {
  useListCategoryPhrases,
  useListCategories,
  useAddCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, CheckCircle2, Circle, Loader2, Plus, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { CategoryLessonSkeleton, LessonErrorScreen } from "@/components/lesson-states";

export default function CategoryDetail() {
  const { categoryId } = useParams();
  const id = parseInt(categoryId || "0", 10);
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();
  const queryClient = useQueryClient();

  const {
    data: phrases,
    isLoading: loadingPhrases,
    isError,
    isFetching,
    refetch,
  } = useListCategoryPhrases(id, activeLang);
  const { data: categories } = useListCategories({ lang: activeLang });
  const addPhrases = useAddCategoryPhrases();
  const [noNewPhrases, setNoNewPhrases] = useState(false);

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

  const category = categories?.find(c => c.id === id);

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

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-4 flex items-center justify-between">
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
      </header>

      <main className="flex-1 p-6 space-y-6">
        {/* Progress Header */}
        <div className="bg-white rounded-3xl p-6 border-2 shadow-sm text-center" style={{ borderColor: category.accent || 'var(--color-primary)' }}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: category.accent ? `${category.accent}20` : 'var(--color-primary-100)', color: category.accent || 'var(--color-primary)' }}>
            <TrophyIcon className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black mb-1">{masteredCount} / {phrases?.length}</h2>
          <p className="text-muted-foreground font-medium mb-6">Phrases Mastered</p>
          
          <Link 
            href={`/practice/${id}`}
            className="w-full bg-primary text-primary-foreground font-bold text-lg py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-[0_6px_0_hsl(27,100%,45%)] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all"
          >
            <Play className="w-6 h-6 fill-current" />
            <span>Practice All</span>
          </Link>
        </div>

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
                className="bg-white rounded-2xl p-4 border border-card-border shadow-sm flex items-start gap-4 cursor-pointer transition-all hover:border-primary/50 active:scale-[0.98] button-spring"
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

          {addPhrases.isError && (
            <p className="text-sm text-destructive text-center font-medium">
              Couldn't add new phrases. Please try again.
            </p>
          )}

          {noNewPhrases && !addPhrases.isPending && (
            <div className="flex items-start gap-3 rounded-2xl bg-success/10 border border-success/20 p-4 text-left">
              <Sparkles className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <p className="text-sm text-success font-medium">
                You've mastered every phrase we could think of for this topic! Check back later for more.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TrophyIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
