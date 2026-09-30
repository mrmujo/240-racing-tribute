// Free edition title picture (replaces 240BURN.BIN): a dusk scene with a boxy sedan seen from behind.
// The top palette entries 0xF0..0xFF are the menu text colours the engine uses.

import { Bitmap, Palette, noise2, ramp, rng, pack } from "./raster.js";
import { glyphRows } from "./font.js";

const SKY = 2; // 32 entries
const SUN = 34; // 16
const HILL = 50; // 8
const GROUND = 58; // 16
const PAINT = 74; // 8
const BODY = 82; // 16
const GLASS = 98; // 8
const TAIL = 106; // 8
const CHROME = 114; // 8
const TYRE = 122; // 4
const LOGO = 128; // 32
const OUTLINE = 160;
const LOGO_SHADOW = 161;
const STAR = 170; // 8
const PLATE = 180; // 4

function palette() {
  const P = new Palette();
  P.set(0, 0, 0, 0);
  P.set(1, 2, 2, 4); // font shadow
  P.gradient(SKY, 32, [[1, 2, 10], [6, 5, 22], [18, 7, 30], [36, 10, 32], [54, 22, 22], [62, 40, 16], [63, 52, 28]]);
  P.gradient(SUN, 16, [[63, 58, 36], [63, 46, 18], [62, 26, 14]]);
  P.gradient(HILL, 8, [[1, 1, 5], [8, 4, 16]]);
  P.gradient(GROUND, 16, [[2, 2, 5], [9, 7, 14], [20, 14, 24]]);
  P.gradient(PAINT, 8, [[30, 22, 12], [63, 52, 30]]);
  P.gradient(BODY, 16, [[1, 2, 4], [8, 10, 16], [22, 22, 34], [50, 36, 40]]);
  P.gradient(GLASS, 8, [[3, 4, 10], [22, 16, 34]]);
  P.gradient(TAIL, 8, [[18, 1, 2], [48, 6, 6], [63, 32, 22]]);
  P.gradient(CHROME, 8, [[8, 8, 12], [46, 42, 48]]);
  P.gradient(TYRE, 4, [[1, 1, 2], [6, 6, 8]]);
  P.gradient(LOGO, 32, [[63, 63, 50], [63, 54, 18], [63, 30, 8], [48, 8, 14]]);
  P.set(OUTLINE, 8, 2, 10);
  P.set(LOGO_SHADOW, 0, 0, 2);
  P.gradient(STAR, 8, [[20, 20, 34], [63, 63, 63]]);
  P.gradient(PLATE, 4, [[30, 30, 34], [58, 58, 60]]);
  // menu / scroller colours
  const ui = {
    0xf0: [40, 52, 63], 0xf1: [40, 40, 44], 0xf2: [24, 63, 30], 0xf3: [50, 50, 50], 0xf4: [50, 50, 50],
    0xf5: [34, 34, 42], 0xf6: [63, 40, 12], 0xf7: [56, 56, 58], 0xf8: [63, 22, 20], 0xf9: [63, 34, 56],
    0xfa: [22, 60, 63], 0xfb: [63, 58, 18], 0xfc: [34, 44, 63], 0xfd: [63, 63, 52], 0xfe: [63, 63, 63],
    0xff: [63, 63, 63],
  };
  for (const [i, c] of Object.entries(ui)) P.set(Number(i), ...c);
  return P;
}

const HORIZON = 118;

function sky(bmp, n) {
  const r = rng(99);
  for (let y = 0; y < HORIZON; y++)
    for (let x = 0; x < 320; x++) {
      const t = Math.pow(y / HORIZON, 1.35) + 0.04 * (n(x / 30, y / 12) - 0.5);
      bmp.set(x, y, ramp(SKY, 32, t, x, y));
    }
  for (let k = 0; k < 110; k++) {
    const x = Math.floor(r() * 320);
    const y = Math.floor(Math.pow(r(), 1.6) * 80);
    bmp.set(x, y, STAR + Math.floor(r() * 8 * (1 - y / 90)));
  }
}

