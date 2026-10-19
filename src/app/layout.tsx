import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { themeBootstrapScript } from "@/components/theme";
import { Providers } from "@/components/providers";
import "./globals.css";

/**
 * The display face, used by the wordmark and nothing else. `next/font` self-hosts
 * it, so there is no request to Google at runtime and no layout shift; the
 * fallback stack matters anyway, because the variable is what a component reads.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
  variable: "--font-display",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "Kraken", template: "%s · Kraken" },
  description: "Project management and billing for independent developers.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
        <Toaster
          position="bottom-right"
          gap={8}
          toastOptions={{
            className:
              "!bg-[var(--bg-raised)] !text-[var(--text-primary)] !border !border-[var(--border-default)] !shadow-[var(--shadow-menu)] !rounded-[var(--radius-lg)] !text-xs",
          }}
        />
      </body>
    </html>
  );
}
