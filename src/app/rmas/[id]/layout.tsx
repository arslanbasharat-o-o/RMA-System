import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RMA Details",
};

export default function RmaDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
