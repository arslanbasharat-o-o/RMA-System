import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function CaptureLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-neutral-950">{children}</div>;
}
