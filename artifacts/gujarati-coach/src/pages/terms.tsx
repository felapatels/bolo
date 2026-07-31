import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const CONTACT_EMAIL = 'support@bolo-india.app';
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

export default function Terms() {
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
            Terms of Service
          </h1>
          <p className="text-muted-foreground font-medium mt-4">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="mt-8 text-muted-foreground font-medium leading-relaxed space-y-3">
          <p>
            These Terms of Service ("Terms") govern your access to and use of Bolo!
            ("we", "us", or "the app"), a language-learning app that helps you learn
            to speak Indian languages out loud. They apply to both the Bolo! website
            and the Bolo! Mobile app. By creating an account or using the app, you
            agree to these Terms. If you do not agree, please do not use the app.
          </p>
        </div>

        <Section title="Eligibility and your account">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              You must be at least 13 years old to use Bolo!. If you are under the age
              of majority where you live, you may only use the app with the involvement
              of a parent or guardian.
            </li>
            <li>
              You are responsible for the activity that happens under your account and
              for keeping your login credentials secure. Authentication is handled by
              our identity provider, Clerk.
            </li>
            <li>
              Please provide accurate information when you sign up and keep it current.
            </li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p>When you use Bolo!, you agree not to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Use the app for any unlawful purpose or in violation of these Terms or any
              applicable law.
            </li>
            <li>
              Attempt to gain unauthorized access to the app, other users' accounts, or
              our systems and networks.
            </li>
            <li>
              Reverse engineer, decompile, scrape, or interfere with the operation,
              security, or integrity of the app.
            </li>
            <li>
              Upload or transmit content that is abusive, harassing, infringing, or that
              you do not have the right to share — including through the microphone
              recording features.
            </li>
            <li>
              Misuse the social features (such as friends and leaderboards) to harass or
              impersonate others, or to send unsolicited or automated requests.
            </li>
          </ul>
          <p>
            We may suspend or terminate accounts that violate these Terms or that harm
            the service or other users.
          </p>
        </Section>

        <Section title="Subscriptions and billing">
          <p>
            Bolo! offers a free tier and a paid subscription ("All-Access") that unlocks
            additional features. The following terms apply to paid subscriptions:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <span className="font-bold text-foreground">Billing.</span> All-Access is billed
              in advance on a recurring basis (for example, monthly or annually) at the
              price shown at the time of purchase, plus any applicable taxes.
            </li>
            <li>
              <span className="font-bold text-foreground">Auto-renewal.</span> Your
              subscription renews automatically at the end of each billing period unless
              you cancel before the renewal date. You can cancel at any time.
            </li>
            <li>
              <span className="font-bold text-foreground">Managing your subscription.</span>{' '}
              Where you purchased All-Access determines how you manage or cancel it. Web
              purchases are managed through the app's billing settings; purchases made
              through the Apple App Store or Google Play are managed through your Apple
              or Google account subscription settings.
            </li>
            <li>
              <span className="font-bold text-foreground">Cancellation.</span> When you
              cancel, you keep All-Access through the end of the current billing period,
              and it does not renew after that. We do not provide prorated refunds for
              partial periods except where required by law.
            </li>
            <li>
              <span className="font-bold text-foreground">App store terms.</span> If you
              subscribe through the Apple App Store or Google Play, that platform's
              payment, refund, and subscription terms also apply and may govern
              cancellations and refunds.
            </li>
            <li>
              <span className="font-bold text-foreground">Price changes.</span> We may
              change subscription prices going forward. We will give you reasonable
              notice, and changes will not affect the period you have already paid for.
            </li>
          </ul>
        </Section>

        <Section title="Your content and license">
          <p>
            You retain ownership of the content you provide, including your voice
            recordings. You grant us a limited license to process that content solely to
            operate the app — for example, to transcribe and score your pronunciation and
            return feedback. How we handle your voice recordings and other data is
            described in our{' '}
            <Link href="/privacy" className="font-bold text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="Intellectual property">
          <p>
            The app, including its lessons, content, software, branding, and design, is
            owned by us or our licensors and is protected by intellectual property laws.
            We grant you a personal, non-exclusive, non-transferable, revocable license
            to use the app for your own language learning. You may not copy, resell, or
            redistribute the app or its content except as expressly permitted.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            Bolo! is a learning aid. Pronunciation scoring and AI-generated feedback are
            provided for practice and may not be perfectly accurate; they are not a
            substitute for professional instruction, translation, or certification.
          </p>
          <p>
            The app is provided{' '}
            <span className="font-bold text-foreground">"as is" and "as available"</span>{' '}
            without warranties of any kind, whether express or implied, including
            warranties of merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that the app will be uninterrupted,
            error-free, or that any content will be accurate.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, we will not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any
            loss of data, use, or goodwill, arising out of your use of the app. To the
            maximum extent permitted by law, our total liability for any claim relating
            to the app will not exceed the amount you paid us, if any, in the twelve
            months before the claim.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may stop using the app and delete your account at any time. We may
            suspend or terminate your access if you violate these Terms or if we
            discontinue the app. When your account is deleted, we handle your data as
            described in our Privacy Policy. Provisions that by their nature should
            survive termination (such as intellectual property, disclaimers, and
            limitation of liability) will continue to apply.
          </p>
        </Section>

        <Section title="Changes to these Terms">
          <p>
            We may update these Terms from time to time. When we do, we will revise the
            "Last updated" date at the top of this page. Significant changes will be
            communicated through the app or by email where appropriate. Your continued
            use of the app after changes take effect means you accept the updated Terms.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            If you have questions about these Terms, contact us at{' '}
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
