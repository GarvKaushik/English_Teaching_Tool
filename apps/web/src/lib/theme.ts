"use client";

import { useSyncExternalStore } from "react";

export type Theme = "day" | "night";

const EVENT = "themechange";

/** Runs before paint (inlined in <head>) so a saved Night theme never flashes Day. */
export const themeBootScript =
  "try{if(localStorage.getItem('theme')==='night')document.documentElement.dataset.theme='night'}catch(e){}";

const read = (): Theme => (document.documentElement.dataset.theme === "night" ? "night" : "day");

export function setTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.add("theme-anim");
  html.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch {}
  window.dispatchEvent(new Event(EVENT));
  window.setTimeout(() => html.classList.remove("theme-anim"), 350);
}

export const toggleTheme = () => setTheme(read() === "night" ? "day" : "night");

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); },
    read,
    () => "day",
  );
}