function sun(bmp) {
  const cx = 160;
  const cy = HORIZON + 4;
  const R = 44;
  for (let y = cy - R; y < HORIZON; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R) continue;
      const k = HORIZON - y; // stripes get thicker towards the horizon
      if (k < 26 && k % 6 < Math.max(1, 4 - k / 7)) continue;
      bmp.set(x, y, ramp(SUN, 16, (y - (cy - R)) / R, x, y));
    }
}

function forest(bmp, n) {
  for (let x = 0; x < 320; x++) {
    const far = Math.abs(x - 160) / 160;
    let h = 4 + 16 * far * far + 6 * n(x / 14, 3);
    // individual pine tips
    const tip = (x * 7) % 11;
    h += tip < 3 ? 5 - tip * 1.5 : 0;
    for (let y = Math.floor(HORIZON - h); y <= HORIZON; y++) bmp.set(x, y, ramp(HILL, 8, (HORIZON - y) / 30, x, y));
  }
}

function ground(bmp, n) {
  const vx = 160;
  for (let y = HORIZON + 1; y < 200; y++) {
    const d = (y - HORIZON) / (200 - HORIZON); // 0 at horizon, 1 at bottom
    const half = 6 + d * 150;
    for (let x = 0; x < 320; x++) {
      const off = Math.abs(x - vx);
      let v;
      if (off <= half) {
        // asphalt with perspective lines: edge lines and centre dashes
        v = ramp(GROUND, 16, 0.25 + 0.35 * d + 0.12 * (n(x / 6, y / 3) - 0.5), x, y);
        if (Math.abs(off - half * 0.92) < 0.6 + d * 1.8) v = ramp(PAINT, 8, 0.2 + 0.6 * d, x, y);
        const z = 1 / (d + 0.02);
        if (off < 0.4 + d * 2 && Math.floor(z * 1.4) % 2 === 0) v = ramp(PAINT, 8, 0.3 + 0.7 * d, x, y);
      } else {
        v = ramp(GROUND, 16, 0.05 + 0.25 * d + 0.25 * (n(x / 5, y / 2) - 0.5), x, y);
      }
      bmp.set(x, y, v);
    }
  }
}

// Generic 1980s three-box sedan seen from behind, tail-lights on
function car(bmp, n) {
  const cx = 160;
  const shade = (t) => (x, y) => ramp(BODY, 16, t + 0.05 * (n(x / 3, y / 3) - 0.5), x, y);
  bmp.fillEllipse(cx, 187, 70, 6, TYRE); // shadow on the road
  // tyres
  bmp.fillRect(cx - 58, 170, 18, 19, TYRE + 1);
  bmp.fillRect(cx + 40, 170, 18, 19, TYRE + 1);
  // greenhouse (trapezoid) with rear window
  bmp.fillPoly([[cx - 40, 128], [cx + 40, 128], [cx + 50, 150], [cx - 50, 150]], shade(0.42));
  bmp.fillPoly([[cx - 36, 131], [cx + 36, 131], [cx + 44, 148], [cx - 44, 148]], (x, y) => ramp(GLASS, 8, 0.2 + 0.6 * ((y - 131) / 17) + 0.25 * (x - cx < -10 && x - cx > -24 ? 0.6 : 0), x, y));
  bmp.fillRect(cx - 40, 127, 80, 2, BODY + 13); // roof rim light
  // body
  bmp.fillRect(cx - 62, 150, 124, 24, shade(0.36));
  bmp.fillRect(cx - 62, 150, 124, 2, BODY + 12); // trunk edge highlight
  bmp.fillRect(cx - 62, 166, 124, 1, BODY + 2); // panel line
  // tail-light clusters
  for (const sx of [-60, 30]) {
    bmp.fillRect(cx + sx, 153, 30, 11, TAIL + 2);
    bmp.fillRect(cx + sx + 1, 154, 28, 4, TAIL + 6);
    bmp.fillRect(cx + sx + 1, 160, 28, 3, TAIL + 4);
    bmp.fillRect(cx + sx + (sx < 0 ? 22 : 0), 154, 8, 9, CHROME + 5); // reversing light
  }
  // bumper and plate
  bmp.fillRect(cx - 64, 174, 128, 7, CHROME + 2);
  bmp.fillRect(cx - 64, 174, 128, 1, CHROME + 6);
  bmp.fillRect(cx - 17, 166, 34, 9, PLATE + 3);
  bmp.fillRect(cx - 17, 174, 34, 1, PLATE);
  // "240" on the plate in the free edition's own font, dark on light
  let px = cx - 10;
  for (const ch of "240") {
    const rows = glyphRows(ch);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (rows[y][x] === "#") bmp.set(px + x, 167 + y, PLATE);
    px += 7;
  }
  // tail-light glow on the road towards the viewer
  for (let y = 182; y < 200; y++)
    for (let x = cx - 70; x <= cx + 70; x++) {
      const g = Math.max(0, 1 - Math.abs(Math.abs(x - cx) - 45) / 24 - (y - 182) / 22);
      if (g > 0.5 && (x + y) % 2 === 0) bmp.set(x, y, TAIL + Math.min(2, Math.floor(g * 2)));
    }
}

