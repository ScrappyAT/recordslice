import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Records",
};

// The mandatory App Router wrapper - not the signed-in shell. It has no
// auth logic and no navigation; every route, signed in or not, renders
// through here. The shell that gates access lives at app/invoices/layout.tsx.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
