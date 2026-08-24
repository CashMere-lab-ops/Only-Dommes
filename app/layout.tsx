import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import IncomingCallListener from "../components/IncomingCallListener";
import OutgoingCallListener from "../components/OutgoingCallListener";
import ActiveVoiceCall from "../components/ActiveVoiceCall";
import SessionTimeout from "../components/SessionTimeout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.worldofdommes.com"),
  title: {
    default: "World Of Dommes | Premium Dominatrix Platform",
    template: "%s",
  },
  description:
    "Join World Of Dommes — the exclusive platform for Dominatrices. Go live, sell content, receive tips, and connect with fans in private sessions.",
  openGraph: {
    siteName: "World Of Dommes",
    type: "website",
    locale: "en_GB",
  },
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
        <SessionTimeout />
        <IncomingCallListener />
        <OutgoingCallListener />
        <ActiveVoiceCall />
        {children}
      </body>
    </html>
  );
}
