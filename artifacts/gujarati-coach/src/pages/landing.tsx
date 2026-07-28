import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { motion, useReducedMotion } from 'framer-motion';
import { Mic, Sparkles, Trophy, ArrowRight, Volume2, Hand, MessageCircle, Check, X } from 'lucide-react';
import { useListLanguages, type Language } from '@workspace/api-client-react';
import { nativeTextProps } from '@/lib/language-context';
import { SpeakingDemo } from '@/components/speaking-demo';
import { Mascot } from '@/components/mascot';
import { FloatingTag, springs } from '@/lib/motion';

const CHIP_COLORS = ['#4F46E5', '#0D9488', '#6366F1'];

// Shown instantly on first paint (and if the languages API is slow/empty) so the
// hero never renders an empty chip row. Replaced by the full list once loaded.
const FALLBACK_LANGS = [
  { code: 'gu', nativeName: 'ગુજરાતી', name: 'Gujarati', fontFamily: 'Noto Sans Gujarati', rtl: false },
  { code: 'hi', nativeName: 'हिन्दी', name: 'Hindi', fontFamily: 'Noto Sans Devanagari', rtl: false },
  { code: 'bn', nativeName: 'বাংলা', name: 'Bengali', fontFamily: 'Noto Sans Bengali', rtl: false },
  { code: 'te', nativeName: 'తెలుగు', name: 'Telugu', fontFamily: 'Noto Sans Telugu', rtl: false },
  { code: 'ta', nativeName: 'தமிழ்', name: 'Tamil', fontFamily: 'Noto Sans Tamil', rtl: false },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', name: 'Punjabi', fontFamily: 'Noto Sans Gurmukhi', rtl: false },
] as Language[];

