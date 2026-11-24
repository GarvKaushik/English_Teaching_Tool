"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useToken } from "@/lib/api";
import { Nav } from "./Nav";
import { CommandPalette } from "./CommandPalette";

/** The big rounded app container: rail on the left (1024px+), content on the right. */
export function Shell({ children }: { children: ReactNode }) {
  const signedOut = useToken() === null;
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={
          signedOut
            ? "relative flex min-h-dvh flex-1 flex-col" // landing: top bar, full width
            : "relative flex min-h-dvh flex-1 flex-col lg:m-6 lg:min-h-[calc(100dvh-48px)] lg:flex-row lg:items-start lg:gap-4 lg:rounded-shell lg:border lg:border-[var(--shell-border)] lg:bg-[var(--shell)] lg:p-4 lg:backdrop-blur-xl"
        }
      >
        <Nav />
        <div id="main" tabIndex={-1} className={signedOut ? "flex min-w-0 flex-1 flex-col outline-none" : "flex min-w-0 flex-1 flex-col self-stretch pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] outline-none lg:pb-0"}>
          {children}
        </div>
      </div>
      <CommandPalette />
    </MotionConfig>
  );
}
