import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const CONTACT_EMAIL = 'privacy@bolo.app';
const LAST_UPDATED = 'July 13, 2026';

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
            learn to speak Indian languages out loud. This policy explains what
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
              — used to transcribe and score your pronunciation. Audio is sent only for
              scoring and is not retained by us beyond the request.
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
            account is active. Voice recordings are not retained beyond the pronunciation
            scoring request. When you delete your account, we delete your associated
            personal data and learning progress.
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
              You can request a copy of your data or delete your account and associated
              data by contacting us at the email below.
            </li>
          </ul>
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
            data, contact us at{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-bold text-primary hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
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
