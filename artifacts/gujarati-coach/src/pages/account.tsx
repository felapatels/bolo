import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
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
} from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAccount,
  getGetAccountQueryKey,
  useUpdateAccountProfile,
  useUpdateAccountPreferences,
  useDeleteAccount,
  ApiError,
  type UpdatePreferencesInput,
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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// The daily-goal presets we let learners pick from (target practice attempts a
// day). The backend accepts any integer 1–100; these are the sensible rungs.
const DAILY_GOAL_OPTIONS = [3, 5, 10, 15, 20, 30];

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

  // Device-local practice preference: whether the coach's voice is skipped
  // before recording begins. When on, the mic is available immediately.
  const [silentMode, setSilentMode] = useState(loadSilentMode);
  function handleChangeSilentMode(enabled: boolean) {
    setSilentMode(enabled);
    saveSilentMode(enabled);
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
    void savePreferences({ activeLanguage: code });
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
                    Unlock more languages and unlimited lessons
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

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="spokenFeedback" className="text-base">
                Spoken feedback
              </Label>
              <p className="text-sm text-muted-foreground">
                Read the coach's feedback aloud after each score.
              </p>
            </div>
            <Switch
              id="spokenFeedback"
              checked={spokenFeedback}
              onCheckedChange={handleChangeSpokenFeedback}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="silentMode" className="text-base">
                Silent mode
              </Label>
              <p className="text-sm text-muted-foreground">
                Skip the coach's voice and start recording immediately.
              </p>
            </div>
            <Switch
              id="silentMode"
              checked={silentMode}
              onCheckedChange={handleChangeSilentMode}
            />
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
