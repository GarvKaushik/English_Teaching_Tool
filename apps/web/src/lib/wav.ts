// shortcut: browser produces WAV so the API needs no ffmpeg; move conversion to the backend when the mobile app arrives.
export const TARGET_RATE = 16000;

/** Encode mono float samples (-1..1) as 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    const c = Math.max(-1, Math.min(1, s));
    v.setInt16(44 + i * 2, c < 0 ? c * 0x8000 : c * 0x7fff, true);
  });
  return buffer;
}

// Captures raw microphone samples, so no compressed format (webm/ogg/mp4) ever needs decoding.
const CAPTURE_WORKLET = `registerProcessor("capture", class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
});`;

/** Start recording the microphone. Call the returned function to stop and get a 16 kHz mono WAV.
 *  `onChunk` sees the raw samples as they arrive (used for hands-free voice detection). */
export async function startCapture(onChunk?: (samples: Float32Array, sampleRate: number) => void): Promise<() => Promise<Blob>> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  try {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    throw e;
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "capture");
  const chunks: Float32Array[] = [];
  node.port.onmessage = (e) => {
    chunks.push(e.data);
    onChunk?.(e.data, ctx.sampleRate);
  };
  source.connect(node);
  node.connect(ctx.destination); // outputs silence; keeps the node running in every browser

  return async () => {
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    await ctx.close();

    const length = chunks.reduce((n, c) => n + c.length, 0);
    if (length === 0) throw new Error("No audio was captured. Check your microphone and try again.");
    const samples = new Float32Array(length);
    let offset = 0;
    for (const c of chunks) {
      samples.set(c, offset);
      offset += c.length;
    }
    return new Blob([encodeWav(await resample(samples, rate), TARGET_RATE)], { type: "audio/wav" });
  };
}

async function resample(samples: Float32Array<ArrayBuffer>, rate: number): Promise<Float32Array> {
  if (rate === TARGET_RATE) return samples;
  const offline = new OfflineAudioContext(1, Math.ceil((samples.length * TARGET_RATE) / rate), TARGET_RATE);
  const buffer = offline.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(samples, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}
