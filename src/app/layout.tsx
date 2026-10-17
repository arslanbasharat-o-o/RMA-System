import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ClientToaster } from "@/components/theme/ClientToaster";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { SidebarProvider } from "@/context/SidebarContext";

export const metadata: Metadata = {
  title: {
    default: "RMA Operations",
    template: "%s | RMA Operations",
  },
  description: "Display intake, recognition, and return processing operations",
  icons: {
    icon: "/icon.svg",
  },
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
                  var collapsed = localStorage.getItem('rma-sidebar-collapsed');
                  if (collapsed === 'true') {
                    document.documentElement.classList.add('sidebar-collapsed');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased bg-neutral-50/80 dark:bg-[#09090b] text-neutral-900 dark:text-zinc-100 min-h-screen">
        <ThemeProvider>
          <MotionProvider>
            <SidebarProvider>
              {children}
              <ClientToaster />
            </SidebarProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
