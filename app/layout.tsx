import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrderHub",
  description:
    "A miniature omnichannel order hub — product/stock/order core, two mock marketplace connectors, and an admin dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
