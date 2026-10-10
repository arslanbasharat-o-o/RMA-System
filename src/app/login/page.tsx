"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        setError(data.error || "Authentication failed.");
        toast.error(data.error || "Invalid credentials.");
        return;
      }

      toast.success("Signed in successfully.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network or server connection error.");
      toast.error("Failed to connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4 font-sans relative transition-colors duration-200">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-10 w-10 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 items-center justify-center font-bold text-base mb-3 shadow-xs">
            R
          </div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            RMA Identification Platform
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Internal Operations Portal (Authorized Access Only)
          </p>
        </div>

        <Card className="border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base text-neutral-900 dark:text-neutral-100">Sign In</CardTitle>
            <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
              Enter your corporate credentials to access the RMA scanner.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Password
                  </label>
                </div>
                <Input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                className="w-full mt-2"
              >
                <span>Sign In to Platform</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500 text-center">
              Internal operations portal. Authorized staff access only.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
