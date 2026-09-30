// Free edition tracks, generated from a closed spline. Produces the original LEV layout:
// 320x200 pixels + 768-byte palette + 46-byte trailer (start positions, finish line, checkpoints).

import { Bitmap, noise2, fbm, ramp, rng, pack } from "./raster.js";
import { IDX, basePalette } from "./sprites.js";

const W = 320;
const H = 200;
const ROAD_R = 13; // half width: 26 px of asphalt, like a two-car-wide circuit
const NEAR = 44; // distance field is only computed this close to the road

// ---------------------------------------------------------------- themes

const THEMES = {
  lake: {
    ground: [[7, 19, 6], [14, 32, 9], [24, 44, 14], [34, 52, 20]],
    verge: [[5, 13, 4], [10, 22, 7]],
    foliage: [[3, 11, 5], [9, 24, 8], [20, 40, 13], [34, 52, 22]],
    water: [[3, 9, 22], [8, 20, 36], [18, 36, 48], [44, 56, 62]],
    rock: [[12, 12, 14], [30, 30, 32], [50, 50, 52]],
    sand: [[28, 22, 11], [44, 36, 20], [56, 50, 34]],
    shade: [[3, 8, 3], [7, 15, 5]],
    asphalt: [30, 31, 33],
    aggregate: [36, 37, 39],
    rubber: [[17, 17, 19], [3, 3, 4]],
    accents: [[63, 56, 10], [60, 60, 60], [44, 22, 54], [58, 16, 14], [30, 18, 8], [17, 10, 5], [40, 26, 12]],
  },
  snow: {
    ground: [[36, 40, 49], [46, 50, 57], [55, 58, 62], [62, 63, 63]],
    verge: [[40, 44, 54], [63, 63, 63]],
    foliage: [[2, 9, 8], [7, 19, 14], [16, 30, 24], [52, 57, 61]],
    water: [[30, 42, 54], [40, 52, 60], [50, 58, 63], [60, 63, 63]],
    rock: [[14, 15, 18], [30, 32, 36], [46, 48, 52]],
    sand: [[22, 20, 18], [34, 32, 30], [44, 42, 40]],
    shade: [[24, 28, 40], [32, 36, 48]],
    asphalt: [26, 28, 32],
    aggregate: [33, 35, 39],
    rubber: [[16, 17, 20], [3, 3, 5]],
    accents: [[42, 9, 7], [54, 16, 11], [63, 52, 18], [40, 44, 54], [20, 18, 18], [28, 18, 10], [60, 61, 63]],
  },
};

function themePalette(t) {
  const P = basePalette();
  P.gradient(IDX.GROUND, 32, t.ground);
  P.gradient(IDX.VERGE, 6, t.verge);
  P.gradient(IDX.FOLIAGE, 16, t.foliage);
  P.gradient(IDX.WATER, 16, t.water);
  P.gradient(IDX.ROCK, 16, t.rock);
  P.gradient(IDX.SAND, 16, t.sand);
  P.gradient(IDX.SHADE, 8, t.shade);
  P.set(IDX.ASPHALT, ...t.asphalt);
  P.gradient(IDX.ASPHALT + 1, 6, t.rubber);
  P.set(IDX.AGGREGATE, ...t.aggregate);
  t.accents.forEach((c, i) => P.set(IDX.ACCENT + i, ...c));
  return P;
}

// ---------------------------------------------------------------- geometry

// Closed Catmull-Rom spline sampled roughly every 1.5 px
function centreline(points) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function analyse(pts) {
  const n = pts.length;
  const arc = new Float32Array(n + 1);
  const ang = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    arc[i + 1] = arc[i] + Math.hypot(x2 - x1, y2 - y1);
    ang[i] = Math.atan2(y2 - y1, x2 - x1);
  }
  // signed curvature (radians per px) over a ~12 px window
  const curv = new Float32Array(n);
  const K = 8;
  for (let i = 0; i < n; i++) {
    let d = ang[(i + K) % n] - ang[(i - K + n) % n];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const len = arc[i + K <= n ? i + K : i + K - n] - arc[i - K >= 0 ? i - K : i - K + n];
    curv[i] = d / (len > 0 ? len : (arc[n] * 2 * K) / n);
  }
  return { arc, ang, curv, length: arc[n] };
}

