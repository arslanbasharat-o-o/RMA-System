"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  PackageCheck,
  Users,
  Smartphone,
  Building2,
  CheckSquare,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PageTransition } from "@/components/motion/PageTransition";
import { useScrollLock, useEscapeKey } from "@/lib/utils/scroll-lock";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "RMAs", href: "/rmas", icon: PackageCheck },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Display Catalog", href: "/display-catalog", icon: Smartphone },
  { label: "Vendor Catalog", href: "/vendor-catalog", icon: Building2 },
  { label: "Review Queue", href: "/review-queue", icon: CheckSquare },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: { name: string; email: string; role: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(user || null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Fetch current user and verify authentication
  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data?.authenticated && data?.user) {
            setCurrentUser(data.user);
          }
        }
      } catch {
        // ignore network error
      }
    }
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // Mobile drawer scroll locking and escape key dismissal
  useScrollLock(mobileOpen);
  useEscapeKey(closeMobile, mobileOpen);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#fbfbfb] dark:bg-[#0a0a0c] text-neutral-900 dark:text-neutral-100 overflow-hidden font-sans transition-colors duration-150">
      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
            className="fixed inset-0 z-50 flex lg:hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="relative w-72 bg-white dark:bg-[#121215] flex flex-col z-10 border-r border-neutral-200 dark:border-neutral-800 shadow-2xl"
            >
              <div className="flex items-center justify-between h-14 px-4 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-neutral-900 dark:bg-white flex items-center justify-center text-white dark:text-neutral-900 font-semibold text-xs">
                    R
                  </div>
                  <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                    RMA Platform
                  </span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-3">
                <Link
                  href="/rmas/new"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full h-9 px-3 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create RMA</span>
                </Link>
              </div>

              <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        active
                          ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-950 dark:text-white font-semibold"
                          : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/40">
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                    {(currentUser || user)?.name || "Staff"}
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 capitalize">
                    {(currentUser || user)?.role || "operator"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Sign out"
                  onClick={handleLogout}
                  loading={loggingOut}
                >
                  Logout
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 flex-col border-r border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215] select-none transition-colors">
        {/* Brand header */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-neutral-200/80 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded bg-neutral-900 dark:bg-white flex items-center justify-center text-white dark:text-neutral-900 font-semibold text-xs tracking-wider">
              R
            </div>
            <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-white">
              RMA Platform
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
            {process.env.NODE_ENV === "production" ? "PROD" : "DEV"}
          </Badge>
        </div>

        {/* Quick action button */}
        <div className="p-3">
          <Link
            href="/rmas/new"
            className="flex items-center justify-center gap-2 w-full h-8 px-3 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create RMA</span>
          </Link>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "text-neutral-950 dark:text-white font-semibold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-850/60"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="desktop-active-pill"
                    className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 rounded-md"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 34,
                    }}
                  />
                )}
                <div className="relative z-10 flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      active
                        ? "text-neutral-950 dark:text-white"
                        : "text-neutral-400 dark:text-neutral-500"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge ? (
                  <span className="relative z-10 px-1.5 py-0.2 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded text-[10px] font-mono">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                {(currentUser || user)?.name || "Operator"}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 capitalize">
                {(currentUser || user)?.role || "operator"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-14 border-b border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121215] flex items-center justify-between px-4 sm:px-6 transition-colors">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Toggle navigation menu"
              className="lg:hidden p-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <span>Operations</span>
              <span>/</span>
              <span className="text-neutral-900 dark:text-white capitalize font-semibold">
                {pathname.split("/")[1] || "Dashboard"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full min-w-0">
            <PageTransition className="w-full min-w-0" key={pathname}>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
