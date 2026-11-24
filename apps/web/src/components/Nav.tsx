"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, LogOut, Mic, Moon, Search, Sun, Zap, type LucideIcon } from "lucide-react";
import { api, signOut, useToken, type User } from "@/lib/api";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn, Pill, Tooltip } from "@/components/ui";
import { NAV, openPalette } from "./navItems";

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
const spring = { type: "spring", stiffness: 500, damping: 40 } as const;

/** Left icon rail (1024px and up), mobile top bar and bottom bar, and the XP/streak pills. */
export function Nav() {
  const token = useToken();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  // Refresh XP and streak after each page change (activities award XP).
  useEffect(() => {
    if (!token) return;
    let live = true;
    api<{ user: User }>("/v1/me").then((r) => live && setUser(r.user)).catch(() => {});
    return () => { live = false; };
  }, [token, pathname]);

  const shownUser = token ? user : null;
  const skip = <a href="#main" className="absolute -top-16 left-3 z-[100] rounded-full bg-mint px-4 py-2 font-semibold text-on-mint focus:top-3">Skip to content</a>;

  // Signed out: a regular top navigation bar. Still checking: nothing, to avoid a flash.
  if (token === null) return <>{skip}<TopNav /></>;
  if (token === undefined) return skip;

  return (
    <>
      {skip}
      <Rail signedIn pathname={pathname} />

      {/* Mobile / tablet top bar */}
      <header className="flex items-center gap-3 px-4 pt-4 lg:hidden">
        <Link href="/" aria-label="English Coach home" className="grid size-10 place-items-center rounded-full bg-linear-to-br from-hero to-hero-2 text-mint">
          <Mic size={20} aria-hidden />
        </Link>
        <span className="font-semibold tracking-[-0.01em]">English Coach</span>
        <div className="ml-auto flex items-center gap-2">
          {shownUser && <Stats user={shownUser} />}
          <ThemeButton className="size-9 bg-surface text-fg-2 shadow-card" />
        </div>
      </header>

      {/* Desktop XP/streak, top right of the content area (Home shows them as cards) */}
      {shownUser && pathname !== "/" && (
        <div className="pointer-events-none absolute top-8 right-8 z-10 hidden lg:flex">
          <Stats user={shownUser} />
        </div>
      )}

      {token && <BottomBar pathname={pathname} />}
    </>
  );
}

const TOP_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#feedback", label: "Feedback" },
  { href: "/#games", label: "Games" },
  { href: "/#how", label: "How it works" },
];

