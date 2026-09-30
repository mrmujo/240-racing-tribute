// Turbo Pascal 6 runtime semantics the original relies on.

// Round(): FPU fistp in round-to-nearest-even mode (returns LongInt).
export function round(x) {
  const r = Math.round(x);
  if (Math.abs(x - Math.trunc(x)) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

export const trunc = Math.trunc;

export const word = (v) => v & 0xffff;
export const int16 = (v) => ((v & 0xffff) << 16) >> 16;

// Str(r:w:d)
export function strReal(r, w = 0, d = 2) {
  let s = (Math.round(Math.abs(r) * 10 ** d) / 10 ** d).toFixed(d);
  if (r < 0 && Number(s) !== 0) s = "-" + s;
  return s.padStart(w, " ");
}

// Str(i)
export function strInt(i, w = 0) {
  return String(Math.trunc(i)).padStart(w, " ");
}

// System.Random / Randomize (TP6 linear congruential generator)
export class Rng {
  constructor(seed = (Date.now() & 0xffffffff) >>> 0) {
    this.seed = seed >>> 0;
  }

  next() {
    this.seed = (Math.imul(this.seed, 134775813) + 1) >>> 0;
    return this.seed;
  }

  // Random(n) for Word n: high word of the new seed scaled to 0..n-1
  random(n) {
    const hi = this.next() >>> 16;
    return Math.floor((hi * n) / 65536);
  }
}
