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
      {/* 🛑 FIX: Added suppressHydrationWarning to body. 
         This tells React to ignore attributes added by browser extensions 
         (like Grammarly, LastPass, etc.) to prevent the hydration error.
      */}
      <body className={inter.className} suppressHydrationWarning={true}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