// Distance from every pixel to the centreline (only within NEAR px), with the nearest sample
function distanceField(pts) {
  const n = pts.length;
  const CELL = 16;
  const cw = Math.ceil(W / CELL);
  const ch = Math.ceil(H / CELL);
  const cells = Array.from({ length: cw * ch }, () => []);
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const cx0 = Math.max(0, Math.floor((Math.min(x1, x2) - NEAR) / CELL));
    const cx1 = Math.min(cw - 1, Math.floor((Math.max(x1, x2) + NEAR) / CELL));
    const cy0 = Math.max(0, Math.floor((Math.min(y1, y2) - NEAR) / CELL));
    const cy1 = Math.min(ch - 1, Math.floor((Math.max(y1, y2) + NEAR) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) cells[cy * cw + cx].push(i);
  }
  const dist = new Float32Array(W * H).fill(Infinity);
  const seg = new Int32Array(W * H).fill(-1);
  const side = new Int8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const list = cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)];
      const px = x + 0.5;
      const py = y + 0.5;
      let best = Infinity;
      let bi = -1;
      let bs = 0;
      for (const i of list) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % n];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
        const ex = px - (x1 + t * dx);
        const ey = py - (y1 + t * dy);
        const d = ex * ex + ey * ey;
        if (d < best) {
          best = d;
          bi = i;
          bs = dx * ey - dy * ex;
        }
      }
      if (bi >= 0 && best <= NEAR * NEAR) {
        dist[y * W + x] = Math.sqrt(best);
        seg[y * W + x] = bi;
        side[y * W + x] = bs >= 0 ? 1 : -1;
      }
    }
  return { dist, seg, side };
}

// Vertical run of road pixels at column x that contains (or is nearest to) hintY
function runAt(dist, x, hintY, r) {
  let y = Math.round(hintY);
  if (!(dist[y * W + x] <= r)) {
    for (let k = 1; k < 30; k++) {
      if (dist[(y - k) * W + x] <= r) {
        y -= k;
        break;
      }
      if (dist[(y + k) * W + x] <= r) {
        y += k;
        break;
      }
    }
  }
  let y1 = y;
  let y2 = y;
  while (y1 > 0 && dist[(y1 - 1) * W + x] <= r) y1--;
  while (y2 < H - 1 && dist[(y2 + 1) * W + x] <= r) y2++;
  return [y1, y2];
}

// ---------------------------------------------------------------- scenery

function roundTree(bmp, x, y, r, P, jitter) {
  // cast shadow down-right, then a shaded canopy lit from the top-left
  bmp.fillEllipse(x + r * 0.45, y + r * 0.45, r * 1.05, r * 0.95, (px, py) => ramp(IDX.SHADE, 8, 0.2, px, py));
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++)
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const dx = (px + 0.5 - x) / r;
      const dy = (py + 0.5 - y) / r;
      const rr = dx * dx + dy * dy;
      const edge = 1 + 0.18 * (jitter(px * 0.5, py * 0.5) - 0.5);
      if (rr > edge) continue;
      const light = 0.62 - 0.42 * (dx + dy) * 0.7 - 0.3 * rr + 0.35 * (jitter(px * 0.9, py * 0.9) - 0.5);
      bmp.set(px, py, ramp(P, 13, light, px, py));
    }
}

function pineTree(bmp, x, y, r, jitter) {
  bmp.fillEllipse(x + r * 0.6, y + r * 0.5, r * 1.1, r * 0.9, (px, py) => ramp(IDX.SHADE, 8, 0.1, px, py));
  // star-shaped canopy seen from above: needles radiate, snow sits on the lit side
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++)
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const d = Math.hypot(dx, dy) / r;
      const a = Math.atan2(dy, dx);
      const spikes = 0.78 + 0.22 * Math.cos(a * 8 + x);
      if (d > spikes) continue;
      const lit = -(dx + dy) / (r * 1.4);
      let t = 0.35 + 0.35 * lit + 0.25 * (jitter(px * 0.8, py * 0.8) - 0.5) - 0.2 * d;
      if (lit > 0.25 && jitter(px * 1.7, py * 1.7) > 0.45) t = 0.93 + 0.07 * lit;
      bmp.set(px, py, ramp(IDX.FOLIAGE, 16, t, px, py));
    }
}

