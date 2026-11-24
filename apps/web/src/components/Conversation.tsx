"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icons";
import { RecordButton } from "@/components/RecordButton";
import { MistakeList, ScoreRing, XpBadge } from "@/components/Results";
import { api, errorText, playAudio, postAudio, postJson, useRequireLogin, type Mistake, type User } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import styles from "@/app/ui.module.css";

const SCENARIOS: { id: string; title: string; text: string; icon: IconName }[] = [
  { id: "interview", title: "Job Interview", text: "HR round: tell me about yourself, strengths, challenges.", icon: "briefcase" },
  { id: "everyday", title: "Everyday Conversation", text: "Order food at a cafe and make small talk.", icon: "coffee" },
];
const RESUME = { id: "resume", title: "Interview Preparation" };

type Reply = { reply: string; audio: string | null; turns_left: number; transcript?: string; session_id?: number; interviews_left?: number | null };
type InterviewFeedback = {
  readiness: number;
  verdict: string;
  strengths: string[];
  weaknesses: { area: string; detail: string; improve: string }[];
};
type Debrief = {
  score: number;
  summary: string;
  mistakes: Mistake[];
  better_phrases: { original: string; natural: string }[];
  interview: InterviewFeedback | null;
  xp: number;
};
type Line = { mine: boolean; text: string; audio?: string | null };

