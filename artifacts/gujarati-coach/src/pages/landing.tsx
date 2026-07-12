import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Mic, Sparkles, Trophy, ArrowRight, Volume2 } from 'lucide-react';

const SCRIPTS = [
  { script: 'બોલો', name: 'Gujarati' },
  { script: 'बोलो', name: 'Hindi' },
  { script: 'বলো', name: 'Bengali' },
  { script: 'బోలో', name: 'Telugu' },
  { script: 'சொல்', name: 'Tamil' },
  { script: 'ਬੋਲੋ', name: 'Punjabi' },
];

export default function Landing() {
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
            Speak the languages of India
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl sm:text-6xl font-black text-foreground leading-[1.05] tracking-tight max-w-3xl mx-auto"
          >
            Learn to speak,
            <br />
            one word at a time.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg sm:text-xl text-muted-foreground font-medium mt-6 max-w-xl mx-auto"
          >
            Bolo! listens as you say each phrase out loud, then coaches your
            pronunciation with friendly, kid-ready feedback.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/sign-up"
              className="w-full sm:w-auto bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-[0_8px_0_hsl(27,100%,45%)] active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all"
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

          {/* Floating script chips */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
            {SCRIPTS.map((s, i) => (
              <motion.span
                key={s.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                className="flex items-center gap-2.5 bg-white border border-card-border rounded-2xl px-5 py-3 shadow-sm"
              >
                <span
                  className="font-gujarati text-2xl font-bold leading-none"
                  style={{ color: ['#F5871F', '#0FA6A0', '#E84E8A'][i % 3] }}
                >
                  {s.script}
                </span>
                <span className="text-sm font-bold text-muted-foreground leading-none">
                  {s.name}
                </span>
              </motion.span>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="py-12 grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: Volume2,
              color: '#0FA6A0',
              title: 'Listen',
              body: 'Hear each phrase spoken clearly in native script.',
            },
            {
              icon: Mic,
              color: '#F5871F',
              title: 'Say it out loud',
              body: 'Tap the mic and repeat. Bolo! transcribes what you said.',
            },
            {
              icon: Trophy,
              color: '#E84E8A',
              title: 'Get better',
              body: 'Instant scoring, gentle tips, streaks and mastery to chase.',
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

        {/* Bottom CTA */}
        <section className="py-12">
          <div className="bg-foreground text-background rounded-[2.5rem] p-10 text-center relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-secondary/20" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-black mb-3">
                Ready to say your first word?
              </h2>
              <p className="text-background/70 font-medium text-lg mb-7 max-w-md mx-auto">
                Create a free account and start practicing in under a minute.
              </p>
              <Link
                href="/sign-up"
                className="inline-flex bg-primary text-primary-foreground font-black text-lg py-4 px-8 rounded-2xl items-center justify-center gap-3 shadow-[0_8px_0_hsl(27,100%,45%)] active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all"
              >
                Get started free
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
        Bolo! — say it, hear it, own it.
      </footer>
    </div>
  );
}
