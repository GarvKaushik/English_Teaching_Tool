"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { MistakeList, Ring, ScoreGrid, ScoreRing, XpBadge } from "@/components/Results";
import { api, errorText, postAudio, useRequireLogin, type Mistake } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import styles from "../ui.module.css";

type Topic = { topic: string; think_seconds: number; speak_seconds: number };
type Result = {
  topic: string;
  transcript: string;
  metrics: { word_count: number; words_per_minute: number; fillers: Record<string, number>; filler_count: number; repetitions: number; long_pauses: number };
  scores: Record<string, number>;
  penalty: number;
  score: number;
  feedback: string;
  mistakes: Mistake[];
  xp: number;
};

export default function Jam() {
  useRequireLogin();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [phase, setPhase] = useState<"ready" | "think" | "speak" | "scoring" | "done">("ready");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder = useRecorder(topic?.speak_seconds ?? 60, submit, (m) => { setMessage(m); setPhase("ready"); });

  useEffect(() => {
    api<Topic>("/v1/jam/topic").then(setTopic).catch((e) => setMessage(errorText(e)));
    return () => { if (tick.current) clearInterval(tick.current); };
  }, []);

  function countdown(from: number, then: () => void) {
    if (tick.current) clearInterval(tick.current);
    setSeconds(from);
    let left = from;
    tick.current = setInterval(() => {
      left -= 1;
      setSeconds(left);
      if (left <= 0) {
        clearInterval(tick.current!);
        then();
      }
    }, 1000);
  }

  function begin() {
    if (!topic) return;
    setMessage("");
    setResult(null);
    setPhase("think");
    countdown(topic.think_seconds, async () => {
      await recorder.start();
      setPhase("speak");
      countdown(topic.speak_seconds, () => {});
    });
  }

  async function submit(wav: Blob) {
    if (tick.current) clearInterval(tick.current);
    setPhase("scoring");
    try {
      setResult(await postAudio<Result>("/v1/jam", wav));
      setPhase("done");
    } catch (e) {
      setMessage(errorText(e));
      setPhase("ready");
    }
  }

  if (!topic) return <main className={styles.main}><p role="status" className={styles.status}>{message || "Loading…"}</p></main>;

  const total = phase === "think" ? topic.think_seconds : topic.speak_seconds;

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>JAM: Just a Minute</span>
        <h1>Today&apos;s topic</h1>
        <p className={styles.muted}>Everyone gets the same topic today, so you can compare scores with friends.</p>
      </div>
      <p className={styles.sentence}>{topic.topic}</p>

      {phase === "ready" && (
        <>
          <ul className={styles.rules}>
            <li><span className={`${styles.cardIcon} ${styles.iconOk}`}><Icon name="timer" size={18} /></span>{topic.think_seconds} seconds to think</li>
            <li><span className={styles.cardIcon}><Icon name="mic" size={18} /></span>{topic.speak_seconds} seconds to speak</li>
            <li><span className={`${styles.cardIcon} ${styles.iconBad}`}><Icon name="x" size={18} /></span>Avoid “umm” and “basically”</li>
          </ul>
          <div className={`${styles.actions} ${styles.actionsCenter}`}>
            <button className={styles.button} onClick={begin}>Start <Icon name="arrow" size={18} /></button>
          </div>
        </>
      )}

      {(phase === "think" || phase === "speak") && (
        <div className={styles.countdown}>
          <Ring value={(seconds / total) * 100} size={180} stroke={14} className={phase === "think" ? styles.ok : styles.bad}>
            <span className={styles.ringNumber} style={{ fontSize: 56 }}>{seconds}</span>
            <span className={styles.ringLabel}>seconds</span>
          </Ring>
          <p className={`${styles.countdownLabel} ${phase === "speak" ? styles.bad : ""}`} aria-live="assertive">
            {phase === "think" ? "Think about what you'll say…" : <><Icon name="mic" size={18} /> Speak now!</>}
          </p>
          {phase === "speak" && (
            <button className={styles.secondary} onClick={recorder.stop}><Icon name="stop" size={16} />Stop early</button>
          )}
        </div>
      )}

      {phase === "scoring" && (
        <div className={styles.countdown}>
          <Icon name="loader" size={40} className={styles.spin} style={{ color: "var(--accent)" }} />
        </div>
      )}
      <p role="status" aria-live="polite" className={styles.status}>{phase === "scoring" ? "Scoring your minute…" : message}</p>

      {result && (
        <section className={styles.result} aria-label="Your JAM result">
          <div className={`${styles.card} ${styles.resultHead}`}>
            <ScoreRing score={result.score} />
            <div>
              <h2>Your minute</h2>
              <p>{result.feedback}</p>
              <XpBadge xp={result.xp} />
            </div>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}><span className={styles.statTop}>Words per minute</span><span className={styles.statValue}>{result.metrics.words_per_minute}</span></div>
            <div className={styles.stat}>
              <span className={styles.statTop}>Filler words</span>
              <span className={styles.statValue}>{result.metrics.filler_count}</span>
              {result.metrics.filler_count > 0 && <span className={`${styles.muted} ${styles.small}`}>{Object.entries(result.metrics.fillers).map(([w, n]) => `${w} ×${n}`).join(", ")}</span>}
            </div>
            <div className={styles.stat}><span className={styles.statTop}>Long pauses</span><span className={styles.statValue}>{result.metrics.long_pauses}</span></div>
            <div className={styles.stat}><span className={styles.statTop}>Repeated words</span><span className={styles.statValue}>{result.metrics.repetitions}</span></div>
          </div>
          {result.penalty > 0 && <p className={`${styles.note} ${styles.bad}`}><Icon name="alert" size={18} />−{result.penalty} points for fillers and pauses</p>}

          <ScoreGrid scores={result.scores} />

          <div className={styles.section}>
            <h2>Mistakes</h2>
            <MistakeList mistakes={result.mistakes} />
          </div>
          <p className={styles.quote}>We heard: “{result.transcript}”</p>
          <div className={styles.actions}>
            <button className={styles.button} onClick={begin}><Icon name="retry" size={18} />Try again</button>
            <Link href="/" className={styles.secondary}>Home</Link>
          </div>
        </section>
      )}
    </main>
  );
}
