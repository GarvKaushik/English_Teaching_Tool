import { AudioLines, BriefcaseBusiness, House, LayoutGrid, Link2, ListChecks, MessagesSquare, Sparkles, Target, Timer, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon; rail: boolean; bar: boolean };

/** Every page, in one list: the rail, the bottom bar and the command palette read from it. */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", hint: "Your progress and practice", icon: House, rail: true, bar: true },
  { href: "/roleplay", label: "Role-play", hint: "Talk with an AI partner", icon: MessagesSquare, rail: true, bar: true },
  { href: "/interview", label: "Interview", hint: "Practise from your resume", icon: BriefcaseBusiness, rail: true, bar: false },
  { href: "/jam", label: "JAM", hint: "Speak for one minute", icon: Timer, rail: true, bar: true },
  { href: "/daily-word", label: "Daily Word", hint: "Today's five-letter word", icon: LayoutGrid, rail: true, bar: true },
  { href: "/word-chain", label: "Word Chain", hint: "Last letter, next word", icon: Link2, rail: true, bar: false },
  { href: "/tongue-twister", label: "Tongue Twister", hint: "Say it clearly and quickly", icon: AudioLines, rail: true, bar: false },
  { href: "/quiz", label: "MCQ Quiz", hint: "Grammar and vocabulary", icon: ListChecks, rail: true, bar: false },
  { href: "/placement", label: "Placement Test", hint: "Find your level", icon: Target, rail: false, bar: false },
  { href: "/plans", label: "Plans", hint: "Upgrade and speaking time", icon: Sparkles, rail: true, bar: false },
];

export const OPEN_PALETTE = "open-palette";
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE));
