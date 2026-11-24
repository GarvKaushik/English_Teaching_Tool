import type { ReactNode } from "react";
import type { Mistake } from "@/lib/api";
import styles from "@/app/ui.module.css";
import { Icon } from "./Icons";

export const scoreClass = (score: number | null | undefined) =>
  score == null ? "" : score >= 80 ? styles.good : score >= 60 ? styles.ok : styles.bad;
export const scoreWord = (score: number | null | undefined) =>
  score == null ? "" : score >= 80 ? "Great" : score >= 60 ? "Good" : "Keep practising";
export const fmt = (score: number | null | undefined) => (score == null ? "–" : Math.round(score));

/** Circular progress ring; colour comes from the parent's text colour. */
export function Ring({ value, size = 140, stroke = 12, className = "", children }: { value: number; size?: number; stroke?: number; className?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`${styles.ring} ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle className={styles.ringTrack} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className={styles.ringValue} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className={styles.ringCenter}>{children}</div>
    </div>
  );
}

/** Big score out of 100 with a word label, so meaning never relies on colour alone. */
export function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  return (
    <Ring value={score} size={size} className={scoreClass(score)}>
      <span role="img" aria-label={`Score ${Math.round(score)} out of 100, ${scoreWord(score)}`} className={styles.ringNumber} style={{ fontSize: size * 0.28 }}>{Math.round(score)}</span>
      <span className={styles.ringLabel} aria-hidden="true">{scoreWord(score)}</span>
    </Ring>
  );
}

export function XpBadge({ xp }: { xp: number }) {
  return <span className={styles.xpBadge}><Icon name="zap" size={16} />+{xp} XP</span>;
}

export function ScoreGrid({ scores }: { scores: Record<string, number | null> }) {
  return (
    <dl className={styles.scoreGrid}>
      {Object.entries(scores).map(([name, value]) => (
        <div key={name} className={`${styles.scoreItem} ${scoreClass(value)}`}>
          <dt>{name.replaceAll("_", " ")}</dt>
          <dd>
            <strong>{fmt(value)}</strong>
            <span className={styles.tag}>{scoreWord(value)}</span>
          </dd>
          <div className={styles.meter} aria-hidden="true">
            <div className={styles.meterFill} style={{ width: `${value ?? 0}%` }} />
          </div>
        </div>
      ))}
    </dl>
  );
}

export function MistakeList({ mistakes }: { mistakes: Mistake[] }) {
  if (mistakes.length === 0) {
    return (
      <p className={`${styles.note} ${styles.good}`}><Icon name="check" size={18} />No mistakes found. Well done!</p>
    );
  }
  return (
    <ul className={styles.list}>
      {mistakes.map((m, i) => (
        <li key={i} className={styles.mistake}>
          <span className={`${styles.mistakeLine} ${styles.bad}`}><Icon name="x" size={16} title="You said" /><span className={styles.strike}>{m.original}</span></span>
          <span className={`${styles.mistakeLine} ${styles.good}`}><Icon name="check" size={16} title="Correct" /><strong>{m.correction}</strong></span>
          {m.explanation && <span className={styles.muted}>{m.explanation}</span>}
        </li>
      ))}
    </ul>
  );
}
