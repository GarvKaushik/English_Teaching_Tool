"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { RecordButton } from "@/components/RecordButton";
import { ScoreRing, XpBadge } from "@/components/Results";
import { api, errorText, playAudio, postAudio, useRequireLogin } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import styles from "../ui.module.css";

type Level = { level: number; levels: number; id: number; text: string; pool_size: number; target_seconds: number; audio: string | null };
type Result = {
  accuracy: number;
  speed: number;
  score: number;
  words: { word: string; hit: boolean }[];
  passed: boolean;
  transcript: string;
  seconds: number;
  xp: number;
  next_level: number | null;
};

const MAX_SECONDS = 20;

export default function TongueTwister() {
  useRequireLogin();
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(0); // bump to draw another twister at the same level
  const [twister, setTwister] = useState<Level | null>(null);
  const [listened, setListened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const recorder = useRecorder(MAX_SECONDS, send, setMessage);

  useEffect(() => {
    api<Level>(`/v1/tongue-twister/${level}`).then(setTwister).catch((e) => setMessage(errorText(e)));
  }, [level, round]);

  function changeLevel(next: number) {
    setTwister(null);
    setResult(null);
    setListened(false);
    setLevel(next);
    setRound((r) => r + 1);
  }

  function listen() {
    if (!twister) return;
    playAudio(twister.audio, twister.text);
    setListened(true); // it plays once, like the real challenge
  }

  async function send(wav: Blob) {
    setBusy(true);
    try {
      setResult(await postAudio<Result>(`/v1/tongue-twister/${level}`, wav, { twister_id: String(twister?.id) }));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!twister) return <main className={styles.main}><p role="status" className={styles.status}>{message || "Loading…"}</p></main>;

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>Tongue Twister</span>
        <h1>Say it clearly, then say it fast</h1>
        <p className={styles.muted}>{twister.pool_size} twisters and growing: new ones are added every day. Listen once, then say it. Get 80% of the words right to unlock the next level.</p>
      </div>

      <label className={styles.field} style={{ maxWidth: 220 }}>
        <span className={styles.note} style={{ color: "inherit" }}>Level</span>
        <select className={styles.input} value={level} onChange={(e) => changeLevel(Number(e.target.value))} disabled={busy || recorder.recording}>
          {Array.from({ length: twister.levels }, (_, i) => <option key={i} value={i + 1}>Level {i + 1}</option>)}
        </select>
      </label>

      <div className={styles.sentence}>
        <div className={styles.sentenceMeta}>
          <span>Level {twister.level} of {twister.levels}</span>
          <span>Aim for {twister.target_seconds} s</span>
        </div>
        {twister.text}
      </div>

      <div className={`${styles.actions} ${styles.actionsCenter}`}>
        <button className={styles.secondary} onClick={listen} disabled={listened}>
          <Icon name="speaker" size={18} />{listened ? "Played" : "Listen once"}
        </button>
        <button className={styles.secondary} onClick={() => changeLevel(level)} disabled={busy || recorder.recording}>
          <Icon name="retry" size={18} />New twister
        </button>
      </div>

      <RecordButton
        recording={recorder.recording}
        busy={busy}
        maxSeconds={MAX_SECONDS}
        onStart={() => { setMessage(""); setResult(null); recorder.start(); }}
        onStop={recorder.stop}
        label="Tap and say the twister"
      />
      <p role="status" aria-live="polite" className={styles.status}>{busy ? "Scoring…" : message}</p>

      {result && (
        <section className={styles.result} aria-label="Your tongue twister result">
          <div className={`${styles.card} ${styles.resultHead}`}>
            <ScoreRing score={result.score} />
            <div>
              <h2>{result.passed ? "Nicely done!" : "Almost! Try again"}</h2>
              <p>Accuracy {result.accuracy}% · Speed {result.speed}% · {result.seconds} s</p>
              <XpBadge xp={result.xp} />
            </div>
          </div>
          <div className={styles.words} aria-label="Words you got right and missed">
            {result.words.map((w, i) => (
              <span key={i} className={`${styles.wordChip} ${w.hit ? styles.good : styles.bad}`}>
                <Icon name={w.hit ? "check" : "x"} size={14} title={w.hit ? "Said" : "Missed"} />
                <span>{w.word}</span>
              </span>
            ))}
          </div>
          <p className={styles.quote}>We heard: “{result.transcript}”</p>
          <div className={styles.actions}>
            {result.next_level && (
              <button className={styles.button} onClick={() => changeLevel(result.next_level!)}>Next level <Icon name="arrow" size={18} /></button>
            )}
            <button className={styles.secondary} onClick={() => setResult(null)}><Icon name="retry" size={18} />Try again</button>
          </div>
        </section>
      )}
    </main>
  );
}
