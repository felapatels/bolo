// Add-to-home-screen invitation for the signed-in home page.
//
// There is no native app for iPad, tablets or desktop, and no manifest or
// service worker in this app, so this is honestly a bookmark: it opens in the
// visitor's browser, it is not an installed app, and the copy says so. The
// App Store badge sits beside it for the platform that does have an app
// coming.
//
// Platform-aware by design: an iPad visitor never sees Chrome steps and an
// Android visitor never sees Safari steps. When the platform cannot be told
// confidently the block falls back to neutral wording rather than guessing.
import { Smartphone } from "lucide-react";
import { AppStoreBadge } from "@/components/app-store-badge";
import { detectShortcutPlatform, type ShortcutPlatform } from "@/lib/platform";

const GUIDANCE: Record<
  ShortcutPlatform,
  { steps: string[]; note: string }
> = {
  ios: {
    steps: [
      "Tap the Share button in Safari, the square with an arrow pointing up.",
      "Scroll down the list and tap Add to Home Screen.",
      "Tap Add, and Bolo is waiting on your home screen.",
    ],
    note: "It still opens in Safari. This is a shortcut to the website, not the App Store app.",
  },
  android: {
    steps: [
      "Tap the three dot menu in Chrome, up in the top right.",
      "Tap Add to Home screen, then tap Add.",
    ],
    note: "It still opens in Chrome. This is a shortcut to the website, not an installed app.",
  },
  unknown: {
    steps: [
      "Open your browser's share or menu button.",
      "Look for Add to Home Screen and tap it.",
    ],
    note: "It still opens in your browser. This is a shortcut to the website, not an installed app.",
  },
};

export function AddToHomeScreen() {
  const platform = detectShortcutPlatform();
  const { steps, note } = GUIDANCE[platform];

  return (
    <section
      data-testid="add-to-home"
      aria-labelledby="add-to-home-title"
      className="mt-12 flex flex-col gap-6 border-t border-card-border pt-8 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="max-w-md" data-testid={`add-to-home-${platform}`}>
        <h2
          id="add-to-home-title"
          className="flex items-center gap-2 text-sm font-bold text-foreground"
        >
          <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Keep Bolo one tap away
        </h2>
        <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="font-bold text-muted-foreground/70">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground/80">{note}</p>
      </div>

      {/* The badge shows where the visitor's own platform will get the app:
          Apple on iOS, Google Play on Android, never both. An unrecognized
          platform has no store to point at, so it just gets the steps. */}
      {platform === "ios" && (
        <div className="flex flex-col items-start sm:items-end" data-testid="home-appstore-badge">
          <AppStoreBadge placement="home-appstore-badge" />
        </div>
      )}
      {platform === "android" && (
        <div className="flex flex-col items-start sm:items-end" data-testid="home-playstore-badge">
          <AppStoreBadge store="play" placement="home-playstore-badge" />
        </div>
      )}
    </section>
  );
}
