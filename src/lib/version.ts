import release from "../../release.json";

// Managed in GitHub: each build reads the version from the deployed source.
export const APP_VERSION = {
  version: release.version,
  commit: process.env.NEXT_PUBLIC_APP_COMMIT || "unknown",
} as const;
