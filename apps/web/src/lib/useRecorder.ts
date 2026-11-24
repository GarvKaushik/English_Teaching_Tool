"use client";

import { useEffect, useRef, useState } from "react";
import { startCapture } from "./wav";

/** Record the microphone for up to maxSeconds; the WAV goes to onWav, problems to onError. */
export function useRecorder(maxSeconds: number, onWav: (wav: Blob) => void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const finish = useRef<(() => Promise<Blob>) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onWav, onError });
  useEffect(() => {
    callbacks.current = { onWav, onError };
  });

  async function stop() {
    if (timer.current) clearTimeout(timer.current);
    const done = finish.current;
    finish.current = null;
    if (!done) return;
    setRecording(false);
    try {
      callbacks.current.onWav(await done());
    } catch (e) {
      callbacks.current.onError(e instanceof Error ? e.message : "Recording failed.");
    }
  }

  async function start() {
    try {
      finish.current = await startCapture();
    } catch (e) {
      callbacks.current.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access is needed. Please allow it in your browser and try again."
          : `Could not start recording: ${e instanceof Error ? e.message : e}`,
      );
      return;
    }
    setRecording(true);
    timer.current = setTimeout(stop, maxSeconds * 1000);
  }

  return { recording, start, stop };
}
