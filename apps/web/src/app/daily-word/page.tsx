"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { RecordButton } from "@/components/RecordButton";
import { api, errorText, playAudio, postAudio, postJson, useRequireLogin } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import styles from "../ui.module.css";

type Tile = "correct" | "present" | "absent";
type State = {
  guesses: { word: string; result: Tile[] }[];
  max_guesses: number;
  finished: boolean;
  solved: boolean;
  bonus_done: boolean;
  reveal: { word: string; meaning: string; example: string; phonetic: string; audio: string | null } | null;
};
type Bonus = { transcript: string; correct: boolean; feedback: string; xp: number };

// Used only in the shared text result, not as UI icons.
const EMOJI: Record<Tile, string> = { correct: "🟩", present: "🟨", absent: "⬜" };
const TILE_WORD: Record<Tile, string> = { correct: "right place", present: "wrong place", absent: "not in word" };

export default function DailyWord() {
  useRequireLogin();
  const [state, setState] = useState<State | null>(null);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const recorder = useRecorder(15, sendSentence, setMessage);

  useEffect(() => {
    api<State>("/v1/daily-word").then(setState).catch((e) => setMessage(errorText(e)));
  }, []);

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      setState(await postJson<State>("/v1/daily-word/guess", { word: guess }));
      setGuess("");
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendSentence(wav: Blob) {
    setBusy(true);
    try {
      const r = await postAudio<Bonus>("/v1/daily-word/sentence", wav);
      setBonus(r);
      if (r.correct) setState((s) => (s ? { ...s, bonus_done: true } : s));
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!state) return;
    const grid = state.guesses.map((g) => g.result.map((t) => EMOJI[t]).join("")).join("\n");
    const text = `Daily Word ${state.solved ? state.guesses.length : "X"}/${state.max_guesses}\n${grid}`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Result copied!");
    } catch {
      setMessage("");
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  if (!state) return <main className={styles.main}><p role="status" className={styles.status}>{message || "Loading…"}</p></main>;

  const rows = Array.from({ length: state.max_guesses }, (_, i) => state.guesses[i]);
  const triesLeft = state.max_guesses - state.guesses.length;

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>Daily Word</span>
        <h1>Guess today&apos;s word</h1>
        <p className={styles.muted}>Find the five-letter word in {state.max_guesses} tries. Everyone gets the same word today.</p>
      </div>

      <div className={styles.board}>
        <div className={styles.tiles} role="grid" aria-label="Your guesses">
          {rows.map((g, i) => {
            const typing = i === state.guesses.length && !state.finished;
            return (
              <div key={i} className={styles.row} role="row">
                {Array.from({ length: 5 }, (_, j) => {
                  const letter = g?.word[j] ?? (typing ? guess[j] ?? "" : "");
                  return (
                    <div
                      key={j}
                      role="gridcell"
                      className={`${styles.tile} ${g ? styles[g.result[j]] : letter ? styles.filled : ""}`}
                      aria-label={g ? `${g.word[j]}, ${TILE_WORD[g.result[j]]}` : letter || "empty"}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <ul className={styles.legend} aria-label="Colour key">
          <li><span className={styles.swatch} style={{ background: "var(--tile-correct)" }} />Right place</li>
          <li><span className={styles.swatch} style={{ background: "var(--tile-present)" }} />Wrong place</li>
          <li><span className={styles.swatch} style={{ background: "var(--tile-absent)" }} />Not in word</li>
        </ul>

        {!state.finished && (
          <form className={styles.guessForm} onSubmit={submitGuess}>
            <label htmlFor="guess" className={styles.srOnly}>
              Your guess ({triesLeft} tries left)
            </label>
            <input
              id="guess"
              className={styles.input}
              value={guess}
              onChange={(e) => setGuess(e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5))}
              maxLength={5}
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Type a word"
            />
            <button className={styles.button} disabled={busy || guess.length !== 5}>
              {busy ? <Icon name="loader" className={styles.spin} /> : "Guess"}
            </button>
          </form>
        )}
      </div>

      <p role="status" aria-live="polite" className={styles.status}>{recorder.recording ? "Recording… tap stop when you finish." : busy && !state.finished ? "Checking…" : message}</p>

      {state.reveal && (
        <section className={`${styles.card} ${styles.reveal}`} aria-labelledby="reveal-heading">
          <span className={`${styles.eyebrow} ${state.solved ? styles.good : ""}`} id="reveal-heading">
            {state.solved ? `Solved in ${state.guesses.length}!` : "Today's word was"}
          </span>
          <p className={styles.revealWord}>{state.reveal.word.toUpperCase()}</p>
          <div className={styles.phonetic}>
            {state.reveal.phonetic && <span>{state.reveal.phonetic}</span>}
            <button className={styles.iconButton} onClick={() => playAudio(state.reveal?.audio, state.reveal?.word)} aria-label="Hear the word">
              <Icon name="speaker" size={18} />
            </button>
          </div>
          {state.reveal.meaning && <p>{state.reveal.meaning}</p>}
          {state.reveal.example && <p className={styles.quote} style={{ textAlign: "left", width: "100%" }}>“{state.reveal.example}”</p>}
          <button className={styles.secondary} onClick={share}><Icon name="share" size={18} />Share on WhatsApp</button>
        </section>
      )}

      {state.reveal && (
        <section className={`${styles.card} ${styles.reveal}`} aria-labelledby="bonus-heading">
          <span className={`${styles.cardIcon} ${styles.iconOk}`}><Icon name="sparkles" size={22} /></span>
          <h2 id="bonus-heading">Bonus: use “{state.reveal.word}” in a sentence</h2>
          {state.bonus_done ? (
            <p className={`${styles.note} ${styles.good}`}><Icon name="check" size={18} />Bonus earned! Come back tomorrow for a new word.</p>
          ) : (
            <>
              <p className={styles.muted}>Say one sentence out loud that uses today&apos;s word.</p>
              <RecordButton
                recording={recorder.recording}
                busy={busy}
                maxSeconds={15}
                onStart={() => { setMessage(""); setBonus(null); recorder.start(); }}
                onStop={recorder.stop}
                label="Tap and say your sentence"
                busyLabel="Checking…"
              />
            </>
          )}
          {bonus && (
            <div className={styles.section} style={{ width: "100%" }}>
              <p className={`${styles.note} ${bonus.correct ? styles.good : styles.bad}`} style={{ justifyContent: "center" }}>
                <Icon name={bonus.correct ? "check" : "x"} size={18} />
                {bonus.correct ? `+${bonus.xp} XP! ` : ""}{bonus.feedback}
              </p>
              <p className={styles.quote} style={{ textAlign: "left" }}>We heard: “{bonus.transcript}”</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
