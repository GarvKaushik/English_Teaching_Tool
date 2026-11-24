"use client";

import { useEffect, useState } from "react";
import styles from "@/app/ui.module.css";
import { Icon } from "./Icons";

type Props = {
  recording: boolean;
  busy?: boolean;
  disabled?: boolean;
  maxSeconds?: number;
  onStart: () => void;
  onStop: () => void;
  label?: string;
  stopLabel?: string;
  busyLabel?: string;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** One large mic button used on every speaking screen: idle, recording (with timer) and busy states. */
export function RecordButton({ recording, busy, disabled, maxSeconds, onStart, onStop, label = "Tap to record", stopLabel = "Tap to stop", busyLabel = "Scoring…" }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => {
      clearInterval(id);
      setElapsed(0);
    };
  }, [recording]);

  const text = recording ? stopLabel : busy ? busyLabel : label;

  return (
    <div className={styles.recorder}>
      <button
        type="button"
        className={`${styles.recordBtn} ${recording ? styles.recordingBtn : ""}`}
        onClick={recording ? onStop : onStart}
        disabled={!recording && (busy || disabled)}
        aria-label={text}
        aria-pressed={recording}
      >
        {busy && !recording ? <Icon name="loader" size={32} className={styles.spin} /> : <Icon name={recording ? "stop" : "mic"} size={32} />}
      </button>
      <span className={styles.recordLabel} aria-hidden="true">{text}</span>
      {recording && (
        <span className={styles.recordTime}>
          {clock(elapsed)}
          {maxSeconds ? <span className={styles.muted}> / {clock(maxSeconds)}</span> : null}
        </span>
      )}
    </div>
  );
}