/** Spoken, turn-by-turn conversation with an AI partner, then a debrief. "interview" mode starts from an uploaded resume. */
export function Conversation({ mode }: { mode: "roleplay" | "interview" }) {
  useRequireLogin();
  const [scenario, setScenario] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [turnsLeft, setTurnsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const recorder = useRecorder(30, sendTurn, setMessage);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<User["plan"] | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines, busy]);

  // Interview mode shows how many interviews the learner's plan has left.
  useEffect(() => {
    if (mode === "interview" && sessionId === null) api<{ user: User }>("/v1/me").then((r) => setPlan(r.user.plan)).catch(() => {});
  }, [mode, sessionId]);
  const noInterviewsLeft = plan?.interviews_left === 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const begin = (id: string, request: () => Promise<Reply>) =>
    run(async () => {
      setScenario(id);
      const r = await request();
      setSessionId(r.session_id!);
      setLines([{ mine: false, text: r.reply, audio: r.audio }]);
      setTurnsLeft(r.turns_left);
      playAudio(r.audio, r.reply);
    });

  const start = (id: string) => begin(id, () => postJson<Reply>("/v1/roleplay", { scenario: id }));

  function startFromResume(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ""; // allow picking the same file again after an error
    if (!file) return;
    const form = new FormData();
    form.append("resume", file);
    begin(RESUME.id, () => api<Reply>("/v1/roleplay/resume", { method: "POST", body: form }));
  }

  function sendTurn(wav: Blob) {
    run(async () => {
      const r = await postAudio<Reply>(`/v1/roleplay/${sessionId}/turn`, wav);
      setLines((l) => [...l, { mine: true, text: r.transcript ?? "" }, { mine: false, text: r.reply, audio: r.audio }]);
      setTurnsLeft(r.turns_left);
      playAudio(r.audio, r.reply);
    });
  }

  const finish = () => run(async () => setDebrief(await api<Debrief>(`/v1/roleplay/${sessionId}/finish`, { method: "POST" })));

  function reset() {
    setDebrief(null);
    setSessionId(null);
    setScenario(null);
    setLines([]);
  }

  const current = mode === "interview" ? RESUME : SCENARIOS.find((s) => s.id === scenario);
  const eyebrow = mode === "interview" ? "Interview Preparation" : "AI Role-Play";

  if (debrief) {
    return (
      <main className={styles.main}>
        <section className={`${styles.card} ${styles.result}`} aria-label="Your feedback">
          <div className={styles.resultHead}>
            <ScoreRing score={debrief.score} />
            <div>
              <span className={styles.eyebrow}>{current?.title ?? "Role-play"} feedback</span>
              <p>{debrief.summary}</p>
              <XpBadge xp={debrief.xp} />
            </div>
          </div>
        </section>

        {debrief.interview && <InterviewReport feedback={debrief.interview} />}

        <section className={styles.section} aria-labelledby="mistakes-heading">
          <h2 id="mistakes-heading">{debrief.interview ? "English mistakes" : "Mistakes"}</h2>
          <MistakeList mistakes={debrief.mistakes} />
        </section>

        {debrief.better_phrases.length > 0 && (
          <section className={styles.section} aria-labelledby="natural-heading">
            <h2 id="natural-heading">Sound more natural</h2>
            <ul className={styles.list}>
              {debrief.better_phrases.map((p, i) => (
                <li key={i} className={styles.mistake}>
                  <span className={styles.muted}>You said: {p.original}</span>
                  <span className={`${styles.mistakeLine} ${styles.good}`}><Icon name="sparkles" size={16} /><strong>Try: {p.natural}</strong></span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className={styles.actions}>
          <button className={styles.button} onClick={reset}><Icon name="retry" size={18} />Practise again</button>
          <Link href="/" className={styles.secondary}>Home</Link>
        </div>
      </main>
    );
  }

  if (sessionId === null && mode === "interview") {
    return (
      <main className={styles.main}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>Practise for your interview</h1>
          <p className={styles.muted}>Upload your resume for a realistic interview: in-depth questions on your field, skills and projects, with follow-ups when an answer is vague. At the end you get feedback on your answers and your English.</p>
        </div>
        {plan && (
          <p className={styles.note}>
            <Icon name="briefcase" size={18} />
            {plan.interviews_left === null
              ? `${plan.name} plan: unlimited interviews.`
              : `${plan.name} plan: ${plan.interviews_left} ${plan.interviews_left === 1 ? "interview" : "interviews"} left.`}
          </p>
        )}
        <button className={styles.linkCard} onClick={() => fileRef.current?.click()} disabled={busy || noInterviewsLeft}>
          <span className={styles.cardIcon}>
            {busy ? <Icon name="loader" size={22} className={styles.spin} /> : <Icon name="file" size={22} />}
          </span>
          <strong>{noInterviewsLeft ? "No interviews left" : "Upload your resume"}</strong>
          <span className={styles.muted}>
            {noInterviewsLeft ? "Upgrade your plan to practise more interviews." : "PDF, up to 2 MB. Scanned resumes aren't supported yet."}
          </span>
          <Icon name="chevron" className={styles.arrow} />
        </button>
        {noInterviewsLeft && <Link href="/plans" className={styles.button}><Icon name="sparkles" size={18} />See plans</Link>}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => startFromResume(e.target.files?.[0])} />
        <p className={styles.note}><Icon name="shield" size={18} />Your resume is read once and then deleted. Only a short summary is kept for the interview.</p>
        <p role="status" aria-live="polite" className={styles.status}>{busy ? "Reading your resume…" : message}</p>
      </main>
    );
  }

  if (sessionId === null) {
    return (
      <main className={styles.main}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>AI Role-Play</span>
          <h1>Choose a situation</h1>
          <p className={styles.muted}>Speak your replies out loud. You&apos;ll get a score, your mistakes and more natural phrases at the end.</p>
        </div>
        <div className={styles.cards}>
          {SCENARIOS.map((s) => (
            <button key={s.id} className={styles.linkCard} onClick={() => start(s.id)} disabled={busy}>
              <span className={styles.cardIcon}>
                {busy && scenario === s.id ? <Icon name="loader" size={22} className={styles.spin} /> : <Icon name={s.icon} size={22} />}
              </span>
              <strong>{s.title}</strong>
              <span className={styles.muted}>{s.text}</span>
              <Icon name="chevron" className={styles.arrow} />
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" className={styles.status}>{busy ? "Starting your conversation…" : message}</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.chatHead}>
        <div className={styles.pageHead}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{current?.title ?? "Conversation"}</h1>
        </div>
        <span className={styles.chip}>{turnsLeft} {turnsLeft === 1 ? "turn" : "turns"} left</span>
      </div>

      <div className={styles.chat} aria-live="polite" aria-label="Conversation">
        {lines.map((l, i) => (
          <div key={i} className={`${styles.msg} ${l.mine ? styles.mine : ""}`}>
            <span className={styles.avatar}><Icon name={l.mine ? "user" : "bot"} size={18} title={l.mine ? "You" : "AI partner"} /></span>
            <div className={styles.bubble}>
              <span>{l.text}</span>
              {!l.mine && (
                <button className={styles.iconButton} onClick={() => playAudio(l.audio, l.text)} aria-label="Play again">
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
          recording={recorder.recording}
          busy={busy}
          disabled={turnsLeft === 0}
          maxSeconds={30}
          onStart={() => { setMessage(""); recorder.start(); }}
          onStop={recorder.stop}
          label={turnsLeft === 0 ? "No turns left" : "Tap to speak"}
          stopLabel="Tap to send"
          busyLabel="Thinking…"
        />
        <button onClick={finish} disabled={busy || recorder.recording || lines.length < 2} className={styles.ghost}>
          Finish &amp; get feedback <Icon name="arrow" size={18} />
        </button>
        <p role="status" aria-live="polite" className={styles.status}>{message}</p>
      </div>
    </main>
  );
}

function InterviewReport({ feedback }: { feedback: InterviewFeedback }) {
  return (
    <section className={`${styles.card} ${styles.section}`} aria-labelledby="interview-heading">
      <div className={styles.resultHead}>
        <ScoreRing score={feedback.readiness} size={110} />
        <div>
          <h2 id="interview-heading">Interview readiness</h2>
          {feedback.verdict && <p>{feedback.verdict}</p>}
        </div>
      </div>
      {feedback.strengths.length > 0 && (
        <>
          <h3>Strengths</h3>
          <ul className={styles.list}>
            {feedback.strengths.map((s, i) => (
              <li key={i} className={`${styles.mistakeLine} ${styles.good}`}><Icon name="check" size={16} />{s}</li>
            ))}
          </ul>
        </>
      )}
      {feedback.weaknesses.length > 0 && (
        <>
          <h3>Areas to work on</h3>
          <ul className={styles.list}>
            {feedback.weaknesses.map((w, i) => (
              <li key={i} className={styles.mistake}>
                <strong>{w.area}</strong>
                {w.detail && <span>{w.detail}</span>}
                {w.improve && <span className={`${styles.mistakeLine} ${styles.good}`}><Icon name="sparkles" size={16} />{w.improve}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
