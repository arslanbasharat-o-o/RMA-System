"use client";

/** Display the environment selected at build time; this component does not switch databases. */
export function EnvironmentBadge() {
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <span
      aria-label={`Environment: ${isProduction ? "production" : "development"}`}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase ${
        isProduction
          ? "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      }`}
    >
      {isProduction ? "PROD" : "DEV"}
    </span>
  );
}
