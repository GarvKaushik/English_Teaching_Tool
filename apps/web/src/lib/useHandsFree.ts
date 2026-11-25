"use client";

import { useEffect, useRef, useState } from "react";
import { startCapture } from "./wav";

const CALIBRATE_SECONDS = 0.25; // room noise is measured first, so the threshold suits the room
const MIN_LEVEL = 0.012; // RMS below this is silence even in a quiet room
const SPEECH_SECONDS = 0.3; // this much loud sound counts as speech (a click or cough doesn't)
const END_SILENCE_SECONDS = 1.4; // silence after speech that ends the turn
const NO_SPEECH_SECONDS = 10; // give up if nothing is said

/** Listen to the microphone and send the WAV to onWav when the learner stops talking, with no button press.
 *  onSilence runs when nothing was said; problems go to onError. */
export function useHandsFree(maxSeconds: number, onWav: (wav: Blob) => void, onSilence: () => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const finish = useRef<(() => Promise<Blob>) | null>(null);
  const starting = useRef(false);
  const left = useRef(false);
  const callbacks = useRef({ onWav, onSilence, onError });
  useEffect(() => {
    callbacks.current = { onWav, onSilence, onError };
  });

  async function end(send: boolean) {
    const done = finish.current;
    finish.current = null;
    if (!done) return;
    setListening(false);
    try {
      const wav = await done();
      if (send) callbacks.current.onWav(wav);
    } catch (e) {
      if (send) callbacks.current.onError(e instanceof Error ? e.message : "Recording failed.");
    }
  }

  async function start() {
    if (finish.current || starting.current) return;
    starting.current = true;
    let elapsed = 0, noise = 0, noiseSamples = 0, loud = 0, lastLoud = 0;
    const onChunk = (samples: Float32Array, rate: number) => {
      if (!finish.current) return;
      const dt = samples.length / rate;
      const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
      elapsed += dt;
      if (elapsed < CALIBRATE_SECONDS) {
        noise = (noise * noiseSamples + rms) / ++noiseSamples;
        return;
      }
      if (rms > Math.max(MIN_LEVEL, noise * 3)) {
        loud += dt;
        lastLoud = elapsed;
      }
      const heard = loud >= SPEECH_SECONDS;
      if (elapsed >= maxSeconds || (heard && elapsed - lastLoud > END_SILENCE_SECONDS)) end(true);
      else if (!heard && elapsed > NO_SPEECH_SECONDS) end(false).then(() => callbacks.current.onSilence());
    };
    try {
      finish.current = await startCapture(onChunk);
    } catch (e) {
      starting.current = false;
      callbacks.current.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access is needed. Please allow it in your browser and try again."
          : `Could not start recording: ${e instanceof Error ? e.message : e}`,
      );
      return;
    }
    starting.current = false;
    if (left.current) return void end(false); // the page closed while the microphone was opening
    setListening(true);
  }

  // Release the microphone when leaving the page.
  useEffect(() => {
    left.current = false; // React's dev double-mount runs the cleanup once before the real mount
    return () => {
      left.current = true;
      void end(false);
    };
  }, []);

  return { listening, start, send: () => end(true), cancel: () => end(false) };
}
