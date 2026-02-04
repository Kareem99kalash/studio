import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Ensure you have this or standard toast

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
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
