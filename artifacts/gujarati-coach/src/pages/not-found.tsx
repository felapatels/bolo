import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="text-[120px] font-black text-primary leading-none tracking-tighter mb-4">
        404
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-2">Oops! Lost in translation.</h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        We couldn't find the page you're looking for. Let's get you back to practicing.
      </p>
      <Link 
        href="/"
        className="bg-primary text-primary-foreground font-bold text-lg py-4 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
      >
        <Home className="w-5 h-5" />
        <span>Go Home</span>
      </Link>
    </div>
  );
}
