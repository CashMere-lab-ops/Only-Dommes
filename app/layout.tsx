import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import IncomingCallListener from "../components/IncomingCallListener";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "World Of Dommes | Premium Dominatrix Platform",
  description:
    "Join World Of Dommes — the exclusive platform for Dominatrices. Go live, sell content, receive tips, and connect with fans in private sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <IncomingCallListener />
        {children}
      </body>
    </html>
  );
}