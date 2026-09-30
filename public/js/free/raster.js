// Small indexed-colour drawing toolkit used to generate the free edition's graphics.
// Everything is deterministic (seeded) so every player sees the same tracks and pictures.

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise in [0,1), tiling every 256 units
export function noise2(seed) {
  const r = rng(seed);
  const g = new Float32Array(256 * 256);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = s(x - xi);
    const fy = s(y - yi);
    const x0 = xi & 255;
    const y0 = yi & 255;
    const x1 = (x0 + 1) & 255;
    const y1 = (y0 + 1) & 255;
    const a = g[y0 * 256 + x0];
    const b = g[y0 * 256 + x1];
    const c = g[y1 * 256 + x0];
    const d = g[y1 * 256 + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// Fractal noise: octaves of noise2 at doubling frequency, normalised to [0,1)
export function fbm(n, x, y, octaves = 3) {
  let v = 0;
  let amp = 1;
  let tot = 0;
  for (let o = 0; o < octaves; o++) {
    v += n(x, y) * amp;
    tot += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return v / tot;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Map t in [0,1] onto palette ramp base..base+n-1 with 4x4 ordered dithering
export function ramp(base, n, t, x, y) {
  const v = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(v);
  const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  return base + Math.min(n - 1, i + (v - i > th ? 1 : 0));
}

export class Bitmap {
  constructor(w, h, fill = 0) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h).fill(fill);
  }

  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    return this.in(x, y) ? this.px[y * this.w + x] : -1;
  }

  // c: palette index, or function (x, y, old) -> index | undefined (skip)
  set(x, y, c) {
    x |= 0;
    y |= 0;
    if (!this.in(x, y)) return;
    const o = y * this.w + x;
    const v = typeof c === "function" ? c(x, y, this.px[o]) : c;
    if (v !== undefined && v !== null) this.px[o] = v;
  }

  fillRect(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  fillEllipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }

  // Even-odd scanline polygon fill; pts = [[x,y], ...]
  fillPoly(pts, c) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if (y1 <= yc !== y2 <= yc) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
  }

  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  }
}

// Palette helpers (6-bit VGA components)
export class Palette {
  constructor() {
    this.p = new Uint8Array(768);
  }

  set(i, r, g, b) {
    this.p[i * 3] = Math.max(0, Math.min(63, Math.round(r)));
    this.p[i * 3 + 1] = Math.max(0, Math.min(63, Math.round(g)));
    this.p[i * 3 + 2] = Math.max(0, Math.min(63, Math.round(b)));
  }

  // Multi-stop gradient over entries base..base+n-1; stops = [[r,g,b], ...] evenly spaced
  gradient(base, n, stops) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      const f = t - k;
      const a = stops[k];
      const b = stops[k + 1] || a;
      this.set(base + i, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    }
  }
}

// Encode a JS string (with Å Ä Ö) as the CP437 byte string the engine uses
export function cp437(s) {
  const map = { "Å": "\x8f", "Ä": "\x8e", "Ö": "\x99", "å": "\x86", "ä": "\x84", "ö": "\x94" };
  return [...s].map((c) => map[c] ?? c).join("");
}

// Pack a 320x200 picture + palette (+ optional trailer) into the original file layout
export function pack(bitmap, palette, trailer = null) {
  const out = new Uint8Array(64768 + (trailer ? 46 : 0));
  out.set(bitmap.px.subarray(0, 64000), 0);
  out.set(palette.p, 64000);
  if (trailer) out.set(trailer, 64768);
  return out;
}
