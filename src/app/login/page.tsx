"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CardSpotlight, ShimmerButton } from "@/components/premium";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { BlurIn } from "@/components/ui/blur-in";
import { RmaLogo } from "@/components/brand/RmaLogo";
import {
  AnimatedShield,
  AnimatedLock,
  AnimatedMail,
  AnimatedKey,
  AnimatedEye,
  AnimatedArrowRight,
} from "@/components/icons/AnimatedIcons";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<"login" | "forgot_password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Unable to sign in.");
        toast.error(data.error || "Incorrect email or password.");
        return;
      }

      toast.success("Signed in successfully.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to connect to server. Please try again.");
      toast.error("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50/80 dark:bg-[#09090b] p-4 font-sans relative overflow-hidden transition-colors duration-200">
      {/* Ambient background glow (Aceternity style) */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[600px] rounded-full bg-gradient-to-b from-indigo-500/10 via-indigo-500/5 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm relative z-10 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2.5">
          <div className="flex justify-center">
            <RmaLogo size={46} variant="icon" />
          </div>
          <BlurIn
            word="RMA Operations"
            duration={0.24}
            className="text-2xl md:text-2xl md:leading-8 font-bold tracking-tight text-slate-900 dark:text-slate-50"
          />
        </div>

        {/* Card with Animated Views */}
        <CardSpotlight
          className="p-6 sm:p-7 border-slate-200/90 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 shadow-xl backdrop-blur-md relative"
          spotlightColor="rgba(99, 102, 241, 0.08)"
        >
          <AnimatePresence mode="wait">
            {view === "login" && (
              <motion.div
                key="login-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <div className="mb-5 pb-3 border-b border-neutral-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Sign in to your account
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0 whitespace-nowrap leading-none">
                    <AnimatedShield size={13} />
                    Secure
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Input
                        id="login-email"
                        type="email"
                        required
                        placeholder="operator@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="h-10 text-xs pl-8.5"
                      />
                      <div className="absolute left-2.5 top-2.5 text-neutral-400 dark:text-zinc-500 pointer-events-none">
                        <AnimatedMail size={16} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setView("forgot_password");
                        }}
                        className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        className="h-10 text-xs pl-8.5 pr-9"
                      />
                      <div className="absolute left-2.5 top-2.5 text-neutral-400 dark:text-zinc-500 pointer-events-none">
                        <AnimatedLock size={16} unlocked={showPassword} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-0.5 rounded cursor-pointer transition-colors"
                      >
                        <AnimatedEye size={17} visible={showPassword} />
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <div className="pt-2">
                    <ShimmerButton
                      type="submit"
                      disabled={loading}
                      className="w-full h-10 text-xs font-semibold gap-2"
                    >
                      {loading ? (
                        <LoadingIcon className="size-3.5" />
                      ) : (
                        <AnimatedLock size={15} unlocked={false} />
                      )}
                      <span>{loading ? "Signing in…" : "Sign In"}</span>
                      {!loading && <AnimatedArrowRight size={15} />}
                    </ShimmerButton>
                  </div>
                </form>

              </motion.div>
            )}

            {view === "forgot_password" && (
              <motion.div
                key="forgot-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <div className="mb-4 pb-3 border-b border-neutral-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/50 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <AnimatedKey size={16} />
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Reset Password
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView("login")}
                    className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back
                  </button>
                </div>

                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400 mb-5">
                  Contact your team administrator to reset your password. For account security, password changes are managed by your administrator.
                </p>
                <ShimmerButton type="button" onClick={() => setView("login")} className="w-full min-h-11">
                  <span>Back to Sign In</span>
                  <AnimatedArrowRight size={15} />
                </ShimmerButton>
              </motion.div>
            )}

          </AnimatePresence>
        </CardSpotlight>
      </div>
    </div>
  );
}
