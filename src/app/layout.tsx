import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ClientToaster } from "@/components/theme/ClientToaster";
import { MotionProvider } from "@/components/motion/MotionProvider";

export const metadata: Metadata = {
  title: "RMA Display Identification Platform",
  description: "Enterprise RMA display intake, identification, and verification platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('rma-theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (stored === 'dark' || (!stored && prefersDark) || (stored === 'system' && prefersDark)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased bg-[#fbfbfb] dark:bg-[#0a0a0c] text-neutral-900 dark:text-neutral-100 min-h-screen">
        <ThemeProvider>
          <MotionProvider>
            {children}
            <ClientToaster />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
