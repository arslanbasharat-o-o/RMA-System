import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vendor Catalog",
};

export default function VendorCatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
