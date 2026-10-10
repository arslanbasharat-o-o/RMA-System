"use client";

import { Toaster } from "sonner";
import { useTheme } from "./ThemeProvider";

export function ClientToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <div id="toaster" data-sonner-toaster="true">
      <Toaster
        theme={resolvedTheme}
        position="top-right"
        richColors
        closeButton
      />
    </div>
  );
}
