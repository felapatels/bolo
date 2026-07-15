import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2, CheckCircle2, Mail } from "lucide-react";
import { useUser } from "@clerk/react";
import {
  useSubmitContactForm,
  ContactFormInputCategory,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES: { value: ContactFormInputCategory; label: string }[] = [
  { value: ContactFormInputCategory.general, label: "General question" },
  { value: ContactFormInputCategory.billing, label: "Billing & subscription" },
  { value: ContactFormInputCategory.technical, label: "Technical issue" },
  { value: ContactFormInputCategory.feedback, label: "Feedback / feature request" },
  { value: ContactFormInputCategory.other, label: "Other" },
];

const MAX_MESSAGE = 2000;

export default function Contact() {
  const { user } = useUser();

  const [name, setName] = useState(
    () =>
      user?.fullName ??
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
      "",
  );
  const [email, setEmail] = useState(
    () => user?.primaryEmailAddress?.emailAddress ?? "",
  );
  const [category, setCategory] = useState<ContactFormInputCategory | "">("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useSubmitContactForm();

  function touch(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  const nameError = touched.name && !name.trim() ? "Name is required" : null;
  const emailError =
    touched.email && !email.trim()
      ? "Email is required"
      : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? "Enter a valid email address"
        : null;
  const categoryError =
    touched.category && !category ? "Please select a category" : null;
  const messageError =
    touched.message && !message.trim() ? "Message is required" : null;

  const isValid =
    !!name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !!category &&
    !!message.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, category: true, message: true });
    if (!isValid) return;

    setError(null);
    try {
      await submit.mutateAsync({
        data: { name: name.trim(), email: email.trim(), category, message },
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === "object" &&
        "data" in err &&
        err.data &&
        typeof (err.data as { error?: unknown }).error === "string"
          ? (err.data as { error: string }).error
          : "Something went wrong. Please try again.";
      setError(msg);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-card-border bg-background/85 px-4 pt-10 pb-4 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href="/account"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-card-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to account"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Contact Us
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        {success ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-card-border bg-card p-8 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground">
                Message sent!
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We've received your message and will get back to you at{" "}
                <span className="font-semibold">{email}</span>.
              </p>
            </div>
            <Link href="/account">
              <Button variant="outline" className="mt-2">
                Back to settings
              </Button>
            </Link>
          </div>
        ) : (
          <section className="rounded-3xl border border-card-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black leading-tight text-foreground">
                  Send us a message
                </h2>
                <p className="text-sm text-muted-foreground">
                  We read every message and reply within a business day.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Name</Label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => touch("name")}
                  placeholder="Your name"
                  maxLength={200}
                  aria-invalid={!!nameError}
                />
                {nameError && (
                  <p className="text-xs text-destructive">{nameError}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch("email")}
                  placeholder="you@example.com"
                  aria-invalid={!!emailError}
                />
                {emailError && (
                  <p className="text-xs text-destructive">{emailError}</p>
                )}
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="contact-category">Topic</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v as ContactFormInputCategory);
                    touch("category");
                  }}
                >
                  <SelectTrigger
                    id="contact-category"
                    aria-invalid={!!categoryError}
                  >
                    <SelectValue placeholder="Choose a topic" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoryError && (
                  <p className="text-xs text-destructive">{categoryError}</p>
                )}
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="contact-message">Message</Label>
                  <span
                    className={
                      "text-xs " +
                      (message.length > MAX_MESSAGE * 0.9
                        ? "text-destructive"
                        : "text-muted-foreground")
                    }
                  >
                    {message.length}/{MAX_MESSAGE}
                  </span>
                </div>
                <Textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onBlur={() => touch("message")}
                  placeholder="Tell us what's on your mind…"
                  maxLength={MAX_MESSAGE}
                  rows={5}
                  aria-invalid={!!messageError}
                  className="resize-none"
                />
                {messageError && (
                  <p className="text-xs text-destructive">{messageError}</p>
                )}
              </div>

              {/* Inline error banner */}
              {error && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submit.isPending}
                className="w-full"
              >
                {submit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send message"
                )}
              </Button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