// Big italic logo built from the free font's glyph shapes
function logo(bmp, text, top, scaleX, scaleY, gap) {
  const lean = 0.28;
  const height = 7 * scaleY;
  const width = text.length * 5 * scaleX + (text.length - 1) * gap;
  const x0 = Math.round((320 - width) / 2 - (height * lean) / 2);
  const mask = new Bitmap(320, 60, 0);
  let x = x0;
  for (const ch of text) {
    const rows = glyphRows(ch);
    if (rows)
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < 5; gx++) {
          if (rows[gy][gx] !== "#") continue;
          for (let sy = 0; sy < scaleY; sy++) {
            const yy = gy * scaleY + sy;
            const shift = Math.round((height - yy) * lean);
            for (let sx = 0; sx < scaleX; sx++) mask.set(x + gx * scaleX + sx + shift, yy, 1);
          }
        }
    x += 5 * scaleX + gap;
  }
  const on = (xx, yy) => mask.get(xx, yy) === 1;
  // shadow, outline, gradient fill
  for (let yy = 0; yy < 60; yy++)
    for (let xx = 0; xx < 320; xx++) if (on(xx - 3, yy - 3)) bmp.set(xx, top + yy, LOGO_SHADOW);
  for (let yy = 0; yy < 60; yy++)
    for (let xx = 0; xx < 320; xx++) {
      if (on(xx, yy)) continue;
      if (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1)) bmp.set(xx, top + yy, OUTLINE);
    }
  for (let yy = 0; yy < 60; yy++)
    for (let xx = 0; xx < 320; xx++) {
      if (!on(xx, yy)) continue;
      let t = yy / height;
      if (!on(xx, yy - 1)) t = 0; // bright top edge
      bmp.set(xx, top + yy, ramp(LOGO, 32, t, xx, yy));
    }
}

function smallText(bmp, x, y, text, color) {
  for (const ch of text) {
    const rows = glyphRows(ch);
    if (rows)
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < 5; gx++)
          if (rows[gy][gx] === "#") {
            bmp.set(x + gx + 1, y + gy + 1, 1);
            bmp.set(x + gx, y + gy, color);
          }
    x += 7;
  }
}

export function buildTitle() {
  const bmp = new Bitmap(320, 200);
  const n = noise2(240);
  sky(bmp, n);
  sun(bmp);
  forest(bmp, n);
  ground(bmp, n);
  car(bmp, n);
  logo(bmp, "240 RACING", 5, 5, 5, 4);
  smallText(bmp, 232, 41, "FREE EDITION", 0xfb);
  return pack(bmp, palette());
}
