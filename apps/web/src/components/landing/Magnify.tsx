"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/components/ui";

const SPRING = { stiffness: 320, damping: 22, mass: 0.4 };

/** Scale (and lift) an element by how close the pointer is along x, like a water drop passing over it. */
function useMagnify(pointerX: MotionValue<number>, ref: React.RefObject<HTMLElement | null>, range: number, max: number, lift: number) {
  const distance = useTransform(pointerX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const scale = useSpring(useTransform(distance, [-range, 0, range], [1, max, 1]), SPRING);
  const y = useSpring(useTransform(distance, [-range, 0, range], [0, -lift, 0]), SPRING);
  return { scale, y };
}

/* ---------- Headline letters that swell under the pointer ---------- */

function Letter({ ch, pointerX, className }: { ch: string; pointerX: MotionValue<number>; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { scale, y } = useMagnify(pointerX, ref, 90, 1.32, 6);
  return (
    <motion.span ref={ref} style={{ scale, y }} className={cn("inline-block origin-bottom will-change-transform", className)}>
      {ch}
    </motion.span>
  );
}

/**
 * Text whose letters magnify as the pointer passes over them.
 * Parts: [{ text, className }] so one word can carry the serif flourish.
 */
export function MagnifyText({ parts, as: Tag = "h1", className }: { parts: { text: string; className?: string }[]; as?: "h1" | "h2" | "p"; className?: string }) {
  const pointerX = useMotionValue(Infinity);
  const reduce = useReducedMotion();
  const full = parts.map((p) => p.text).join(" ");
  const words = parts.flatMap((p) => p.text.split(" ").map((w) => ({ w, className: p.className })));
  return (
    <Tag
      className={className}
      onPointerMove={(e) => !reduce && e.pointerType === "mouse" && pointerX.set(e.clientX)}
      onPointerLeave={() => pointerX.set(Infinity)}
    >
      <span className="sr-only">{full}</span>
      <span aria-hidden>
        {words.map(({ w, className: wc }, i) => (
          <span key={i} className={cn("inline-block whitespace-nowrap", wc)}>
            {[...w].map((ch, j) => <Letter key={j} ch={ch} pointerX={pointerX} />)}
            {i < words.length - 1 && <span className="inline-block w-[0.26em]" />}
          </span>
        ))}
      </span>
    </Tag>
  );
}

/* ---------- Dock: items grow as the pointer moves along the row ---------- */

function DockItem({ pointerX, children }: { pointerX: MotionValue<number>; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const { scale, y } = useMagnify(pointerX, ref, 160, 1.45, 14);
  return (
    <motion.li ref={ref} style={{ scale, y }} className="origin-bottom">
      {children}
    </motion.li>
  );
}

export function Dock({ items, className }: { items: ReactNode[]; className?: string }) {
  const pointerX = useMotionValue(Infinity);
  const reduce = useReducedMotion();
  return (
    <ul
      className={cn("flex items-end justify-center gap-4 sm:gap-6", className)}
      onPointerMove={(e) => !reduce && e.pointerType === "mouse" && pointerX.set(e.clientX)}
      onPointerLeave={() => pointerX.set(Infinity)}
    >
      {items.map((item, i) => <DockItem key={i} pointerX={pointerX}>{item}</DockItem>)}
    </ul>
  );
}

/* ---------- Water-drop lens: a round magnifier that follows the pointer ---------- */

/**
 * Renders `children` twice: the real content, and a magnified copy clipped to a circle
 * at the pointer. The copy is inert and hidden from assistive tech.
 */
export function Lens({ children, zoom = 1.6, radius = 72, className }: { children: ReactNode; zoom?: number; radius?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function move(e: React.PointerEvent) {
    const el = box.current;
    if (!el || reduce || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--lx", `${e.clientX - r.left}px`);
    el.style.setProperty("--ly", `${e.clientY - r.top}px`);
    el.dataset.lens = "on";
  }

  return (
    <div
      ref={box}
      onPointerMove={move}
      onPointerLeave={() => box.current && (box.current.dataset.lens = "off")}
      data-lens="off"
      className={cn("group/lens relative cursor-none", reduce && "cursor-auto", className)}
      style={{ ["--lr" as string]: `${radius}px` }}
    >
      {children}
      {/* magnified copy */}
      <div
        aria-hidden
        inert
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-data-[lens=on]/lens:opacity-100"
        style={{ clipPath: "circle(var(--lr) at var(--lx, 50%) var(--ly, 50%))", backgroundColor: "var(--surface-solid)" }}
      >
        <div className="size-full" style={{ transform: `scale(${zoom})`, transformOrigin: "var(--lx, 50%) var(--ly, 50%)" }}>
          {children}
        </div>
      </div>
      {/* the drop itself: rim, gloss and soft shadow */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full opacity-0 transition-opacity duration-200 group-data-[lens=on]/lens:opacity-100"
        style={{
          width: "calc(var(--lr) * 2)",
          height: "calc(var(--lr) * 2)",
          left: "calc(var(--lx, 50%) - var(--lr))",
          top: "calc(var(--ly, 50%) - var(--lr))",
          boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / 0.55), inset 0 -10px 24px rgb(126 232 181 / 0.25), inset 0 10px 18px rgb(255 255 255 / 0.35), 0 12px 30px rgb(15 42 32 / 0.25)",
          background: "radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.45), transparent 28%)",
        }}
      />
    </div>
  );
}
