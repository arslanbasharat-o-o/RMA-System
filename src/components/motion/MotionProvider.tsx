"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { MotionConfig, LayoutGroup } from "motion/react";

interface MotionContextType {
  reducedMotion: boolean;
  setReducedMotion: (reduced: boolean) => void;
}

const MotionContext = createContext<MotionContextType>({
  reducedMotion: false,
  setReducedMotion: () => {},
});

export function useMotionPreference() {
  return useContext(MotionContext);
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage preference safely
    try {
      const stored = localStorage.getItem("rma-reduced-motion");
      if (stored !== null) {
        setReducedMotionState(stored === "true");
        return;
      }
    } catch {
      // Storage restricted / private mode
    }

    // Default to system prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotionState(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        try {
          const customStored = localStorage.getItem("rma-reduced-motion");
          if (customStored === null) {
            setReducedMotionState(e.matches);
          }
        } catch {
          setReducedMotionState(e.matches);
        }
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  const setReducedMotion = (reduced: boolean) => {
    setReducedMotionState(reduced);
    try {
      localStorage.setItem("rma-reduced-motion", String(reduced));
    } catch {
      // ignore
    }
  };

  return (
    <MotionContext.Provider value={{ reducedMotion, setReducedMotion }}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
        <LayoutGroup id="rma-motion">
          {children}
        </LayoutGroup>
      </MotionConfig>
    </MotionContext.Provider>
  );
}
