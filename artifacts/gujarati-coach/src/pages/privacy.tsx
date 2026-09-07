import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = 'September 7, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-black text-foreground tracking-tight mb-3">{title}</h2>
      <div className="space-y-3 text-muted-foreground font-medium leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-[100dvh] bg-background overflow-x-hidden">
      {/* Nav */}
      <header className="px-6 pt-8 flex items-center justify-between max-w-3xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}mascot/mascot-wave.png`} alt="Bolo!" className="h-9 w-9 object-contain" />
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
            Privacy Policy
          </h1>
          <p className="text-muted-foreground font-medium mt-4">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="mt-8 text-muted-foreground font-medium leading-relaxed space-y-3">
          <p>
            Bolo! ("we", "us", or "the app") is a language-learning app that helps you
            learn to speak South Asian languages out loud. This policy explains what
            information we collect, how we use it, and the choices you have. It applies
            to both the Bolo! website and the Bolo! Mobile app.
          </p>
        </div>

        <Section title="Information we collect">
          <p>We keep data collection to the minimum needed to run the app:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <span className="font-bold text-foreground">Account information.</span>{' '}
              When you sign up we collect your email address (and, if you choose to
              sign in with a provider like Google, the basic profile information that
              provider shares). Authentication is handled by our identity provider,
              Clerk. We use this to create and secure your account.
            </li>
            <li>
              <span className="font-bold text-foreground">Voice recordings.</span>{' '}
              When you practice a phrase, the app records a short audio clip of you
              speaking (using your device microphone) and sends it to our backend so we
              can score your pronunciation and give you feedback. Recording only happens
              while you are actively practicing and tap the microphone.
            </li>
            <li>
              <span className="font-bold text-foreground">Learning progress.</span>{' '}
              We store your lesson progress, pronunciation scores, streaks, badges, and
              similar activity data so we can track your progress and personalize your
              practice.
            </li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-6 space-y-2">
            <li>To create your account and sign you in securely.</li>
            <li>
              To transcribe and score your pronunciation and return coaching feedback in
              real time.
            </li>
            <li>
              To save your progress, streaks, and achievements across your devices.
            </li>
            <li>
              To operate, maintain, and improve the app's core learning features.
            </li>
          </ul>
        </Section>

        <Section title="How your voice recordings are handled">
          <p>
            Your audio recordings are used for one purpose only: scoring your
            pronunciation. An audio clip is sent to our backend, processed to produce a
            transcription and a pronunciation score, and is{' '}
            <span className="font-bold text-foreground">
              not retained beyond that scoring request
            </span>
            . We do not use your voice recordings to build voice profiles, and we do{' '}
            <span className="font-bold text-foreground">not sell or share</span> your
            recordings with third parties for advertising or any other purpose.
          </p>
        </Section>

        <Section title="Sharing and third parties">
          <p>
            We do not sell your personal information. We share data only with the
            service providers that make the app work, and only to the extent needed to
            provide the service:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <span className="font-bold text-foreground">Clerk</span> — authentication
              and account management (stores your email and login credentials).
            </li>
            <li>
              <span className="font-bold text-foreground">
                Speech and AI processing providers
              </span>{' '}
              — used to transcribe and score your pronunciation. In normal use, audio is
              sent only for scoring and is not retained by us beyond the request.
              Recordings made through our invited voice contribution mode are retained
              as described in Data retention below.
            </li>
          </ul>
          <p>
            We may also disclose information if required by law, or to protect the
            rights, safety, and security of our users and the service.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your account information and learning progress for as long as your
            account is active. When you delete your account, we delete your associated
            personal data and learning progress.
          </p>
          <p>
            <span className="font-bold text-foreground">Voice recordings.</span> In
            normal use, your voice recordings are processed to score your pronunciation
            and are not retained after the scoring request completes.
          </p>
          <p>
            Separately, we run an optional voice contribution mode used to improve
            BOLO's pronunciation scoring. This mode is clearly indicated on screen and
            is only available to invited contributors. Recordings made in contribution
            mode are retained, along with the phrase and language they belong to, and
            are used solely to evaluate and improve our scoring system. If a
            contributor re-records a phrase, the discarded take is deleted.
            Contributed recordings are <span className="font-bold text-foreground">not
            attached to an account</span>: most contributors are family members who
            never sign in, so a recording carries only the name the contributor typed
            and the sitting it came from. That means deleting an account does not
            reach them. Contributors can ask us to remove their recordings at any time
            by{' '}
            <Link href="/contact" className="font-bold text-primary hover:underline">
              contacting us
            </Link>{' '}
            and telling us the name they used.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            Bolo! is friendly enough for younger learners, but it is not directed at
            children under 13, and we do not knowingly collect personal information from
            children under 13 without appropriate consent. If you believe a child has
            provided us personal information, please contact us and we will remove it.
          </p>
        </Section>

        <Section title="Your rights and choices">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <span className="font-bold text-foreground">Microphone control.</span>{' '}
              The app only records when you tap the microphone to practice. You can
              revoke microphone access at any time in your device settings (recording
              features will stop working, but the rest of the app still functions).
            </li>
            <li>
              <span className="font-bold text-foreground">Access and deletion.</span>{' '}
              You can delete your account yourself, from inside the app, at any time.
              See <span className="font-bold text-foreground">Deleting your
              account</span> below for exactly where the button is and what it removes.
              For a copy of your data, use the contact form linked below.
            </li>
          </ul>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your Bolo! account yourself, from inside the app. You do
            not need to email us and you do not need to ask.
          </p>
          <p>
            <span className="font-bold text-foreground">On the website:</span> open{' '}
            <span className="font-bold text-foreground">Account &amp; settings</span>{' '}
            from the navigation, scroll to{' '}
            <span className="font-bold text-foreground">Delete account</span>, choose{' '}
            <span className="font-bold text-foreground">Delete my account</span>, then
            confirm with{' '}
            <span className="font-bold text-foreground">Delete forever</span>.
          </p>
          <p>
            <span className="font-bold text-foreground">In the mobile app:</span> tap
            the settings icon on the Home screen to open{' '}
            <span className="font-bold text-foreground">Account settings</span>, scroll
            to <span className="font-bold text-foreground">Delete account</span>, tap
            it, then confirm with{' '}
            <span className="font-bold text-foreground">Delete</span>.
          </p>
          <p className="rounded-2xl border border-card-border bg-muted/40 p-4">
            <span className="font-bold text-foreground">
              Deleting your account does not cancel your subscription.
            </span>{' '}
            Subscriptions are billed by Apple or Google, not by us, so cancel yours in
            the App Store or in Google Play first. If you delete your account without
            cancelling, the store keeps billing you and we have no way to stop it.
          </p>

          <p className="pt-2">
            <span className="font-bold text-foreground">What we delete.</span> Your
            sign-in identity goes first, so nobody can sign back in while the rest is
            being removed. Then:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Everything you learned with: your practice attempts, XP, badges, streak
              and ability records, the phrases Bolo was tracking for you, your script
              tracing progress, zone and lesson test-outs, daily quizzes and game
              sessions.
            </li>
            <li>
              Your conversations with Bolo, including the notes Bolo kept about you
              between sessions.
            </li>
            <li>
              Your social records: friendships, invitations you sent, anyone you
              blocked, and any report you filed about a username.
            </li>
            <li>
              Your family plan. If you were a member, your seat is freed. If you owned
              the plan, the plan is dissolved and every seat on it is released.
            </li>
            <li>Your Chai wallet and everything it recorded.</li>
            <li>Messages you sent us through the contact form.</li>
            <li>
              Your push notification tokens, so the app can no longer reach your
              device.
            </li>
          </ul>

          <p className="pt-2">
            <span className="font-bold text-foreground">What we do not delete, and
            why.</span>
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <span className="font-bold text-foreground">Store receipts.</span> Apple
              and Google hold your purchase records. We never had them, so we cannot
              remove them.
            </li>
            <li>
              <span className="font-bold text-foreground">Recordings you contributed
              as a speaker.</span> These are not attached to an account, so account
              deletion cannot reach them. Ask us and we will remove them.
            </li>
            <li>
              <span className="font-bold text-foreground">Anonymous totals.</span>{' '}
              Counts that no longer name anybody, such as how many people practised a
              phrase, stay in our aggregates.
            </li>
          </ul>

          <p className="pt-2">
            <span className="font-bold text-foreground">It happens immediately and
            cannot be undone.</span>{' '}
            There is no restore window. Encrypted backups may retain a copy for a short
            period before they expire, and we cannot retrieve your account from them.
          </p>

          <p>
            <span className="font-bold text-foreground">If you cannot sign in</span>{' '}
            and therefore cannot reach the button, use our{' '}
            <Link href="/contact" className="font-bold text-primary hover:underline">
              contact form
            </Link>{' '}
            from the email address on the account and we will delete it for you.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we will revise the
            "Last updated" date at the top of this page. Significant changes will be
            communicated through the app or by email where appropriate.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            If you have questions about this policy, or want to access or delete your
            data, reach us through our{' '}
            <Link href="/contact" className="font-bold text-primary hover:underline">
              contact form
            </Link>
            .
          </p>
        </Section>
      </main>

      <footer className="px-6 pb-10 text-center text-sm text-muted-foreground font-medium">
        Bolo! — stop tapping, start talking.
      </footer>
    </div>
  );
}
