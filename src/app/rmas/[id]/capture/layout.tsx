import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scan Screens",
};

export default function CaptureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
