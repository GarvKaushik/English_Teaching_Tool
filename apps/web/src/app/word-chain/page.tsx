"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { RecordButton } from "@/components/RecordButton";
import { Ring, XpBadge } from "@/components/Results";
import { errorText, playAudio, postAudio, postJson, useRequireLogin } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import styles from "../ui.module.css";

type Word = { word: string; by: "you" | "ai"; points: number };
type Game = {
  id: number;
  words: Word[];
  score: number;
  next_letter: string | null;
  retry_used: boolean;
  finished: boolean;
  turn_seconds: number;
  ai_audio: string | null;
  turn: { heard: string | null; ok: boolean; reason?: string; retry?: boolean; points?: number; won?: boolean } | null;
  xp: number;
};

export default function WordChain() {
  useRequireLogin();
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState(0); // when the learner's turn ends (the server checks it too)
  const [now, setNow] = useState(0); // set when a turn starts, never during render (pages are prerendered)
  const recorder = useRecorder(game?.turn_seconds ?? 15, sendWord, setMessage);
  const live = useRef({ recording: false, busy: false });
  useEffect(() => {
    live.current = { recording: recorder.recording, busy };
  });

  function show(next: Game) {
    const t = Date.now();
    setNow(t);
    setDeadline(t + next.turn_seconds * 1000);
    setGame(next);
    const ai = next.words[next.words.length - 1];
    if (!next.finished && ai?.by === "ai") playAudio(next.ai_audio, ai.word);
  }

  async function start() {
    setBusy(true);
    setMessage("");
    try {
      show(await postJson<Game>("/v1/word-chain", {}));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendWord(wav: Blob) {
    if (!game) return;
    setBusy(true);
    try {
      show(await postAudio<Game>(`/v1/word-chain/${game.id}/turn`, wav));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function timeUp(id: number) {
    try {
      const over = await postJson<Game>(`/v1/word-chain/${id}/stop`, {});
      setGame({ ...over, turn: { heard: null, ok: false, reason: "Time's up!" } });
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  async function quit() {
    if (!game) return;
    try {
      setGame(await postJson<Game>(`/v1/word-chain/${game.id}/stop`, {}));
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  // Tick the turn timer; time runs out only while the learner isn't recording or waiting for a result.
  useEffect(() => {
    if (!game || game.finished) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline && !live.current.recording && !live.current.busy) {
        clearInterval(id);
        timeUp(game.id);
      }
    }, 250);
    return () => clearInterval(id);
  }, [game, deadline]);

  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const last = game?.words[game.words.length - 1];
  const yourWords = game?.words.filter((w) => w.by === "you").length ?? 0;

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>Word Chain</span>
        <h1>Keep the chain going</h1>
        <p className={styles.muted}>Say a word that starts with the last letter of the AI&apos;s word. No repeats, and be quick!</p>
      </div>

      {!game && (
        <>
          <ul className={styles.rules}>
            <li><span className={`${styles.cardIcon} ${styles.iconOk}`}><Icon name="timer" size={18} /></span>15 seconds per word</li>
            <li><span className={styles.cardIcon}><Icon name="zap" size={18} /></span>Longer words score more</li>
            <li><span className={`${styles.cardIcon} ${styles.iconGood}`}><Icon name="retry" size={18} /></span>One retry if we mishear you</li>
          </ul>
          <div className={`${styles.actions} ${styles.actionsCenter}`}>
            <button className={styles.button} onClick={start} disabled={busy}>
              {busy ? <Icon name="loader" className={styles.spin} /> : <>Start <Icon name="arrow" size={18} /></>}
            </button>
          </div>
        </>
      )}

      {game && (
        <>
          <div className={styles.words} aria-label="The chain so far">
            {game.words.map((w, i) => (
              <span key={i} className={`${styles.wordChip} ${w.by === "you" ? styles.good : styles.muted}`}>
                <span>{w.word}</span>
                {w.by === "you" && <small>+{w.points}</small>}
              </span>
            ))}
          </div>

          {game.turn && (
            <p className={`${styles.note} ${game.turn.ok ? styles.good : styles.bad}`} role="status">
              <Icon name={game.turn.ok ? "check" : "x"} size={18} />
              {game.turn.heard ? <>We heard “{game.turn.heard}”. </> : null}
              {game.turn.ok ? `+${game.turn.points} points!` : game.turn.reason}
              {game.turn.retry && " You get one retry. Try again!"}
            </p>
          )}

          {!game.finished && last && (
            <div className={styles.countdown}>
              <p className={styles.sentence} style={{ textAlign: "center" }}>
                {last.word}
                <button className={styles.iconButton} onClick={() => playAudio(game.ai_audio, last.word)} aria-label="Hear the word again" style={{ marginLeft: 12, verticalAlign: "middle" }}>
                  <Icon name="speaker" size={18} />
                </button>
              </p>
              <p className={styles.countdownLabel}>Your word starts with “{game.next_letter?.toUpperCase()}”</p>
              {!recorder.recording && !busy && (
                <Ring value={(seconds / game.turn_seconds) * 100} size={96} stroke={8} className={seconds <= 5 ? styles.bad : styles.ok}>
                  <span className={styles.ringNumber}>{seconds}</span>
                </Ring>
              )}
              <RecordButton
                recording={recorder.recording}
                busy={busy}
                maxSeconds={game.turn_seconds}
                onStart={() => { setMessage(""); recorder.start(); }}
                onStop={recorder.stop}
                label="Tap and say your word"
                busyLabel="Checking…"
              />
              <p className={styles.muted}>Score: {game.score} · Words: {yourWords}</p>
              <button className={styles.secondary} onClick={quit} disabled={busy || recorder.recording}>End game</button>
            </div>
          )}

          {game.finished && (
            <section className={styles.result} aria-label="Your Word Chain result">
              <div className={`${styles.card} ${styles.resultHead}`}>
                <div className={styles.stat}>
                  <span className={styles.statTop}><Icon name="zap" size={16} />Points</span>
                  <span className={styles.statValue}>{game.score}</span>
                </div>
                <div>
                  <h2>{game.turn?.won ? "You beat the AI!" : "Game over"}</h2>
                  <p>You played {yourWords} {yourWords === 1 ? "word" : "words"}.</p>
                  <XpBadge xp={game.xp} />
                </div>
              </div>
              <div className={styles.actions}>
                <button className={styles.button} onClick={start} disabled={busy}><Icon name="retry" size={18} />Play again</button>
                <Link href="/" className={styles.secondary}>Home</Link>
              </div>
            </section>
          )}
        </>
      )}
      <p role="alert" className={styles.error}>{message}</p>
    </main>
  );
}