/** Signed-out navigation: sticky glass bar across the top. */
function TopNav() {
  return (
    <header className="sticky top-3 z-40 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 rounded-full border border-line bg-surface/80 pr-2 pl-3 shadow-card backdrop-blur-xl sm:pl-4">
        <Link href="/" aria-label="English Coach home" className="group flex items-center gap-2.5 font-semibold tracking-[-0.01em]">
          <span className="grid size-10 place-items-center rounded-full bg-linear-to-br from-hero to-hero-2 text-mint transition duration-300 group-hover:scale-110 group-hover:-rotate-12">
            <Mic size={20} aria-hidden />
          </span>
          <span className="hidden sm:inline">English Coach</span>
        </Link>
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 md:flex">
          {TOP_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="group relative rounded-full px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:text-fg">
              {l.label}
              <span aria-hidden className="absolute inset-x-4 bottom-1 h-0.5 origin-left scale-x-0 rounded-full bg-mint-hover transition-transform duration-300 ease-out group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeButton className="size-10 bg-raised text-fg-2 hover:text-fg" />
          <Link href="/#signin" className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-fg transition-colors hover:bg-raised sm:inline-flex">Sign in</Link>
          <Link href="/#signin" className="inline-flex h-11 items-center gap-2 rounded-full bg-mint px-5 text-sm font-semibold text-on-mint transition hover:-translate-y-px hover:bg-mint-hover active:scale-[0.97]">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Stats({ user }: { user: User }) {
  return (
    <div className="flex gap-2">
      <span aria-label={`${user.xp} XP`}><Pill tone="neutral" icon={Zap} className="bg-surface shadow-card">{user.xp}</Pill></span>
      <span aria-label={`${user.streak} day streak`}><Pill tone="coral" icon={Flame}>{user.streak}</Pill></span>
    </div>
  );
}

function ThemeButton({ className }: { className?: string }) {
  const theme = useTheme();
  const Icon = theme === "night" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "night" ? "Switch to day mode" : "Switch to night mode"}
      className={cn("grid cursor-pointer place-items-center rounded-full transition active:scale-[0.97]", className)}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}

function RailButton({ icon: I, label, active, href, onClick, layoutId }: { icon: LucideIcon; label: string; active?: boolean; href?: string; onClick?: () => void; layoutId?: string }) {
  const inner = (
    <>
      {active && (
        <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 rounded-full bg-mint shadow-[0_6px_20px_rgb(126_232_181/0.35)]">
          <span className="absolute top-1/2 -right-1.5 h-5 w-1 -translate-y-1/2 rounded-full bg-mint" />
        </motion.span>
      )}
      <I size={20} aria-hidden className="relative" />
    </>
  );
  const cls = cn(
    "relative grid size-11 cursor-pointer place-items-center rounded-full transition-colors duration-150",
    active ? "text-on-mint" : "text-on-dark-2 hover:bg-white/10 hover:text-on-dark",
  );
  return (
    <Tooltip label={label}>
      {href ? (
        <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
      ) : (
        <button type="button" aria-label={label} onClick={onClick} className={cls}>{inner}</button>
      )}
    </Tooltip>
  );
}

function Rail({ signedIn, pathname }: { signedIn: boolean; pathname: string }) {
  const theme = useTheme();
  return (
    <aside className="sticky top-10 z-30 hidden min-h-[calc(100dvh-80px)] w-14 shrink-0 flex-col items-center rounded-rail bg-linear-to-b from-[var(--rail-from)] to-[var(--rail-to)] py-3 shadow-card lg:flex">
      <Link href="/" aria-label="English Coach home" className="mb-3 grid size-11 shrink-0 place-items-center rounded-full text-mint">
        <Mic size={24} strokeWidth={2.4} aria-hidden />
      </Link>
      {signedIn && (
        <nav aria-label="Main" className="flex w-full flex-1 flex-col items-center gap-1 [@media(max-height:760px)]:gap-0">
          {NAV.filter((n) => n.rail).map((n) => (
            <RailButton key={n.href} icon={n.icon} label={n.label} href={n.href} active={isActive(pathname, n.href)} layoutId="rail-active" />
          ))}
        </nav>
      )}
      <div className="mt-auto flex shrink-0 flex-col items-center gap-1 pt-2">
        <span aria-hidden className="mb-1 h-px w-7 bg-white/10" />
        {signedIn && <RailButton icon={Search} label="Search (Ctrl K)" onClick={openPalette} />}
        <RailButton icon={theme === "night" ? Sun : Moon} label={theme === "night" ? "Day mode" : "Night mode"} onClick={toggleTheme} />
        {signedIn && <RailButton icon={LogOut} label="Sign out" onClick={() => signOut()} />}
      </div>
    </aside>
  );
}

function BottomBar({ pathname }: { pathname: string }) {
  const items = NAV.filter((n) => n.bar);
  return (
    <nav aria-label="Main" className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 grid h-16 grid-cols-5 rounded-full bg-linear-to-b from-[var(--rail-from)] to-[var(--rail-to)] px-1.5 shadow-pop lg:hidden">
      {items.map((n) => {
        const on = isActive(pathname, n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cn("relative flex flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-medium", on ? "text-on-mint" : "text-on-dark-2")}>
            {on && <motion.span layoutId="bar-active" transition={spring} className="absolute inset-y-1.5 inset-x-0.5 rounded-full bg-mint" />}
            <n.icon size={20} aria-hidden className="relative" />
            <span className="relative">{n.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={openPalette} className="flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-medium text-on-dark-2">
        <Search size={20} aria-hidden />
        More
      </button>
    </nav>
  );
}