function rock(bmp, x, y, r, jitter) {
  bmp.fillEllipse(x + 1.5, y + 1.5, r, r * 0.8, (px, py) => ramp(IDX.SHADE, 8, 0.15, px, py));
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++)
    for (let px = Math.floor(x - r * 1.3); px <= Math.ceil(x + r * 1.3); px++) {
      const dx = (px + 0.5 - x) / (r * 1.25);
      const dy = (py + 0.5 - y) / r;
      const rr = dx * dx + dy * dy;
      if (rr > 0.85 + 0.3 * jitter(px * 0.7, py * 0.7)) continue;
      const t = 0.55 - 0.4 * (dx + dy) * 0.6 - 0.25 * rr + 0.2 * (jitter(px * 1.3, py * 1.3) - 0.5);
      bmp.set(px, py, ramp(IDX.ROCK, 16, t, px, py));
    }
}

function lake(bmp, spec, dist, jitter, frozen) {
  const { cx, cy, rx, ry } = spec;
  const inside = (x, y) => {
    const a = Math.atan2(y - cy, x - cx);
    const wob = 1 + 0.12 * (jitter(Math.cos(a) * 3 + 50, Math.sin(a) * 3 + 50) - 0.5) * 2;
    return Math.hypot((x - cx) / rx, (y - cy) / ry) / wob;
  };
  for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++)
    for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
      if (!bmp.in(x, y) || dist[y * W + x] <= ROAD_R + 6) continue;
      const q = inside(x + 0.5, y + 0.5);
      if (q > 1.12) continue;
      if (q > 1.0) {
        bmp.set(x, y, ramp(IDX.SAND, 16, 0.35 + 0.5 * (1.12 - q) * 8 * 0.12 + 0.2 * jitter(x, y), x, y));
        continue;
      }
      let t = frozen ? 0.25 + 0.45 * q + 0.25 * (jitter(x * 0.3, y * 0.3) - 0.5) : 0.1 + 0.55 * q * q;
      if (!frozen && ((x * 7 + y * 13) % 97 === 0 || (jitter(x * 0.6, y * 2.2) > 0.82 && q < 0.85))) t = 0.9;
      bmp.set(x, y, ramp(IDX.WATER, 16, t, x, y));
    }
  if (frozen) {
    // cracks in the ice
    const r = rng(7);
    for (let k = 0; k < 5; k++) {
      let x = cx + (r() - 0.5) * rx;
      let y = cy + (r() - 0.5) * ry;
      let a = r() * Math.PI * 2;
      for (let s = 0; s < 14; s++) {
        if (inside(x, y) < 0.92) bmp.set(x, y, IDX.WATER + 3);
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a);
        y += Math.sin(a);
      }
    }
  }
}

function jetty(bmp, x, y, len) {
  for (let i = 0; i < len; i++)
    for (let w = 0; w < 5; w++) bmp.set(x + i, y + w, i % 3 === 2 ? IDX.ACCENT + 5 : IDX.ACCENT + 4);
  for (let i = 0; i < len; i++) bmp.set(x + i, y + 5, IDX.SHADE + 1);
}

function cabin(bmp, x, y) {
  const A = IDX.ACCENT;
  bmp.fillRect(x + 3, y + 3, 26, 18, IDX.SHADE + 2); // shadow
  bmp.fillRect(x, y + 14, 24, 4, A + 0); // front wall (dark red)
  bmp.fillRect(x + 3, y + 15, 3, 2, A + 2); // lit windows
  bmp.fillRect(x + 17, y + 15, 3, 2, A + 2);
  bmp.fillRect(x + 10, y + 14, 4, 4, A + 5); // door
  for (let yy = 0; yy < 14; yy++)
    for (let xx = -1; xx < 25; xx++) bmp.set(x + xx, y + yy, yy < 7 ? A + 6 : A + 3); // snowy roof: lit / shaded half
  bmp.fillRect(x - 1, y + 6, 26, 1, A + 4); // ridge
  bmp.fillRect(x + 17, y + 2, 3, 3, A + 4); // chimney
  bmp.fillRect(x + 18, y + 1, 1, 1, A + 3);
}

