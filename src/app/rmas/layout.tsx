import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "RMA Shipments",
    template: "%s | RMA Operations",
  },
};

export default function RmasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
