"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { RecordButton } from "@/components/RecordButton";
import { MistakeList, XpBadge } from "@/components/Results";
import { Segmented } from "@/components/ui";
import { api, errorText, playAudio, postAudio, postJson, useRequireLogin, type Mistake, type User } from "@/lib/api";
import { useHandsFree } from "@/lib/useHandsFree";
import styles from "../ui.module.css";

type Lang = "english" | "hinglish";
type Reply = { reply: string; audio: string | null; turns_left: number; transcript?: string; session_id?: number };
type Recap = { summary: string; audio: string | null; mistakes: Mistake[]; xp: number };
type Line = { mine: boolean; text: string; audio?: string | null };

const LANGS: { value: Lang; label: string }[] = [{ value: "english", label: "English" }, { value: "hinglish", label: "Hinglish" }];

/** Hands-free spoken coaching on the learner's recent mistakes: the mic opens after the coach speaks and sends when they stop. */
export default function Coach() {
  useRequireLogin();
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [lang, setLang] = useState<Lang>("english");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [turnsLeft, setTurnsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [handsFree, setHandsFree] = useState(true);
  const [message, setMessage] = useState("");
  const [recap, setRecap] = useState<Recap | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const playId = useRef(0); // only the latest playback may open the mic
  const live = useRef({ handsFree, turnsLeft });
  useEffect(() => {
    live.current = { handsFree, turnsLeft };
  });

  const listener = useHandsFree(30, sendTurn, () => {
    setHandsFree(false);
    setMessage("I didn't hear anything. Tap the mic when you're ready.");
  }, (m) => { setHandsFree(false); setMessage(m); });

  useEffect(() => {
    const plays = playId;
    api<{ user: User; mistakes: Mistake[] }>("/v1/me").then((r) => {
      setMistakes(r.mistakes);
      setLang(r.user.explain_lang === "hinglish" ? "hinglish" : "english");
    }).catch((e) => setMessage(errorText(e)));
    return () => { plays.current++; }; // a reply finishing after leaving the page must not open the mic
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines, busy]);

  /** Speak a coach line; afterwards listen again if hands-free is on. */
  function say(audio: string | null | undefined, text: string, listenAfter = true) {
    const id = ++playId.current;
    setSpeaking(true);
    playAudio(audio, text, () => {
      if (id !== playId.current) return;
      setSpeaking(false);
      if (listenAfter && live.current.handsFree && live.current.turnsLeft > 0) listener.start();
    });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setHandsFree(false); // wait for a tap instead of reopening the mic straight after an error
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      setHandsFree(true);
      const r = await postJson<Reply>("/v1/coach", { language: lang });
      setSessionId(r.session_id!);
      setLines([{ mine: false, text: r.reply, audio: r.audio }]);
      setTurnsLeft(r.turns_left);
      live.current.turnsLeft = r.turns_left;
      say(r.audio, r.reply);
    });

  function sendTurn(wav: Blob) {
    run(async () => {
      const r = await postAudio<Reply>(`/v1/coach/${sessionId}/turn`, wav);
      setLines((l) => [...l, { mine: true, text: r.transcript ?? "" }, { mine: false, text: r.reply, audio: r.audio }]);
      setTurnsLeft(r.turns_left);
      live.current.turnsLeft = r.turns_left;
      say(r.audio, r.reply);
    });
  }

  function listenNow() {
    setMessage("");
    setHandsFree(true);
    listener.start();
  }

  function pause() {
    setHandsFree(false);
    listener.cancel();
  }

  const finish = () => {
    pause();
    playId.current++;
    setSpeaking(false);
    run(async () => {
      const r = await api<Recap>(`/v1/coach/${sessionId}/finish`, { method: "POST" });
      setRecap(r);
      say(r.audio, r.summary, false);
    });
  };

  function reset() {
    playId.current++;
    setRecap(null);
    setSessionId(null);
    setLines([]);
    setSpeaking(false);
    api<{ mistakes: Mistake[] }>("/v1/me").then((r) => setMistakes(r.mistakes)).catch(() => {});
  }

  if (recap) {
    return (
      <main className={styles.main}>
        <section className={`${styles.card} ${styles.result}`} aria-label="Your recap">
          <span className={styles.eyebrow}>Mistake Coach recap</span>
          <p>{recap.summary}</p>
          <div className={styles.actions}>
            <XpBadge xp={recap.xp} />
            <button className={styles.iconButton} onClick={() => say(recap.audio, recap.summary, false)} aria-label="Play recap again">
              <Icon name="speaker" size={16} />
            </button>
          </div>
        </section>
        {recap.mistakes.length > 0 && (
          <section className={styles.section} aria-labelledby="new-heading">
            <h2 id="new-heading">New things to work on</h2>
            <MistakeList mistakes={recap.mistakes} />
          </section>
        )}
        <div className={styles.actions}>
          <button className={styles.button} onClick={reset}><Icon name="retry" size={18} />Practise again</button>
          <Link href="/" className={styles.secondary}>Home</Link>
        </div>
      </main>
    );
  }

  if (sessionId === null) {
    const none = mistakes !== null && mistakes.length === 0;
    return (
      <main className={styles.main}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>Mistake Coach</span>
          <h1>Fix your recent mistakes</h1>
          <p className={styles.muted}>Talk with your coach about the mistakes you made recently. It explains each one, you say it the right way, and it checks you. Hands-free: just speak, and it listens when the coach stops talking.</p>
        </div>
        <div className={styles.actions}>
          <span className={styles.muted}>Explain in</span>
          <Segmented label="Explanation language" value={lang} options={LANGS} onChange={setLang} />
        </div>
        {none ? (
          <p className={styles.note}>
            <Icon name="sparkles" size={18} />
            No saved mistakes yet. Do a <Link href="/roleplay">role-play</Link>, <Link href="/jam">JAM</Link> or <Link href="/quiz">quiz</Link> first, then come back.
          </p>
        ) : mistakes && (
          <section className={styles.section} aria-labelledby="recent-heading">
            <h2 id="recent-heading">You&apos;ll practise mistakes like these</h2>
            <MistakeList mistakes={mistakes.slice(0, 3)} />
          </section>
        )}
        <button className={styles.button} onClick={start} disabled={busy || !mistakes || none}>
          {busy ? <Icon name="loader" size={18} className={styles.spin} /> : <Icon name="mic" size={18} />}Start coaching
        </button>
        <p className={styles.note}><Icon name="shield" size={18} />Your microphone opens only while it&apos;s your turn to speak.</p>
        <p role="status" aria-live="polite" className={styles.status}>{busy ? "Starting your session…" : message}</p>
      </main>
    );
  }

  const label = turnsLeft === 0 ? "No turns left" : speaking ? "Coach is speaking…" : "Tap to speak";
  return (
    <main className={styles.main}>
      <div className={styles.chatHead}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>Mistake Coach · {lang === "hinglish" ? "Hinglish" : "English"}</span>
          <h1>Your coaching session</h1>
        </div>
        <span className={styles.chip}>{turnsLeft} {turnsLeft === 1 ? "turn" : "turns"} left</span>
      </div>

      <div className={styles.chat} aria-live="polite" aria-label="Conversation">
        {lines.map((l, i) => (
          <div key={i} className={`${styles.msg} ${l.mine ? styles.mine : ""}`}>
            <span className={styles.avatar}><Icon name={l.mine ? "user" : "bot"} size={18} title={l.mine ? "You" : "Coach"} /></span>
            <div className={styles.bubble}>
              <span>{l.text}</span>
              {!l.mine && (
                <button className={styles.iconButton} onClick={() => { pause(); say(l.audio, l.text, false); }}
                        disabled={listener.listening} aria-label="Play again">
                  <Icon name="speaker" size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className={styles.msg}>
            <span className={styles.avatar}><Icon name="bot" size={18} /></span>
            <div className={styles.bubble}><span className={styles.typing} aria-label="Thinking"><i /><i /><i /></span></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={styles.dock}>
        <RecordButton
          recording={listener.listening}
          busy={busy}
          disabled={speaking || turnsLeft === 0}
          maxSeconds={30}
          onStart={listenNow}
          onStop={listener.send}
          label={label}
          stopLabel="Listening… tap to send now"
          busyLabel="Thinking…"
        />
        {handsFree && turnsLeft > 0 ? (
          <button onClick={pause} disabled={busy} className={styles.ghost}>Pause hands-free</button>
        ) : (
          <span className={styles.muted}>{turnsLeft > 0 ? "Hands-free is paused. Tap the mic to carry on." : "That's all the turns for this session."}</span>
        )}
        <button onClick={finish} disabled={busy || lines.length < 2} className={styles.ghost}>
          Finish &amp; get recap <Icon name="arrow" size={18} />
        </button>
        <p role="status" aria-live="polite" className={styles.status}>{message}</p>
      </div>
    </main>
  );
}