// ---------------------------------------------------------------- track builder

export function buildTrack(spec) {
  const theme = THEMES[spec.theme];
  const P = themePalette(theme);
  const bmp = new Bitmap(W, H);
  const pts = centreline(spec.points);
  const { arc, curv, length } = analyse(pts);
  const { dist, seg, side } = distanceField(pts);
  const n1 = noise2(spec.seed);
  const n2 = noise2(spec.seed + 1);
  const r = rng(spec.seed + 2);
  const frozen = spec.theme === "snow";

  // ground
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let t = 0.15 + 0.7 * fbm(n1, x / 26, y / 26, 3) + 0.25 * (n2(x / 3, y / 3) - 0.5);
      if (frozen) t = 0.35 + 0.55 * fbm(n1, x / 40, y / 40, 2) + 0.15 * (n2(x / 5, y / 9) - 0.5);
      bmp.set(x, y, ramp(IDX.GROUND, 32, t, x, y));
    }
  // speckles: flowers on grass, footprints/twigs on snow
  for (let k = 0; k < (frozen ? 90 : 260); k++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * 186);
    if (dist[y * W + x] > ROAD_R + 5) bmp.set(x, y, frozen ? IDX.ROCK + 6 : IDX.ACCENT + Math.floor(r() * 4));
  }

  // water
  if (spec.lake) lake(bmp, spec.lake, dist, n2, frozen);
  if (spec.jetty) jetty(bmp, ...spec.jetty);
  if (spec.cabin) cabin(bmp, ...spec.cabin);

  // scatter trees and rocks where there is room
  const taken = [];
  if (spec.lake) taken.push([spec.lake.cx, spec.lake.cy, Math.max(spec.lake.rx, spec.lake.ry) + 6]);
  if (spec.cabin) taken.push([spec.cabin[0] + 12, spec.cabin[1] + 9, 20]);
  const clear = (x, y, rad) => {
    if (x < rad || x > W - rad || y < rad || y > 186 - rad) return false;
    for (let dy = -rad; dy <= rad; dy += 2)
      for (let dx = -rad; dx <= rad; dx += 2) {
        const o = Math.round(y + dy) * W + Math.round(x + dx);
        if (dist[o] <= ROAD_R + 6) return false;
      }
    return taken.every(([tx, ty, tr]) => Math.hypot(tx - x, ty - y) > tr + rad);
  };
  for (let k = 0, placed = 0; k < 3000 && placed < spec.trees; k++) {
    const rad = 4 + r() * (frozen ? 4 : 5);
    const x = r() * W;
    const y = r() * H;
    if (!clear(x, y, rad + 1)) continue;
    taken.push([x, y, rad * 0.8]);
    placed++;
    if (frozen) pineTree(bmp, x, y, rad, n2);
    else roundTree(bmp, x, y, rad, IDX.FOLIAGE + 1, n2);
  }
  for (let k = 0, placed = 0; k < 2000 && placed < spec.rocks; k++) {
    const rad = 2 + r() * 3;
    const x = r() * W;
    const y = r() * H;
    if (!clear(x, y, rad + 1)) continue;
    taken.push([x, y, rad]);
    placed++;
    rock(bmp, x, y, rad, n1);
  }

  // road: verge, edge, kerbs, asphalt
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = y * W + x;
      const d = dist[o];
      if (d > ROAD_R + 4) continue;
      const i = seg[o];
      const c = curv[i];
      const inside = Math.sign(c) === side[o];
      if (d > ROAD_R + 1.2) {
        bmp.set(x, y, frozen ? ramp(IDX.VERGE, 6, 0.55 + 0.45 * n2(x / 2, y / 2), x, y) : ramp(IDX.VERGE, 6, 0.2 + 0.5 * n2(x / 2, y / 2), x, y));
      } else if (Math.abs(c) > 1 / 48 && inside && d > ROAD_R - 2.6) {
        bmp.set(x, y, Math.floor(arc[i] / 4) % 2 ? IDX.KERB_RED : IDX.KERB_WHITE);
      } else if (d > ROAD_R - 0.4) {
        bmp.set(x, y, IDX.EDGE);
      } else {
        // plain base so every skid shade shows; sparse light aggregate for texture
        const t = fbm(n1, x / 4, y / 4, 2);
        bmp.set(x, y, (t > 0.7 && r() < 0.35) || r() < 0.025 ? IDX.AGGREGATE : IDX.ASPHALT);
      }
    }

  // finish line, grid, checkpoints
  const fx = spec.finish.x;
  const [fy1, fy2] = runAt(dist, fx, spec.finish.y, ROAD_R + 1.2);
  const fcy = Math.round((fy1 + fy2) / 2);
  for (let y = fy1; y <= fy2; y++)
    for (let x = fx - 2; x <= fx + 1; x++)
      if (dist[y * W + x] <= ROAD_R - 0.4) bmp.set(x, y, ((x >> 1) + (y >> 1)) & 1 ? IDX.CHECK_BLACK : IDX.CHECK_WHITE);
  const starts = [
    [fx - 17, fcy + 7],
    [fx - 17, fcy - 7],
  ];
  for (const [sx, sy] of starts) {
    bmp.line(sx - 6, sy - 5, sx + 10, sy - 5, IDX.PAINT);
    bmp.line(sx - 6, sy + 5, sx + 10, sy + 5, IDX.PAINT);
    bmp.line(sx - 6, sy - 5, sx - 6, sy + 5, IDX.PAINT);
  }
  const cps = spec.checkpoints.map(({ x, y }) => [x, ...runAt(dist, x, y, ROAD_R + 1.2)]);

  // HUD strip
  bmp.fillRect(0, 191, W, 1, IDX.HUD_EDGE);
  bmp.fillRect(0, 192, W, 8, IDX.HUD_BAR);

  // trailer: car1 xy, car2 xy, numCP, 3 unused words, finish line, checkpoints 1..4 (x, y1, y2)
  const words = new Uint16Array(23);
  words.set([starts[0][0], starts[0][1], starts[1][0], starts[1][1], cps.length, 0, 0, 0, fx, fy1, fy2]);
  cps.forEach((cp, k) => words.set(cp, 11 + k * 3));
  const trailer = new Uint8Array(words.buffer);

  // sanity: the finish must be crossed going right, like the original grids
  const si = seg[fcy * W + fx];
  const dirX = pts[(si + 1) % pts.length][0] - pts[si][0];
  if (!(dirX > 0)) throw new Error(`track "${spec.name}": finish line is not on a left-to-right straight`);

  return { data: pack(bmp, P, trailer), length, starts, finish: [fx, fy1, fy2], cps, pts };
}

