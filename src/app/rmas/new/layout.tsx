import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New RMA",
};

export default function NewRmaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
