import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/* Same type pairing as the clinic app so both products read as one family. */
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans-stack" });
const display = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-display-stack", axes: ["SOFT", "WONK"] });

export const metadata: Metadata = {
  title: "Dental Platform Console",
  description: "Onboard and monitor every clinic on the platform.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#266b49",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster
          richColors
          position="top-right"
          closeButton
          toastOptions={{ style: { borderRadius: "0.875rem", fontFamily: "var(--font-sans)" } }}
        />
      </body>
    </html>
  );
}
