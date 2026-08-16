import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Map } from "lucide-react";
import {
  ArrowLeft,
  User as UserIcon,
  Crown,
  Sparkles,
  ShieldCheck,
  Bell,
  GraduationCap,
  LogOut,
  Trash2,
  Loader2,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Mail,
  Users,
  Volume2,
  Mic,
  MicOff,
  MessageCircle,
  Lock,
  Check,
  Play,
  Square,
  Gift,
} from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { track, ANALYTICS_EVENTS } from "@/lib/analytics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountProfile,
  useUpdateAccountPreferences,
  useDeleteAccount,
  ApiError,
  type UpdatePreferencesInput,
  type VoiceCatalogEntry,
} from "@workspace/api-client-react";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import { useEntitlements } from "@/lib/entitlements";
import { useTheme, type Theme } from "@/lib/theme-context";
import { loadSpokenFeedback, saveSpokenFeedback } from "@/lib/spoken-feedback";
import { loadSilentMode, saveSilentMode } from "@/lib/silent-mode";
import { loadSoundPref, saveSoundPref } from "@/lib/soundPref";
import { loadCoachVoicePref, saveCoachVoicePref } from "@/lib/coachVoicePref";
import { loadMeaningAudio, saveMeaningAudio } from "@/lib/meaning-audio";
import { TimezoneSelect, detectedTimezone } from "@/components/timezone-select";
import { ReferralCard } from "@/components/referral-card";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Fixed sample phrase used to audition each voice in the picker.
const VOICE_SAMPLE_TEXT = "Namaste, I am learning your language.";

// Module-level cache: voiceId → base64 audio (same key space as the TTS
// cache on the server, so re-tapping is instant after the first fetch).
const webSampleCache: Record<string, string> = {};

// Track whichever HTMLAudioElement is currently playing a sample so we can
// stop it before starting a new one.
let currentSampleAudio: HTMLAudioElement | null = null;
// The state-reset fn for whichever VoiceCard is currently playing — called
// when another card starts so the previous card's icon reverts to Play.
let currentCardReset: (() => void) | null = null;

/** @internal Test-only: flush the in-memory voice sample cache so tests start from a clean slate. */
export function _clearVoiceSampleCache() {
  for (const k in webSampleCache) delete webSampleCache[k];
}

// The daily-goal presets we let learners pick from (target practice attempts a
// day). The backend accepts any integer 1–100; these are the sensible rungs.
const DAILY_GOAL_OPTIONS = [3, 5, 10, 15, 20, 30];

// Curated voice catalog — matches the server's VOICE_CATALOG exactly.
// Inlined client-side so there's no extra network request for a static list.
const VOICE_CATALOG: VoiceCatalogEntry[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "male", description: "Warm British male with a calm, trustworthy tone." },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", description: "Deep, resonant American male — great for North Indian languages." },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male", description: "Friendly, clear American male with a bright, energetic style." },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "male", description: "Upbeat, natural male voice with lively prosody." },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", gender: "male", description: "Strong, narrative male with commanding presence." },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "male", description: "Authoritative British male with a measured, formal delivery." },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", description: "Confident British female with a clear, professional tone." },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "female", description: "Warm, expressive female voice with a Swedish lilt." },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female", description: "Bright, upbeat female voice — cheerful and encouraging." },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", description: "Gentle, articulate American female with natural warmth." },
];

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name && name.trim()) || (email && email.split("@")[0]) || "";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | undefined;
    if (data && typeof data.error === "string") return data.error;
  }
  return fallback;
}

