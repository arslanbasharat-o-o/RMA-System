"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface SidebarContextType {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

// Persistent in-memory cache to guarantee zero flash or shake across Next.js route transitions
let inMemoryCollapsed: boolean | null = null;

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("rma-sidebar-collapsed");
      if (stored !== null) {
        const val = stored === "true";
        inMemoryCollapsed = val;
        setSidebarCollapsedState(val);
      }
    } catch {
      // ignore
    }
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    inMemoryCollapsed = collapsed;
    try {
      window.localStorage.setItem("rma-sidebar-collapsed", String(collapsed));
      if (collapsed) {
        document.documentElement.classList.add("sidebar-collapsed");
      } else {
        document.documentElement.classList.remove("sidebar-collapsed");
      }
    } catch {
      // ignore
    }
    setSidebarCollapsedState(collapsed);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!inMemoryCollapsed);
  }, [setSidebarCollapsed]);

  // Keyboard shortcut: Cmd+B or Ctrl+B toggles sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only toggle if not currently typing in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar,
        setSidebarCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    return {
      sidebarCollapsed: inMemoryCollapsed ?? false,
      toggleSidebar: () => {},
      setSidebarCollapsed: () => {},
    };
  }
  return context;
}
