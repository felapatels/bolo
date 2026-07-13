import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Mic, Sparkles, Trophy, ArrowRight, Volume2, Hand, MessageCircle, Check, X } from 'lucide-react';
import { useListLanguages, type Language } from '@workspace/api-client-react';
import { nativeTextProps } from '@/lib/language-context';
import { SpeakingDemo } from '@/components/speaking-demo';

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

export default function Landing() {
  const { data: languages } = useListLanguages();
  const langs = languages ?? [];
  const displayLangs = langs.length > 0 ? langs : FALLBACK_LANGS;

  return (
    <div className="min-h-[100dvh] bg-background overflow-x-hidden">
      {/* Nav */}
      <header className="px-6 pt-8 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Bolo!" className="h-9 w-9" />
          <span className="text-2xl font-black text-foreground tracking-tight">Bolo!</span>
        </div>
        <Link
          href="/sign-in"
          className="font-bold text-foreground/80 hover:text-foreground px-4 py-2 rounded-xl transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <main className="px-6 max-w-5xl mx-auto">
        <section className="pt-14 pb-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-secondary/10 text-secondary font-bold text-sm px-4 py-2 rounded-full mb-6"
          >
            <Sparkles className="w-4 h-4" />
            Talk, don't tap — it hits different
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl sm:text-6xl font-black text-foreground leading-[1.05] tracking-tight max-w-3xl mx-auto"
          >
            Actually speak all 22
            <br />
            official Indian languages.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg sm:text-xl text-muted-foreground font-medium mt-6 max-w-xl mx-auto"
          >
            One app, all 22 languages. No matching tiles, no silent tapping — you
            say each phrase out loud and Bolo! coaches your pronunciation on the
            spot. For kids and grown-ups finding their way back to their
            family's language — real enough to actually stick.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4"
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

          {/* Live product demo — the actual speak → transcribe → coach loop */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-14"
          >
            <SpeakingDemo />
            <p className="mt-4 text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Watch the speak-out-loud loop in action
            </p>
          </motion.div>

          {/* Floating language chips — every language Bolo! supports */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto">
            {displayLangs.map((lang, i) => {
              const native = nativeTextProps(lang);
              return (
                <motion.span
                  key={lang.code}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + Math.min(i, 12) * 0.04 }}
                  className="flex items-center gap-2.5 bg-white border border-card-border rounded-2xl px-4 py-2.5 shadow-sm"
                >
                  <span
                    className="text-xl font-bold leading-none"
                    style={{ ...native.style, color: CHIP_COLORS[i % 3] }}
                    dir={native.dir}
                  >
                    {lang.nativeName}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground leading-none">
                    {lang.name}
                  </span>
                </motion.span>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="py-12 grid gap-5 sm:grid-cols-3">
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
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-3xl p-6 border border-card-border shadow-sm"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: `${step.color}20`, color: step.color }}
              >
                <step.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-foreground mb-1">{step.title}</h3>
              <p className="text-muted-foreground font-medium">{step.body}</p>
            </motion.div>
          ))}
        </section>

        {/* Why Bolo! is different */}
        <section className="py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-9"
          >
            <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              Why Bolo! hits different
            </h2>
            <p className="text-muted-foreground font-medium text-lg mt-3">
              Most apps have you tap the matching tile and call it a day. You can
              recognize words — but can you actually say them? Big difference.
            </p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-3xl p-7 border border-card-border shadow-sm"
            >
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 }}
              className="bg-white rounded-3xl p-7 border-2 border-primary shadow-sm relative"
            >
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
            </motion.div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-12">
          <div className="bg-foreground text-background rounded-[2.5rem] p-10 text-center relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-secondary/20" />
            <div className="relative">
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
        </section>
      </main>

      <footer className="px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
        Bolo! — stop tapping, start talking.
      </footer>
    </div>
  );
}
