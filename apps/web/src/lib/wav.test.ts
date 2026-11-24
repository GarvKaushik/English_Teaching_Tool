import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWav } from "./wav.ts";

test("encodeWav writes a 16 kHz mono PCM header the API accepts", () => {
  const v = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 16000));
  const text = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
  assert.equal(text(0), "RIFF");
  assert.equal(text(8), "WAVE");
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(40, true), 8);
  assert.deepEqual([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true)), [0, 32767, -32768, 32767]);
});
