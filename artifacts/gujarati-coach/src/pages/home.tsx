import { BookOpen, Trophy, Sparkles, Flame, Star, Loader2, ArrowRight, Hand, LogOut } from "lucide-react";
import { Link } from "wouter";
import { useGetProgressSummary, useListCategories, useListRecentAttempts } from "@workspace/api-client-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUser, useClerk } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const iconMap: Record<string, React.ElementType> = {
  "book-open": BookOpen,
  "star": Star,
  "sparkles": Sparkles,
  "flame": Flame,
};

export default function Home() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const firstName = user?.firstName;
  const { data: summary, isLoading: loadingSummary } = useGetProgressSummary();
  const { data: categories, isLoading: loadingCats } = useListCategories();
  const { data: attempts } = useListRecentAttempts({ limit: 3 });

  if (loadingSummary || loadingCats) {
    return (
      <div className="flex min-h-screen items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-24 bg-background">
      {/* Header / Greeting */}
      <header className="pt-12 px-6 pb-6 bg-gradient-to-b from-primary/10 to-transparent">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground mb-1">
              Kem chho{firstName ? `, ${firstName}` : ""}! <Hand className="inline-block w-8 h-8 text-primary origin-bottom-right animate-wave" />
            </h1>
            <p className="text-muted-foreground text-lg font-medium">Ready to speak some Gujarati?</p>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            title="Sign out"
            className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center bg-white border border-card-border text-muted-foreground hover:text-foreground shadow-[0_4px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-none transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </motion.div>

        {/* Stats Row */}
        {summary && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex gap-3 mt-6"
          >
            <div className="flex-1 bg-white rounded-2xl p-4 border border-card-border shadow-sm flex flex-col items-center justify-center button-spring">
              <Flame className="w-8 h-8 text-primary mb-2" fill="currentColor" />
              <div className="text-2xl font-black text-foreground">{summary.currentStreakDays}</div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Day Streak</div>
            </div>
            <div className="flex-1 bg-white rounded-2xl p-4 border border-card-border shadow-sm flex flex-col items-center justify-center button-spring">
              <Star className="w-8 h-8 text-[#ffd166] mb-2" fill="currentColor" />
              <div className="text-2xl font-black text-foreground">{summary.xp}</div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total XP</div>
            </div>
            <div className="flex-1 bg-white rounded-2xl p-4 border border-card-border shadow-sm flex flex-col items-center justify-center button-spring">
              <Trophy className="w-8 h-8 text-secondary mb-2" fill="currentColor" />
              <div className="text-2xl font-black text-foreground">{summary.phrasesMastered}</div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mastered</div>
            </div>
          </motion.div>
        )}
      </header>

      <main className="px-6 space-y-8">
        {/* Categories Grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Topics</h2>
          </div>
          <div className="grid gap-4">
            {categories?.map((cat, i) => {
              const Icon = iconMap[cat.iconName] || BookOpen;
              const progress = cat.phraseCount > 0 ? Math.round((cat.masteredCount / cat.phraseCount) * 100) : 0;
              
              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                >
                  <Link href={`/learn/${cat.id}`} className="block">
                    <div className="bg-white rounded-2xl p-5 border-2 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-4 relative overflow-hidden" style={{ borderColor: cat.accent || 'var(--color-primary)' }}>
                      <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -mr-10 -mt-10" style={{ backgroundColor: cat.accent || 'var(--color-primary)' }} />
                      
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: cat.accent ? `${cat.accent}20` : 'var(--color-primary-100)', color: cat.accent || 'var(--color-primary)' }}>
                        <Icon className="w-7 h-7" />
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-foreground leading-tight">{cat.title}</h3>
                        <p className="text-sm font-gujarati text-muted-foreground mt-0.5">{cat.titleGujarati}</p>
                        
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${progress}%`, backgroundColor: cat.accent || 'var(--color-primary)' }} />
                          </div>
                          <span className="text-xs font-bold text-muted-foreground min-w-[2.5rem] text-right">{progress}%</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        {categories && categories.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Link 
              href={`/practice/${categories[0].id}`} 
              className="w-full bg-primary text-primary-foreground font-black text-lg py-5 px-6 rounded-2xl flex items-center justify-between shadow-[0_8px_0_hsl(27,100%,45%)] active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all"
            >
              <span>Start Daily Practice!</span>
              <div className="bg-white/20 p-2 rounded-full">
                <ArrowRight className="w-6 h-6" />
              </div>
            </Link>
          </motion.div>
        )}

        {/* Recent Activity */}
        {attempts && attempts.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-foreground mb-4">Recent Plays</h2>
            <div className="space-y-3">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="bg-white rounded-xl p-4 border border-card-border shadow-sm flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg",
                    attempt.score >= 80 ? "bg-success/15 text-success" : 
                    attempt.score >= 60 ? "bg-primary/15 text-primary" : 
                    "bg-destructive/15 text-destructive"
                  )}>
                    {Math.round(attempt.score)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-gujarati text-lg leading-tight truncate">{attempt.gujaratiScript}</p>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{attempt.english}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
