import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GeoCoverage",
  description: "Logistics Coverage Analysis Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* 1. suppressHydrationWarning: Fixes browser extension errors.
        2. min-h-screen: Ensures the background covers the full page.
        3. antialiased: Makes fonts look sharper (standard for dashboards).
      */}
      <body 
        className={`${inter.className} min-h-screen bg-background antialiased`} 
        suppressHydrationWarning={true}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}