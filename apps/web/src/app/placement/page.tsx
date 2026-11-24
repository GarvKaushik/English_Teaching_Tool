"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { RecordButton } from "@/components/RecordButton";
import { ScoreGrid, ScoreRing, XpBadge } from "@/components/Results";
import { api, errorText, useRequireLogin } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import styles from "../ui.module.css";

type Content = { questions: string[]; max_seconds: number };
type Result = {
  level: string;
  score: number;
  scores: Record<string, number>;
  transcripts: string[];
  feedback: string;
  xp: number;
};

export default function Placement() {
  useRequireLogin();
  const [content, setContent] = useState<Content | null>(null);
  const [recordings, setRecordings] = useState<Blob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const step = recordings.length; // 0-2: questions, 3: done
  const total = content?.questions.length ?? 3;
  const maxSeconds = content?.max_seconds ?? 45;
  const recorder = useRecorder(maxSeconds, (wav) => setRecordings((r) => [...r, wav]), setMessage);

  useEffect(() => {
    api<Content>("/v1/placement").then(setContent).catch((e) => setMessage(errorText(e)));
  }, []);

  async function submit() {
    setSubmitting(true);
    setMessage("");
    const form = new FormData();
    recordings.forEach((wav, i) => form.append(`answer_${i}`, wav, "answer.wav"));
    try {
      setResult(await api<Result>("/v1/placement", { method: "POST", body: form }));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!content) return <main className={styles.main}><p role="status" className={styles.status}>{message || "Loading…"}</p></main>;

  if (result) {
    return (
      <main className={styles.main}>
        <section className={`${styles.card} ${styles.result}`} aria-label="Your placement result">
          <div className={styles.resultHead}>
            <ScoreRing score={result.score} />
            <div>
              <span className={styles.eyebrow}>Your level</span>
              <h1><span className={styles.levelBadge}>{result.level}</span></h1>
              <p>{result.feedback}</p>
              <XpBadge xp={result.xp} />
            </div>
          </div>
          <ScoreGrid scores={result.scores} />
        </section>

        <section className={styles.section} aria-labelledby="answers-heading">
          <h2 id="answers-heading">What we heard</h2>
          {content.questions.map((q, i) => (
            <div key={i} className={styles.section}>
              <strong>{q}</strong>
              <p className={styles.quote}>“{result.transcripts[i]}”</p>
            </div>
          ))}
        </section>
        <div className={styles.actions}>
          <Link href="/roleplay" className={styles.button}>Practise a conversation <Icon name="arrow" size={18} /></Link>
          <Link href="/" className={styles.secondary}>Back to home</Link>
        </div>
      </main>
    );
  }

  const prompt = step < total ? content.questions[step] : null;

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>Placement test</span>
        <h1>{prompt ? "Answer this question" : "All done!"}</h1>
        <p className={styles.muted}>
          {prompt ? `Answer out loud in a few sentences. You have up to ${maxSeconds} seconds.` : "Submit your answers to see your level."}
        </p>
      </div>

      <ol className={styles.steps} aria-label={`Step ${Math.min(step + 1, total)} of ${total}`}>
        {content.questions.map((_, i) => (
          <li key={i} className={i < step ? styles.stepDone : i === step ? styles.stepCurrent : ""} aria-current={i === step ? "step" : undefined}>Question {i + 1}</li>
        ))}
      </ol>

      {prompt && (
        <div className={styles.sentence}>
          <div className={styles.sentenceMeta}><span>Question {step + 1}</span><span>Step {step + 1} of {total}</span></div>
          {prompt}
        </div>
      )}

      {prompt ? (
        <RecordButton
          recording={recorder.recording}
          maxSeconds={maxSeconds}
          onStart={() => { setMessage(""); recorder.start(); }}
          onStop={recorder.stop}
          label="Tap and answer"
        />
      ) : (
        <div className={`${styles.card} ${styles.cardSoft} ${styles.reveal}`}>
          <Icon name="check" size={32} style={{ color: "var(--good)" }} />
          <p>You answered all {total} questions.</p>
          <button onClick={submit} disabled={submitting} className={styles.button}>
            {submitting ? <><Icon name="loader" className={styles.spin} />Checking… (about 10 seconds)</> : <>See my level <Icon name="arrow" size={18} /></>}
          </button>
        </div>
      )}

      <div className={`${styles.actions} ${styles.actionsCenter}`}>
        {step > 0 && !recorder.recording && !submitting && (
          <button onClick={() => setRecordings((r) => r.slice(0, -1))} className={styles.ghost}><Icon name="retry" size={18} />Redo last step</button>
        )}
      </div>
      <p role="status" aria-live="polite" className={styles.status}>
        {recorder.recording ? "Recording… tap stop when you finish." : message}
      </p>
    </main>
  );
}
