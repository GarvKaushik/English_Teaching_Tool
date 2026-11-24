"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, CornerDownLeft, LogOut, Moon, Search, Sun, type LucideIcon } from "lucide-react";
import { signOut, useToken } from "@/lib/api";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn } from "@/components/ui";
import { NAV, OPEN_PALETTE } from "./navItems";

type Entry = { id: string; group: "Go to" | "Actions"; title: string; hint: string; icon: LucideIcon; key?: string; here?: boolean; run: () => void };

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md bg-raised px-1.5 font-sans text-[0.6875rem] font-semibold text-fg-2">{children}</kbd>
);

/** Ctrl/Cmd+K: jump to any page or run an action. */
export function CommandPalette() {
  const token = useToken();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const show = () => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setIndex(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    returnFocus.current?.focus?.();
  };

  useEffect(() => {
    if (!token) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close(); else show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE, show);
    };
  });

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = NAV.map((n, i) => ({
      id: n.href, group: "Go to", title: n.label, hint: n.hint, icon: n.icon, key: i < 9 ? String(i + 1) : undefined,
      here: n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
      run: () => router.push(n.href),
    }));
    const actions: Entry[] = [
      { id: "theme", group: "Actions", title: theme === "night" ? "Switch to day mode" : "Switch to night mode", hint: "Appearance", icon: theme === "night" ? Sun : Moon, run: toggleTheme },
      { id: "signout", group: "Actions", title: "Sign out", hint: "Leave this device", icon: LogOut, run: () => signOut() },
    ];
    const q = query.trim().toLowerCase();
    const all = [...pages, ...actions];
    return q ? all.filter((e) => `${e.title} ${e.hint}`.toLowerCase().includes(q)) : all;
  }, [query, pathname, router, theme]);

  const pick = (e: Entry | undefined) => {
    if (!e) return;
    close();
    e.run();
  };

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => (i + 1) % Math.max(1, entries.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (i - 1 + entries.length) % Math.max(1, entries.length)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(entries[index]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); } // keep focus inside the dialog
    else if (!query && /^[1-9]$/.test(e.key)) {
      const hit = entries.find((x) => x.key === e.key);
      if (hit) { e.preventDefault(); pick(hit); }
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [index, listId]);

  if (!token) return null;
  let lastGroup = "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          className="fixed inset-0 z-[80] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[12vh] backdrop-blur-[12px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label="Search pages and actions"
            className="flex max-h-[70vh] w-full max-w-[540px] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop backdrop-blur-2xl"
            initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Search size={18} aria-hidden className="text-fg-2" />
              <input
                ref={inputRef} autoFocus
                role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
                aria-activedescendant={entries[index] ? `${listId}-${index}` : undefined}
                aria-label="Jump to a page or run an action"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
                onKeyDown={onInputKey}
                placeholder="Jump to a page or run an action…"
                className="h-8 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-fg outline-none placeholder:text-fg-3"
              />
              <Key>esc</Key>
            </div>

            <ul id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
              {entries.length === 0 && <li className="px-3 py-8 text-center text-sm text-fg-2">No matches for “{query}”.</li>}
              {entries.map((e, i) => {
                const header = e.group !== lastGroup ? (lastGroup = e.group) : null;
                const on = i === index;
                return (
                  <li key={e.id} role="presentation">
                    {header && <p className="px-3 pt-3 pb-1.5 text-xs font-medium text-fg-3">{header}</p>}
                    <div
                      id={`${listId}-${i}`} role="option" aria-selected={on}
                      onMouseMove={() => setIndex(i)} onClick={() => pick(e)}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-tile px-3 py-2.5 transition-colors", on && "bg-mint/25")}
                    >
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", on ? "bg-mint text-on-mint" : "bg-raised text-fg-2")}>
                        <e.icon size={17} aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-fg">{e.title}</span>
                        <span className="truncate text-xs text-fg-2">{e.hint}</span>
                      </span>
                      {e.here && <span className="rounded-full bg-mint px-2 py-0.5 text-[0.6875rem] font-semibold text-on-mint">Here</span>}
                      {e.key && <Key>{e.key}</Key>}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-4 border-t border-line px-5 py-3 text-xs text-fg-2">
              <span className="flex items-center gap-1.5"><Key><ArrowUp size={12} aria-hidden /></Key><Key><ArrowDown size={12} aria-hidden /></Key>move</span>
              <span className="flex items-center gap-1.5"><Key><CornerDownLeft size={12} aria-hidden /></Key>open</span>
              <span className="ml-auto flex items-center gap-1.5"><Key>Ctrl K</Key>toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
