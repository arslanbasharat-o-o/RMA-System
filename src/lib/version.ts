export const APP_VERSION = {
  version: "0.01",
  releaseName: "Public main build",
  commit: process.env.NEXT_PUBLIC_APP_COMMIT || "unknown",
  branch: "main",
  buildTarget: "Docker Compose",
  releaseDate: "2026-10-10",
  environment: process.env.NODE_ENV || "unknown",
  repoName: "RMA-System",
} as const;
