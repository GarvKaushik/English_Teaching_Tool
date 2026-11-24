"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icons";
import { ScoreRing, XpBadge } from "@/components/Results";
import { errorText, postJson, useRequireLogin, type Mistake } from "@/lib/api";
import styles from "../ui.module.css";

type Question = { source: "grammar" | "vocabulary"; question: string; options: string[] };
type Quiz = { id: number; questions: Question[] };
type Result = {
  correct: number;
  total: number;
  score: number;
  xp: number;
  results: { chosen: number | null; answer: number; correct: boolean; explanation: string }[];
  mistakes: Mistake[];
};

export default function QuizPage() {
  useRequireLogin();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function start() {
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const q = await postJson<Quiz>("/v1/quiz", {});
      setQuiz(q);
      setAnswers(q.questions.map(() => null));
      setCurrent(0);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!quiz) return;
    setBusy(true);
    try {
      setResult(await postJson<Result>(`/v1/quiz/${quiz.id}`, { answers }));
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const choose = (i: number) => setAnswers((a) => a.map((v, j) => (j === current ? i : v)));
  const q = quiz?.questions[current];
  const last = quiz ? current === quiz.questions.length - 1 : false;

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <span className={styles.eyebrow}>MCQ Quiz</span>
        <h1>Grammar and vocabulary</h1>
        <p className={styles.muted}>Ten questions picked for your level. New questions every time.</p>
      </div>

      {!quiz && (
        <div className={`${styles.actions} ${styles.actionsCenter}`}>
          <button className={styles.button} onClick={start} disabled={busy}>
            {busy ? <><Icon name="loader" className={styles.spin} />Preparing questions…</> : <>Start quiz <Icon name="arrow" size={18} /></>}
          </button>
        </div>
      )}

      {quiz && q && !result && (
        <section className={styles.card} aria-labelledby="question">
          <div className={styles.sentenceMeta}>
            <span>Question {current + 1} of {quiz.questions.length}</span>
            <span style={{ textTransform: "capitalize" }}>{q.source}</span>
          </div>
          <h2 id="question">{q.question}</h2>
          <div className={styles.list} role="radiogroup" aria-labelledby="question">
            {q.options.map((option, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={answers[current] === i}
                className={answers[current] === i ? styles.button : styles.secondary}
                style={{ justifyContent: "flex-start", textAlign: "left", width: "100%" }}
                onClick={() => choose(i)}
              >
                {String.fromCharCode(65 + i)}. {option}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={() => setCurrent((c) => c - 1)} disabled={current === 0}>Back</button>
            {last ? (
              <button className={styles.button} onClick={submit} disabled={busy || answers.some((a) => a === null)}>
                {busy ? <Icon name="loader" className={styles.spin} /> : "Submit"}
              </button>
            ) : (
              <button className={styles.button} onClick={() => setCurrent((c) => c + 1)} disabled={answers[current] === null}>
                Next <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
        </section>
      )}

      {quiz && result && (
        <section className={styles.result} aria-label="Your quiz result">
          <div className={`${styles.card} ${styles.resultHead}`}>
            <ScoreRing score={result.score} />
            <div>
              <h2>{result.correct} of {result.total} correct</h2>
              <XpBadge xp={result.xp} />
            </div>
          </div>

          <ol className={styles.list}>
            {quiz.questions.map((question, i) => {
              const r = result.results[i];
              return (
                <li key={i} className={styles.mistake}>
                  <strong>{i + 1}. {question.question}</strong>
                  <span className={`${styles.mistakeLine} ${styles.good}`}><Icon name="check" size={16} title="Correct answer" />{question.options[r.answer]}</span>
                  {!r.correct && r.chosen !== null && (
                    <span className={`${styles.mistakeLine} ${styles.bad}`}><Icon name="x" size={16} title="Your answer" /><span className={styles.strike}>{question.options[r.chosen]}</span></span>
                  )}
                  {!r.correct && r.explanation && <span className={styles.muted}>{r.explanation}</span>}
                </li>
              );
            })}
          </ol>

          {result.mistakes.length > 0 && (
            <p className={styles.note}><Icon name="book" size={18} />Your wrong answers were added to your mistakes to review.</p>
          )}
          <div className={styles.actions}>
            <button className={styles.button} onClick={start} disabled={busy}><Icon name="retry" size={18} />New quiz</button>
            <Link href="/" className={styles.secondary}>Home</Link>
          </div>
        </section>
      )}
      <p role="alert" className={styles.error}>{message}</p>
    </main>
  );
}
