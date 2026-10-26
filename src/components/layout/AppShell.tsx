"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  PackageCheck,
  Users,
  Building2,
  CheckSquare,
  BarChart3,
  Settings,
  Menu,
  X,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AnimatedLogout } from "@/components/icons/AnimatedIcons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserProfileModal } from "@/components/profile/UserProfileModal";
import { APP_VERSION } from "@/lib/version";
import { PageTransition } from "@/components/motion/PageTransition";
import { useScrollLock, useEscapeKey } from "@/lib/utils/scroll-lock";
import { RmaLogo } from "@/components/brand/RmaLogo";
import { useSidebar } from "@/context/SidebarContext";

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
  { label: "Suppliers", href: "/vendor-catalog", icon: Building2 },
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
  const { sidebarCollapsed, toggleSidebar } = useSidebar();
  const [currentUser, setCurrentUser] = useState(user || null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
    <div className="flex h-screen bg-neutral-50/80 dark:bg-[#09090b] text-neutral-900 dark:text-zinc-100 overflow-hidden font-sans transition-colors duration-150">
      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div
            id="mobile-navigation-drawer"
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
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="relative w-72 bg-white dark:bg-[#121215] flex flex-col z-10 border-r border-slate-200 dark:border-zinc-800 shadow-2xl"
            >
              <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-zinc-800">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <RmaLogo size={24} variant="icon" />
                  <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                    RMA Operations
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Close navigation menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-3">
                <Link
                  href="/rmas/new"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-xs"
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
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-indigo-50 dark:bg-zinc-800/90 text-indigo-600 dark:text-white font-semibold border border-indigo-200/40 dark:border-zinc-700/60"
                          : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="p-3 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      setShowProfileModal(true);
                    }}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer flex-1 mr-2"
                  >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-slate-900 to-indigo-900 dark:from-indigo-600 dark:to-violet-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
                      {((currentUser || user)?.name || "O")
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                        {(currentUser || user)?.name || "Staff"}
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 capitalize">
                        {(currentUser || user)?.role || "operator"} · Profile
                      </p>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Sign out"
                    onClick={() => {
                      setMobileOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                    className="text-rose-600 dark:text-rose-400 shrink-0 gap-1.5"
                  >
                    <AnimatedLogout size={14} />
                    <span>Logout</span>
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setShowProfileModal(true);
                  }}
                  className="flex items-center justify-between w-full pt-1.5 border-t border-neutral-200/60 dark:border-neutral-800/60 text-[10px] font-mono text-neutral-400 cursor-pointer"
                >
                  <span>Version {APP_VERSION.version}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex ${sidebarCollapsed ? "lg:w-16" : "lg:w-64"} shrink-0 flex-col border-r border-slate-200/80 dark:border-zinc-800/90 bg-white/95 dark:bg-[#121215]/95 select-none transition-[width] duration-200 ease-in-out backdrop-blur-md`}>
        {/* Brand header */}
        <div className={`flex items-center ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-5"} h-14 border-b border-slate-200/80 dark:border-zinc-800/80`}>
          {!sidebarCollapsed ? (
            <>
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <RmaLogo size={26} variant="icon" />
                <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                  RMA Operations
                </span>
              </Link>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                aria-expanded={true}
                title="Collapse sidebar (⌘B)"
                className="rounded-md p-1.5 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              aria-expanded={false}
              title="Expand sidebar (⌘B)"
              className="rounded-md p-2 text-slate-600 hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center w-10 h-10 group"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Quick action button */}
        <div className={`p-3 ${sidebarCollapsed ? "px-2" : ""}`}>
          <Link
            href="/rmas/new"
            aria-label="Create RMA"
            title={sidebarCollapsed ? "Create RMA" : undefined}
            className="flex items-center justify-center gap-2 w-full h-8.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {!sidebarCollapsed && <span>Create RMA</span>}
          </Link>
        </div>

        {/* Navigation list */}
        <nav className={`flex-1 ${sidebarCollapsed ? "px-2" : "px-3"} py-1 space-y-0.5 overflow-y-auto`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
                className={`relative flex items-center ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-2.5"} py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "text-indigo-600 dark:text-white font-semibold"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-zinc-800/40"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="desktop-active-pill"
                    className="absolute inset-0 bg-indigo-50 dark:bg-zinc-800/90 rounded-lg border border-indigo-200/50 dark:border-zinc-700/60 shadow-2xs"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 34,
                    }}
                  />
                )}
                <div className={`relative z-10 flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"}`}>
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      active
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-slate-400 dark:text-zinc-500"
                    }`}
                  />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </div>
                {!sidebarCollapsed && item.badge ? (
                  <span className="relative z-10 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded text-[10px] font-mono shrink-0 whitespace-nowrap leading-none">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* User footer with Profile trigger and Version tracker */}
        <div className={`p-3 ${sidebarCollapsed ? "px-2" : ""} border-t border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 space-y-2`}>
          <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-2" : "justify-between gap-2"}`}>
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              aria-label="View and edit profile"
              className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5 min-w-0 flex-1 p-1 -m-1"} rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer group`}
              title="Click to view and edit profile"
            >
              <div className="h-7 w-7 rounded-md bg-gradient-to-tr from-slate-900 to-indigo-900 dark:from-indigo-600 dark:to-violet-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0 shadow-2xs">
                {((currentUser || user)?.name || "O")
                  .split(" ")
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              {!sidebarCollapsed && <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-slate-950 dark:group-hover:text-white">
                  {(currentUser || user)?.name || "Operator"}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 capitalize truncate">
                  {(currentUser || user)?.role || "operator"} · Profile
                </p>
              </div>}
            </button>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              title="Sign out of RMA system"
              aria-label="Sign out"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            >
              <AnimatedLogout size={16} />
            </button>
          </div>

          {/* App version */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} w-full pt-1.5 border-t border-slate-200/60 dark:border-zinc-800/60 text-[10px] font-mono text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors cursor-pointer`}
            title={`Version ${APP_VERSION.version}`}
          >
            <span>{sidebarCollapsed ? `v${APP_VERSION.version}` : `Version ${APP_VERSION.version}`}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-14 border-b border-slate-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/95 flex items-center justify-between px-4 sm:px-6 transition-colors backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger */}
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation-drawer"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* When collapsed on desktop, show RMA Logo with brand text */}
            {sidebarCollapsed && (
              <Link
                href="/dashboard"
                className="hidden lg:flex items-center gap-2 hover:opacity-85 transition-opacity"
                title="RMA Operations Dashboard"
              >
                <RmaLogo size={22} variant="icon" />
                <span className="font-bold text-xs tracking-tight text-slate-900 dark:text-white">
                  RMA Operations
                </span>
              </Link>
            )}

            {sidebarCollapsed && (
              <div className="hidden lg:block h-4 w-px bg-slate-200 dark:bg-zinc-800" />
            )}

            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
              <span>Operations</span>
              <span>/</span>
              <span className="text-slate-900 dark:text-white capitalize font-semibold">
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

      {/* User Profile and Account Management Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        currentUser={currentUser || user || null}
        onProfileUpdated={(updated) => {
          setCurrentUser((prev: any) => ({ ...prev, ...updated }));
        }}
        onLogout={handleLogout}
      />

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Confirm Sign Out"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4 text-center py-1">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <AnimatedLogout size={24} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Sign Out of RMA Platform?
            </h4>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 text-xs h-9 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={loggingOut}
              onClick={handleLogout}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:text-white text-xs h-9 gap-1.5 cursor-pointer"
            >
              <AnimatedLogout size={14} />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