export default function Account() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { languages, activeLang, activeLanguage, setActiveLang } = useLanguage();
  const {
    isLanguageAllowed,
    isPaid,
    isPlus,
    isOneLanguage,
    isTrialing,
    status: subStatus,
    chosenLanguage,
  } = useEntitlements();
  const isPaused = subStatus === "paused";
  const hasSubscription = isPaid || isPaused;
  const subPlanLabel = isPaused
    ? "Subscription paused"
    : isOneLanguage
      ? "One Language"
      : isTrialing
        ? "All-Access trial"
        : "All-Access";
  const chosenLangName = languages.find(
    (l) => l.code === chosenLanguage,
  )?.name;
  const { theme, setTheme } = useTheme();

  const { data: account, isLoading } = useGetAccount();
  const updateProfile = useUpdateAccountProfile();
  const updatePrefs = useUpdateAccountPreferences();
  const deleteAccount = useDeleteAccount();

  // Device-local practice preference: whether the coach's feedback is read
  // aloud after scoring. Lives in localStorage (not the account record), so
  // it applies immediately and never syncs across devices.
  const [spokenFeedback, setSpokenFeedback] = useState(loadSpokenFeedback);
  function handleChangeSpokenFeedback(enabled: boolean) {
    setSpokenFeedback(enabled);
    saveSpokenFeedback(enabled);
  }

  // Device-local practice preference: whether the coach says the English
  // meaning after each phrase clip. Same localStorage pattern as the above.
  const [meaningAudio, setMeaningAudio] = useState(loadMeaningAudio);
  function handleChangeMeaningAudio(enabled: boolean) {
    setMeaningAudio(enabled);
    saveMeaningAudio(enabled);
  }

  // Device-local practice preference: whether the coach's voice is skipped
  // before recording begins. When on, the mic is available immediately.
  const [silentMode, setSilentMode] = useState(loadSilentMode);
  function handleChangeSilentMode(enabled: boolean) {
    setSilentMode(enabled);
    saveSilentMode(enabled);
  }

  // Device-local preference: whether sound effects (audio cues) play during
  // practice. Default on. Lives in localStorage — same pattern as the above.
  const [soundOn, setSoundOn] = useState(loadSoundPref);
  function handleChangeSoundOn(enabled: boolean) {
    setSoundOn(enabled);
    saveSoundPref(enabled);
  }

  // Device-local: whether Bolo's voice plays (phrase audio, meaning audio,
  // feedback read-aloud, band call-outs, chat replies, greeting). Default on.
  const [coachVoiceOn, setCoachVoiceOn] = useState(loadCoachVoicePref);
  function handleChangeCoachVoiceOn(enabled: boolean) {
    setCoachVoiceOn(enabled);
    saveCoachVoicePref(enabled);
  }

  // Profile form — seeded from the account snapshot once it loads.
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (account) {
      setDisplayName(account.profile.displayName ?? "");
      setAvatarUrl(account.profile.avatarUrl ?? "");
    }
  }, [account]);

  const notifications = account?.preferences.notifications;
  const learning = account?.preferences.learning;
  const detectedTz = detectedTimezone();

  const profileDirty =
    !!account &&
    (displayName.trim() !== (account.profile.displayName ?? "") ||
      (avatarUrl.trim() || "") !== (account.profile.avatarUrl ?? ""));

  const allowedLanguages = useMemo(
    () => languages.filter((l) => isLanguageAllowed(l.code)),
    [languages, isLanguageAllowed],
  );

  const invalidateAccount = () =>
    queryClient.invalidateQueries({ queryKey: getGetAccountQueryKey() });

  async function savePreferences(patch: UpdatePreferencesInput, successMsg?: string) {
    try {
      await updatePrefs.mutateAsync({ data: patch });
      await invalidateAccount();
      if (successMsg) toast({ title: successMsg });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save that",
        description: errorMessage(err, "Please try again."),
      });
    }
  }

  async function handleSaveProfile() {
    const name = displayName.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Your display name can't be empty.",
      });
      return;
    }
    try {
      await updateProfile.mutateAsync({
        data: { displayName: name, avatarUrl: avatarUrl.trim() || null },
      });
      await invalidateAccount();
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't update your profile",
        description: errorMessage(err, "Please try again."),
      });
    }
  }

  function handleChangeLanguage(code: string) {
    // Reflect the choice in the running app immediately, then persist it so it
    // syncs across devices.
    setActiveLang(code);
    track(ANALYTICS_EVENTS.LANGUAGE_SELECTED, { language: code });
    // An explicit pick anywhere is a choice — retire the selection step (B1).
    void savePreferences({ activeLanguage: code, hasChosenLanguage: true });
  }

  function handleChangeTheme(next: Theme) {
    setTheme(next); // instant, app-wide
    void savePreferences({ theme: next });
  }

  async function handleDelete() {
    try {
      await deleteAccount.mutateAsync();
      queryClient.clear();
      await signOut({ redirectUrl: basePath || "/" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't delete your account",
        description: errorMessage(err, "Please try again."),
      });
    }
  }

  if (isLoading || !account) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  const reminderEnabled = notifications?.dailyReminderEnabled ?? false;
  const reminderTime = notifications?.dailyReminderTime ?? "";
  const dailyGoal = learning?.dailyGoal ?? 10;
  const goalOptions = DAILY_GOAL_OPTIONS.includes(dailyGoal)
    ? DAILY_GOAL_OPTIONS
    : [...DAILY_GOAL_OPTIONS, dailyGoal].sort((a, b) => a - b);

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-card-border bg-background/85 px-4 pt-10 pb-4 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href="/app"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-card-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Account</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-8 px-5 py-6">
        {/* Profile */}
        <Section icon={UserIcon} title="Profile" subtitle="How you appear to friends">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-card-border">
              {avatarUrl.trim() ? <AvatarImage src={avatarUrl.trim()} alt="" /> : null}
              <AvatarFallback className="bg-primary/10 text-lg font-black text-primary">
                {initialsOf(displayName || account.profile.displayName, account.profile.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-foreground">
                {account.profile.displayName || "Your name"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {account.profile.email ?? "No email on file"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              maxLength={100}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar image URL</Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
            <p className="text-xs text-muted-foreground">
              Paste a link to a photo, or leave blank to use your initials.
            </p>
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={!profileDirty || updateProfile.isPending}
            className="w-full"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save profile"
            )}
          </Button>
        </Section>

        {/* Subscription */}
        <Section
          icon={Crown}
          title="Subscription"
          subtitle="Your plan, billing and cancellation"
        >
          {hasSubscription ? (
            <Link
              href="/account/subscription"
              className="flex w-full items-center justify-between rounded-2xl border border-card-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="font-black text-foreground">{subPlanLabel}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {isPaused
                    ? "Paused — resumes automatically"
                    : isOneLanguage && chosenLangName
                      ? `Hindi + ${chosenLangName}`
                      : "Manage plan, billing & cancellation"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <Link
              href="/upgrade"
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-primary to-secondary px-4 py-3.5 text-left text-white shadow-md transition-all hover:opacity-95 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-black">Upgrade your plan</p>
                  <p className="truncate text-sm font-semibold text-white/85">
                    Unlock every language and every feature
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </Link>
          )}
        </Section>

        {/* Sign-in & security (Clerk) */}
        <Section
          icon={ShieldCheck}
          title="Sign-in & security"
          subtitle="Email, password and connected logins"
        >
          <button
            onClick={() => openUserProfile()}
            className="flex w-full items-center justify-between rounded-2xl border border-card-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Manage email & password</p>
              <p className="truncate text-sm text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress ?? account.profile.email ?? ""}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
          <p className="text-xs text-muted-foreground">
            Changes are verified securely — we'll send a code to confirm a new email.
          </p>
        </Section>

        {/* Notifications */}
        <Section
          icon={Bell}
          title="Notifications"
          subtitle="Daily reminders to keep your streak"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="reminder" className="text-base">
                Daily reminder
              </Label>
              <p className="text-sm text-muted-foreground">
                A nudge to practice each day.
              </p>
            </div>
            <Switch
              id="reminder"
              checked={reminderEnabled}
              onCheckedChange={(checked) =>
                savePreferences({
                  dailyReminderEnabled: checked,
                  // Seed a sensible default time the first time it's turned on.
                  ...(checked && !reminderTime
                    ? { dailyReminderTime: "18:00" }
                    : {}),
                })
              }
            />
          </div>

          {reminderEnabled && (
            <div className="space-y-2">
              <Label htmlFor="reminderTime">Reminder time</Label>
              <Input
                id="reminderTime"
                type="time"
                value={reminderTime}
                onChange={(e) =>
                  savePreferences({ dailyReminderTime: e.target.value || null })
                }
                className="w-40"
              />
            </div>
          )}
        </Section>

        {/* Learning preferences */}
        <Section
          icon={GraduationCap}
          title="Learning"
          subtitle="Language, goal and appearance"
        >
          <div className="space-y-2">
            <Label>Learning language</Label>
            <Select value={activeLang} onValueChange={handleChangeLanguage}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a language">
                  {activeLanguage?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedLanguages.map((lang) => {
                  const ln = nativeTextProps(lang);
                  return (
                    <SelectItem key={lang.code} value={lang.code}>
                      <span className="flex items-center gap-2">
                        {lang.name}
                        <span
                          className="text-muted-foreground"
                          style={ln.style}
                          dir={ln.dir}
                        >
                          {lang.nativeName}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Daily goal</Label>
            <Select
              value={String(dailyGoal)}
              onValueChange={(v) =>
                savePreferences({ dailyGoal: Number(v) }, "Daily goal updated")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {goalOptions.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g} phrases a day
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleChangeTheme(value)}
                    aria-pressed={active}
                    className={
                      "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-sm font-semibold transition-all " +
                      (active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-card-border bg-card text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <div className="flex items-start gap-3 py-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Map className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-muted-foreground">Timezone</p>
                <div className="mt-1">
                  <TimezoneSelect
                    value={learning?.timezone ?? detectedTz}
                    onChange={(zone) =>
                      savePreferences({ timezone: zone }, "Timezone saved")
                    }
                    disabled={updatePrefs.isPending}
                  />
                </div>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Used for daily streak. Detected: {detectedTz}
                </p>
              </div>
            </div>
          </div>

          {/* Voice picker — temporarily disabled while TTS provider is being
              evaluated. Re-enable by removing the {false && …} wrapper below. */}
          {false && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base">Voice</Label>
            </div>
            {!isPlus && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  Voice selection is a{" "}
                  <Link href="/upgrade" className="font-semibold text-primary hover:underline">
                    All-Access
                  </Link>{" "}
                  feature.
                </span>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {/* Auto option */}
              <VoiceCard
                id={null}
                name="Auto (recommended)"
                gender={null}
                description="Best voice for each language automatically."
                active={(learning?.ttsVoice ?? null) === null}
                locked={!isPlus}
                onSelect={() => savePreferences({ ttsVoice: null }, "Voice set to Auto")}
              />
              {VOICE_CATALOG.map((v) => (
                <VoiceCard
                  key={v.id}
                  id={v.id}
                  name={v.name}
                  gender={v.gender}
                  description={v.description}
                  active={learning?.ttsVoice === v.id}
                  locked={!isPlus}
                  onSelect={() => savePreferences({ ttsVoice: v.id }, `Voice set to ${v.name}`)}
                />
              ))}
            </div>
          </div>
          )}

        </Section>

        {/* Audio — every sound setting in one place. They were spread
            through Learning with Theme and Timezone between them.
            Coach voice leads because the three below it are all
            narrower cases of it. */}
        <Section
          icon={Volume2}
          title="Audio"
          subtitle="Voice, feedback and sound effects"
        >
          <div className="space-y-2">
            <div className="flex items-start gap-3 py-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Mic className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Coach voice</p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Play Bolo's spoken voice and phrase audio
                </p>
              </div>
              <Switch
                checked={coachVoiceOn}
                onCheckedChange={handleChangeCoachVoiceOn}
              />
            </div>
          </div>

          {/* Unreachable when Coach voice is off: nothing would be
              skipped, and the pairing used to leave the card in a
              coach-playing state with no audio. */}
          <div className="space-y-2">
            <div className="flex items-start gap-3 py-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MicOff className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    coachVoiceOn ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Silent mode
                </p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Skip the coach voice — read the phrase and record right away
                </p>
              </div>
              <Switch
                checked={silentMode}
                onCheckedChange={handleChangeSilentMode}
                disabled={!coachVoiceOn}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-3 py-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageCircle className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    coachVoiceOn ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Speak meaning
                </p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Say the English meaning after each phrase
                </p>
              </div>
              <Switch
                checked={meaningAudio}
                onCheckedChange={handleChangeMeaningAudio}
                disabled={!coachVoiceOn}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-3 py-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Volume2 className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    coachVoiceOn ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Spoken feedback
                </p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Read the coach's feedback aloud after each score
                </p>
              </div>
              <Switch
                checked={spokenFeedback}
                onCheckedChange={handleChangeSpokenFeedback}
                disabled={!coachVoiceOn}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-3 py-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Volume2 className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Sound effects</p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Play sounds for ticket tears and chat
                </p>
              </div>
              <Switch
                checked={soundOn}
                onCheckedChange={handleChangeSoundOn}
              />
            </div>
          </div>
        </Section>

        {/* Invite friends */}
        <Section
          icon={Gift}
          title="Invite friends"
          subtitle="Share Bolo! and earn Chai"
        >
          <ReferralCard />
        </Section>

        {/* Social */}
        <Section icon={Users} title="Social" subtitle="Friends and leaderboard">
          <Link
            href="/friends"
            className="flex w-full items-center justify-between rounded-2xl border border-card-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Friends</p>
              <p className="truncate text-sm text-muted-foreground">
                Add friends and compete on the leaderboard.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        </Section>

        {/* Contact Us */}
        <Section icon={Mail} title="Support" subtitle="Get help or send feedback">
          <Link
            href="/contact"
            className="flex w-full items-center justify-between rounded-2xl border border-card-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Contact Us</p>
              <p className="truncate text-sm text-muted-foreground">
                Send us a message — we reply within a business day.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        </Section>

        {/* Sign out */}
        <Button
          variant="outline"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="w-full"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>

        {/* Danger zone */}
        <section className="rounded-3xl border-2 border-destructive/30 bg-destructive/5 p-5">
          <h2 className="text-lg font-black text-destructive">Delete account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanently delete your account and all your progress, badges and
            friends. This can't be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4 w-full">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your account, all your learning
                  progress, badges and friendships. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteAccount.isPending}>
                  Keep my account
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete();
                  }}
                  disabled={deleteAccount.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteAccount.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Delete forever"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </main>
    </div>
  );
}

/**
 * @internal Exported for tests only — the picker section in
 * Account is temporarily unmounted while the TTS provider is being evaluated,
 * but the card's preview/cache behaviour stays covered by direct render tests.
 */
export function VoiceCard({
  id,
  name,
  gender,
  description,
  active,
  locked,
  onSelect,
}: {
  id: string | null;
  name: string;
  gender: "male" | "female" | null;
  description: string;
  active: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const [sampleState, setSampleState] = useState<"idle" | "loading" | "playing">("idle");

  async function handlePlaySample(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    // Stop whatever card is currently playing: pause its audio and reset its
    // icon back to Play. This covers both "another card" and "this card again".
    if (currentSampleAudio) {
      currentSampleAudio.pause();
      currentSampleAudio = null;
    }
    if (currentCardReset) {
      currentCardReset();
      currentCardReset = null;
    }

    // If this card was already playing the toggle-off is complete — bail.
    if (sampleState === "playing") return;

    setSampleState("loading");
    try {
      let base64 = webSampleCache[id!];
      if (!base64) {
        const res = await fetch("/api/openai/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text: VOICE_SAMPLE_TEXT, previewVoiceId: id }),
        });
        if (!res.ok) throw new Error("TTS preview failed");
        const data = (await res.json()) as { audioBase64: string; format: string };
        base64 = data.audioBase64;
        webSampleCache[id!] = base64;
      }

      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      currentSampleAudio = audio;
      // Register this card's reset so another card can revert our icon.
      currentCardReset = () => setSampleState("idle");
      setSampleState("playing");
      audio.onended = () => {
        if (currentSampleAudio === audio) { currentSampleAudio = null; currentCardReset = null; }
        setSampleState("idle");
      };
      audio.onerror = () => {
        if (currentSampleAudio === audio) { currentSampleAudio = null; currentCardReset = null; }
        setSampleState("idle");
      };
      await audio.play();
    } catch {
      setSampleState("idle");
    }
  }

  const borderClass = active
    ? "border-primary bg-primary/5"
    : locked
      ? "border-card-border bg-card opacity-60"
      : "border-card-border bg-card hover:border-primary/40 hover:bg-muted/40";

  return (
    <div className={`flex w-full items-stretch rounded-2xl border-2 transition-all ${borderClass}`}>
      {/* Selectable area */}
      <button
        onClick={locked ? undefined : onSelect}
        disabled={locked}
        aria-pressed={active}
        className="flex flex-1 items-start gap-3 p-3 text-left"
      >
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          {locked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          ) : active ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-white" />
            </div>
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-card-border" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{name}</span>
            {gender && (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs font-semibold " +
                  (gender === "female"
                    ? "bg-accent/20 text-accent"
                    : "bg-primary/10 text-primary")
                }
              >
                {gender}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </button>

      {/* Play sample button — only for named voices (Auto has no specific ID) */}
      {id && !locked && (
        <button
          type="button"
          onClick={handlePlaySample}
          disabled={sampleState === "loading"}
          aria-label={sampleState === "playing" ? "Stop sample" : "Play voice sample"}
          className="flex shrink-0 items-center justify-center rounded-r-2xl px-3 text-muted-foreground transition-colors hover:bg-primary/8 hover:text-primary disabled:opacity-50"
        >
          {sampleState === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : sampleState === "playing" ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
        </button>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-card-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-black leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
