import { Link } from 'wouter';
import { ArrowLeft, Mail, Trash2, CreditCard, LifeBuoy } from 'lucide-react';

import { SUPPORT_EMAIL } from '@/lib/appDomain';

/**
 * The support page, and the URL both stores are pointed at.
 *
 * TWO STORE FIELDS DEPEND ON THIS FILE EXISTING AND BEING ROUTED:
 *
 * 1. App Store Connect "Support URL" needs a page that isn't a dead end.
 *    Before this page existed, /support.html fell through to the SPA and
 *    rendered not-found — a reviewer clicking it saw a 404, the same fault
 *    fixed for /privacy.html and /terms.html in the same sitting.
 * 2. Google Play's Data safety form requires a public URL that DOCUMENTS how
 *    an account is deleted, which a reviewer will open. It does not require a
 *    route with a particular name, so this page carries that section rather
 *    than a separate /delete-account.
 *
 * Ported from SEA's support.tsx (2026-09-11), the same page every fork built
 * off. The deletion bullets below were checked against THIS fork's own
 * `DELETE /account` handler, not copied blind: `routes/account.ts` purges
 * family seats/plans, chat turns, friend invites, attempts, badges, lesson
 * generations, friendships, xp ledger, ability/item memory, phrase reports,
 * daily quiz completions, game sessions, lesson group progress/testouts,
 * script trace progress, contact submissions, zone testouts, blocks and
 * username reports before the users row. Re-read this list whenever that
 * handler changes.
 */

const LAST_UPDATED = 'September 11, 2026';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-2xl font-black text-foreground tracking-tight mb-3">
        <Icon className="w-6 h-6 shrink-0" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-3 text-muted-foreground font-medium leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function Support() {
  return (
    <div className="min-h-[100dvh] bg-background overflow-x-hidden">
      {/* Nav */}
      <header className="px-6 pt-8 flex items-center justify-between max-w-3xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}mascot/mascot-wave.png`}
            alt="Bolo!"
            className="h-9 w-9 object-contain"
          />
          <span className="text-2xl font-black text-foreground tracking-tight">Bolo!</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-bold text-foreground/80 hover:text-foreground px-4 py-2 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Home
        </Link>
      </header>

      <main className="px-6 max-w-3xl mx-auto pb-20">
        <div className="pt-12">
          <h1 className="text-4xl sm:text-5xl font-black text-foreground leading-[1.05] tracking-tight">
            Support
          </h1>
          <p className="mt-4 text-lg text-muted-foreground font-medium leading-relaxed">
            Bolo! teaches 22 South Asian languages out loud. If something is not
            working, or you want an account removed, everything you need is on this page.
          </p>
          <p className="mt-2 text-sm text-muted-foreground font-medium">
            Last updated {LAST_UPDATED}
          </p>
        </div>

        <Section icon={Mail} title="Get in touch">
          <p>
            Write to{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-bold text-foreground underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{' '}
            and a person reads it. There is also a{' '}
            <Link
              href="/contact"
              className="font-bold text-foreground underline underline-offset-4"
            >
              contact form
            </Link>{' '}
            if you would rather not open your mail app.
          </p>
          <p>
            It helps to say which language you were learning and what you were doing when
            it went wrong. If a phrase sounded incorrect, you can also report it from
            inside the app and it reaches the same place.
          </p>
        </Section>

        <Section icon={CreditCard} title="Subscriptions and billing">
          <p>
            All-Access is billed by Apple or Google, not by us, so cancelling and
            refunds are handled in your store account. On an iPhone or iPad that is
            Settings, then your name, then Subscriptions. On Android it is the Play
            Store, then your profile, then Payments and subscriptions.
          </p>
          <p>
            Cancelling a subscription does not delete your account, and deleting your
            account does not cancel a subscription. If you want both, cancel in the
            store first, then delete below.
          </p>
        </Section>

        <Section icon={Trash2} title="Delete your account">
          <p>
            <strong className="text-foreground">In the app:</strong> open{' '}
            <strong className="text-foreground">Account</strong>, scroll to{' '}
            <strong className="text-foreground">Delete account</strong>, and confirm. The
            same path works on iPhone, on Android and on the web.
          </p>
          <p>
            <strong className="text-foreground">If you cannot sign in:</strong> email{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-bold text-foreground underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{' '}
            from the address on the account and ask for it to be deleted. Being locked
            out is not a reason to be stuck with an account.
          </p>
          <p className="pt-2">Deleting removes, permanently:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>your profile, sign-in and email address</li>
            <li>
              everything you have learned: attempts and recordings you submitted for
              scoring, scores, XP, badges, streak, and which phrases you have met
            </li>
            <li>
              your journey progress, including zone test-outs, lesson groups and
              script tracing
            </li>
            <li>your conversations with Bolo the parrot, and what he remembered</li>
            <li>daily quiz results and game sessions</li>
            <li>
              your friends, friend invites, and any blocks or reports you made or
              received
            </li>
            <li>
              your family plan. Deleting the owner's account dissolves the plan and
              frees every seat; deleting a member's account frees only that seat
            </li>
            <li>any phrase reports and contact messages you sent us</li>
          </ul>
          <p className="pt-2">
            It happens immediately and it cannot be undone. There is no restore
            window. Encrypted backups may retain a copy for a short period before
            they expire, and we cannot retrieve your account from them. Starting
            again later means starting from zero, with a new account.
          </p>
          <p>
            One thing is deliberately kept: if you reported a phrase as wrong, the
            correction itself stays, because it was a fix to the course rather than
            information about you. It is no longer linked to you once your account is
            gone.
          </p>
        </Section>

        <Section icon={LifeBuoy} title="Your data and the rules">
          <p>
            What we collect and why is in the{' '}
            <Link
              href="/privacy"
              className="font-bold text-foreground underline underline-offset-4"
            >
              privacy policy
            </Link>
            , and the agreement you are using the app under is in the{' '}
            <Link
              href="/terms"
              className="font-bold text-foreground underline underline-offset-4"
            >
              terms
            </Link>
            .
          </p>
        </Section>
      </main>
    </div>
  );
}
