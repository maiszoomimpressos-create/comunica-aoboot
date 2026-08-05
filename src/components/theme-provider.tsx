"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps next-themes so dark mode is class-based (`.dark` on <html>), matching
 * the shadcn/ui tokens in globals.css. The platform is dark-mode-first: new
 * visitors without a stored preference land on dark, but the system theme and
 * a manual toggle are both respected once set.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
