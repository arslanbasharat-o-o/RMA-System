import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Display Catalog",
};

export default function DisplayCatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
