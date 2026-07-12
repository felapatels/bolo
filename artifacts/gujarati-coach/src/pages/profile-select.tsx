import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListProfiles,
  useCreateProfile,
  useVerifyPin,
  getListProfilesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Plus, ArrowLeft, Delete } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useProfile, type ActiveProfile } from "@/lib/profile";

const COLORS = [
  "#F5871F",
  "#2A9D8F",
  "#E63946",
  "#9B5DE5",
  "#3A86FF",
  "#F15BB5",
  "#06D6A0",
  "#FFB703",
];

type ProfileCard = {
  id: number;
  name: string;
  color: string;
  avatar: string;
  hasPin: boolean;
};

export default function ProfileSelect() {
  const { data: profiles, isLoading } = useListProfiles();
  const { setProfile } = useProfile();
  const [, navigate] = useLocation();

  const [view, setView] = useState<"grid" | "pin" | "add">("grid");
  const [pending, setPending] = useState<ProfileCard | null>(null);

  const enter = (p: ProfileCard) => {
    const active: ActiveProfile = {
      id: p.id,
      name: p.name,
      color: p.color,
      avatar: p.avatar,
    };
    setProfile(active);
    navigate("/");
  };

  const onPick = (p: ProfileCard) => {
    if (p.hasPin) {
      setPending(p);
      setView("pin");
    } else {
      enter(p);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <AnimatePresence mode="wait">
        {view === "grid" && (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col px-6 pt-16 pb-10"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black text-foreground mb-2">Who's practicing?</h1>
              <p className="text-muted-foreground text-lg font-medium">Tap your name to start.</p>
            </div>

            <div className="grid grid-cols-2 gap-5 max-w-md mx-auto w-full">
              {profiles?.map((p, i) => (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onPick(p)}
                  className="flex flex-col items-center gap-3 group"
                >
                  <div
                    className="relative w-28 h-28 rounded-3xl flex items-center justify-center text-white text-5xl font-black shadow-[0_6px_0_rgba(0,0,0,0.15)] group-active:translate-y-1.5 group-active:shadow-[0_0px_0_rgba(0,0,0,0.15)] transition-all"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.avatar}
                    {p.hasPin && (
                      <div className="absolute -bottom-2 -right-2 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-md border border-card-border">
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-lg text-foreground">{p.name}</span>
                </motion.button>
              ))}

              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (profiles?.length ?? 0) * 0.05 }}
                onClick={() => setView("add")}
                className="flex flex-col items-center gap-3 group"
              >
                <div className="w-28 h-28 rounded-3xl flex items-center justify-center border-4 border-dashed border-border text-muted-foreground group-active:scale-95 transition-all">
                  <Plus className="w-12 h-12" />
                </div>
                <span className="font-bold text-lg text-muted-foreground">Add kid</span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {view === "pin" && pending && (
          <PinEntry
            key="pin"
            profile={pending}
            onBack={() => {
              setPending(null);
              setView("grid");
            }}
            onSuccess={() => enter(pending)}
          />
        )}

        {view === "add" && (
          <AddProfile
            key="add"
            onBack={() => setView("grid")}
            onCreated={(p) => enter(p)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PinEntry({
  profile,
  onBack,
  onSuccess,
}: {
  profile: ProfileCard;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const verify = useVerifyPin();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = async (value: string) => {
    try {
      const res = await verify.mutateAsync({
        id: profile.id,
        data: { pin: value },
      });
      if (res.valid) {
        onSuccess();
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 700);
      }
    } catch {
      setError(true);
      setTimeout(() => {
        setPin("");
        setError(false);
      }, 700);
    }
  };

  const press = (digit: string) => {
    if (pin.length >= 4 || verify.isPending) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) submit(next);
  };

  const backspace = () => setPin((p) => p.slice(0, -1));

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex-1 flex flex-col px-6 pt-12 pb-10"
    >
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-8 h-8" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-black mb-4"
          style={{ backgroundColor: profile.color }}
        >
          {profile.avatar}
        </div>
        <h2 className="text-2xl font-black text-foreground mb-1">Hi {profile.name}!</h2>
        <p className="text-muted-foreground font-medium mb-8">Enter your PIN</p>

        <motion.div
          animate={error ? { x: [-8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex gap-4 mb-10"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-colors",
                error
                  ? "border-destructive bg-destructive"
                  : pin.length > i
                    ? "border-primary bg-primary"
                    : "border-border",
              )}
            />
          ))}
        </motion.div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="h-16 rounded-2xl bg-white border border-card-border text-2xl font-black text-foreground shadow-sm active:scale-95 transition-all"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => press("0")}
            className="h-16 rounded-2xl bg-white border border-card-border text-2xl font-black text-foreground shadow-sm active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={backspace}
            className="h-16 rounded-2xl flex items-center justify-center text-muted-foreground active:scale-95 transition-all"
          >
            <Delete className="w-7 h-7" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AddProfile({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (p: ProfileCard) => void;
}) {
  const create = useCreateProfile();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState("");

  const canSave =
    name.trim().length > 0 && (!usePin || /^[0-9]{4}$/.test(pin)) && !create.isPending;

  const save = async () => {
    if (!canSave) return;
    const trimmed = name.trim();
    const created = await create.mutateAsync({
      data: {
        name: trimmed,
        color,
        avatar: trimmed.charAt(0).toUpperCase(),
        pin: usePin ? pin : null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
    onCreated(created);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex-1 flex flex-col px-6 pt-12 pb-10"
    >
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-8 h-8" />
      </button>

      <h2 className="text-3xl font-black text-foreground mb-8">Add a kid</h2>

      <div className="flex justify-center mb-8">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center text-white text-4xl font-black shadow-lg transition-colors"
          style={{ backgroundColor: color }}
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      </div>

      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 20))}
        placeholder="Type a name"
        className="w-full bg-white border-2 border-border rounded-2xl px-4 py-4 text-lg font-bold text-foreground focus:border-primary focus:outline-none mb-6"
      />

      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
        Pick a color
      </label>
      <div className="flex flex-wrap gap-3 mb-6">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              "w-12 h-12 rounded-full transition-transform",
              color === c ? "ring-4 ring-offset-2 ring-foreground/30 scale-110" : "active:scale-95",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <button
        onClick={() => setUsePin((v) => !v)}
        className="flex items-center justify-between w-full bg-white border-2 border-border rounded-2xl px-4 py-4 mb-4"
      >
        <span className="font-bold text-foreground">Protect with a PIN</span>
        <div
          className={cn(
            "w-12 h-7 rounded-full p-1 transition-colors",
            usePin ? "bg-primary" : "bg-muted",
          )}
        >
          <div
            className={cn(
              "w-5 h-5 rounded-full bg-white transition-transform",
              usePin ? "translate-x-5" : "translate-x-0",
            )}
          />
        </div>
      </button>

      {usePin && (
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder="4-digit PIN"
          className="w-full bg-white border-2 border-border rounded-2xl px-4 py-4 text-lg font-bold tracking-[0.5em] text-center text-foreground focus:border-primary focus:outline-none mb-4"
        />
      )}

      <div className="mt-auto pt-6">
        <button
          onClick={save}
          disabled={!canSave}
          className="w-full bg-primary text-primary-foreground font-black text-xl py-5 rounded-2xl flex items-center justify-center shadow-[0_8px_0_hsl(27,100%,45%)] active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all disabled:opacity-40 disabled:shadow-none"
        >
          {create.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Create Profile"}
        </button>
      </div>
    </motion.div>
  );
}