// Spring-based reveal that mirrors the launch video's section entrances. Honors
// the OS reduce-motion setting: collapses to a plain, instant fade (framer-motion
// is JS-driven, so the global CSS reduce-motion reset doesn't neutralize it).
function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={reduceMotion ? { duration: 0.001 } : { ...springs.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const reduceMotion = useReducedMotion();
  const { data: languages } = useListLanguages();
  const langs = languages ?? [];
  const displayLangs = langs.length > 0 ? langs : FALLBACK_LANGS;

  // Hero entrances animate on load (above the fold); softened to a fade when
  // motion is reduced.
  const heroItem = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion ? { duration: 0.001 } : { ...springs.smooth, delay },
  });

  return (
    <div className="app-surface min-h-[100dvh] bg-background overflow-x-hidden">
      {/* Nav */}
      <header className="px-6 pt-8 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}mascot/mascot-wave.png`} alt="Bolo!" className="h-9 w-9 object-contain" />
          <span className="text-2xl font-black text-foreground tracking-tight">Bolo!</span>
        </div>
        <Link
          href="/sign-in"
          className="font-bold text-foreground/80 hover:text-foreground px-4 py-2 rounded-xl transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="px-6 max-w-6xl mx-auto">
        {/* Hero — two columns on desktop: copy on the left, live demo on the right. */}
        <section className="pt-12 pb-14 lg:pt-20 lg:pb-20 grid items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <motion.div {...heroItem(0)} className="flex justify-center lg:justify-start">
              <Mascot pose="wave" size={88} idle="float" className="mb-5" />
            </motion.div>

            <motion.div
              {...heroItem(0.05)}
              className="inline-flex items-center gap-2 bg-secondary/10 text-secondary font-bold text-sm px-4 py-2 rounded-full mb-6"
            >
              <Sparkles className="w-4 h-4" />
              Talk, don't tap — it hits different
            </motion.div>

            <motion.h1
              {...heroItem(0.1)}
              className="text-5xl sm:text-6xl font-black text-foreground leading-[1.05] tracking-tight"
            >
              Actually speak all 22
              <br />
              official Indian languages.
            </motion.h1>

            <motion.p
              {...heroItem(0.15)}
              className="text-lg sm:text-xl text-muted-foreground font-medium mt-6 max-w-xl mx-auto lg:mx-0"
            >
              One app, all 22 languages. No matching tiles, no silent tapping — you
              say each phrase out loud and Bolo! coaches your pronunciation on the
              spot. For kids and grown-ups finding their way back to their
              family's language — real enough to actually stick.
            </motion.p>

            <motion.div
              {...heroItem(0.2)}
              className="mt-9 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              <Link
                href="/sign-up"
                className="w-full sm:w-auto bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
              >
                Get started free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/sign-in"
                className="w-full sm:w-auto bg-white text-foreground border-2 border-border font-bold text-lg py-4 px-8 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
              >
                I have an account
              </Link>
            </motion.div>
          </div>

          {/* Live product demo — the actual speak → transcribe → coach loop */}
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0.001 } : { ...springs.gentle, delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <SpeakingDemo />
            <p className="mt-4 text-sm font-bold uppercase tracking-widest text-muted-foreground text-center">
              Watch the speak-out-loud loop in action
            </p>
          </motion.div>
        </section>

        {/* Language showcase — floating tags for every language Bolo! supports. */}
        <section className="py-12">
          <Reveal className="text-center max-w-2xl mx-auto mb-9">
            <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              All 22 official Indian languages
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              From Gujarati to Tamil to Punjabi — find your family's language and
              start speaking it today.
            </p>
          </Reveal>

          <div className="flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto">
            {displayLangs.map((lang, i) => {
              const native = nativeTextProps(lang);
              return (
                <FloatingTag
                  key={lang.code}
                  delay={Math.min(i, 12) * 0.18}
                  distance={7}
                  dir={native.dir}
                  className="gap-2.5 bg-white border border-card-border !rounded-2xl px-4 py-2.5 shadow-sm"
                >
                  <span
                    className="text-xl font-bold leading-none"
                    style={{ ...native.style, color: CHIP_COLORS[i % 3] }}
                  >
                    {lang.nativeName}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground leading-none">
                    {lang.name}
                  </span>
                </FloatingTag>
              );
            })}
          </div>
        </section>

        {/* How it works — the feature grid */}
        <section className="py-12">
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: Volume2,
                color: '#0D9488',
                title: 'Hear it',
                body: 'Every phrase spoken clearly in native script, so you catch the vibe before you try.',
              },
              {
                icon: Mic,
                color: '#4F46E5',
                title: 'Say it out loud',
                body: 'Tap the mic and go for it. Bolo! actually listens and shows you exactly what it heard.',
              },
              {
                icon: Trophy,
                color: '#6366F1',
                title: 'Level up',
                body: 'Instant scoring, gentle tips, streaks and mastery to chase. Watch yourself get good.',
              },
            ].map((step, i) => (
              <Reveal
                key={step.title}
                delay={i * 0.08}
                className="glass-card rounded-3xl p-6 h-full"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${step.color}20`, color: step.color }}
                >
                  <step.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-black text-foreground mb-1">{step.title}</h3>
                <p className="text-muted-foreground font-medium">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Why Bolo! is different */}
        <section className="py-12">
          <Reveal className="text-center max-w-2xl mx-auto mb-9">
            <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              Why Bolo! hits different
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              Most apps have you tap the matching tile and call it a day. You can
              recognize words — but can you actually say them? Big difference.
            </p>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-2 max-w-4xl mx-auto">
            <Reveal className="glass-card rounded-3xl p-7 h-full">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-muted text-muted-foreground">
                <Hand className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-muted-foreground mb-3">
                Other apps
              </h3>
              <ul className="space-y-2.5">
                {[
                  'Tap the tile that matches. Silent the whole time.',
                  'You can point at words but freeze up out loud.',
                  'Feels like a quiz, not a conversation.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-muted-foreground font-medium">
                    <X className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.08} className="relative h-full">
              <div className="glass-card rounded-3xl p-7 h-full border-2 border-primary">
                <span className="absolute -top-3 right-6 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide px-3 py-1 rounded-full">
                  The Bolo! way
                </span>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-primary/15 text-primary">
                  <MessageCircle className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-black text-foreground mb-3">With Bolo!</h3>
                <ul className="space-y-2.5">
                  {[
                    'You open your mouth and actually speak — every time.',
                    'Real coaching on your pronunciation, phrase by phrase.',
                    'You leave able to say things, not just recognize them.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-foreground font-medium">
                      <Check className="w-5 h-5 shrink-0 mt-0.5 text-success" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-12">
          <Reveal>
            <div className="bg-foreground text-background rounded-[2.5rem] p-10 sm:p-14 text-center relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20" />
              <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-secondary/20" />
              <div className="relative max-w-2xl mx-auto">
                <h2 className="text-3xl sm:text-4xl font-black mb-3">
                  Ready to actually say something?
                </h2>
                <p className="text-background/70 font-medium text-lg mb-7 max-w-md mx-auto">
                  Make a free account and speak your first phrase in under a minute. No cap.
                </p>
                <Link
                  href="/sign-up"
                  className="inline-flex bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl items-center justify-center gap-3 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                >
                  Get started free
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
        <p>Bolo! — stop tapping, start talking.</p>
        <nav className="mt-3 flex items-center justify-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