// ---------------------------------------------------------------- the free edition's tracks

export const TRACKS = [
  {
    name: "SJÖKANTEN RACEWAY",
    theme: "lake",
    seed: 2401,
    points: [
      [48, 32], [150, 30], [248, 32], [290, 50], [298, 94], [276, 124], [232, 116], [198, 128],
      [202, 156], [168, 170], [92, 170], [46, 156], [26, 116], [30, 62],
    ],
    finish: { x: 150, y: 30 },
    checkpoints: [
      { x: 252, y: 120 },
      { x: 128, y: 170 },
    ],
    lake: { cx: 112, cy: 100, rx: 42, ry: 29 },
    jetty: [70, 96, 14],
    trees: 34,
    rocks: 9,
  },
  {
    name: "VINTERRINGEN",
    theme: "snow",
    seed: 2402,
    points: [
      [52, 162], [140, 164], [230, 162], [284, 146], [296, 108], [262, 82], [206, 94], [168, 70],
      [120, 34], [60, 26], [28, 60], [46, 100], [30, 134],
    ],
    finish: { x: 140, y: 164 },
    checkpoints: [
      { x: 236, y: 88 },
      { x: 92, y: 30 },
      { x: 186, y: 82 },
    ],
    lake: { cx: 236, cy: 128, rx: 20, ry: 13 },
    cabin: [150, 110],
    trees: 38,
    rocks: 6,
  },
];
