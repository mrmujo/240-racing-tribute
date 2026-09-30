// Free edition: shared track palette layout, car textures and start lights.
//
// Palette rules imposed by the engine:
//   0x00..0x20  drivable (the red car's colours live here, HUD uses 9 and 15, font shadow is 1)
//   0x21..0xBF  off-road (speed x0.93 per frame); the yellow car's colours are 0x23..0x2F
//   0xC0        asphalt; 0xC1..0xC6 tyre-mark rubber, darker and darker ("lakrits"): the engine only
//               writes a mark where the new shade is a higher index than the pixel, so the road itself
//               must be 0xC0 for every shade to show
//   0xC7..0xFF  other drivable paint (kerbs, lines, checkers); 0xF0.. start lights, 0xFD countdown text

import { Palette } from "./raster.js";

export const IDX = {
  SHADOW: 1,
  HUD_VALUE: 9,
  HUD_LABEL: 15,
  RED: { outline: 12, dark: 2, body: 3, light: 4, roof: 10, glass: 5, glassHi: 6, head: 7, tail: 8, tyre: 11, trim: 13 },
  YELLOW: { outline: 0x2c, dark: 0x23, body: 0x24, light: 0x25, roof: 0x2a, glass: 0x26, glassHi: 0x27, head: 0x28, tail: 0x29, tyre: 0x2b, trim: 0x2d },
  HUD_BAR: 0x30,
  HUD_EDGE: 0x31,
  VERGE: 0x32, // 0x32..0x37 dark roadside band (off-road)
  GROUND: 0x40, // 0x40..0x5F ground ramp (grass / snow)
  FOLIAGE: 0x60, // 0x60..0x6F trees
  WATER: 0x70, // 0x70..0x7F lake / ice
  ROCK: 0x80, // 0x80..0x8F stones
  SAND: 0x90, // 0x90..0x9F sand / dirt
  ACCENT: 0xa0, // 0xA0..0xAF flowers, wood, cabin
  SHADE: 0xb0, // 0xB0..0xB7 cast shadows
  ASPHALT: 0xc0, // road base; 0xC1..0xC6 are skid-mark shades
  AGGREGATE: 0xcb, // light speckles in the asphalt (drivable, never marked)
  EDGE: 0xc7,
  KERB_RED: 0xc8,
  KERB_WHITE: 0xc9,
  PAINT: 0xca,
  CHECK_WHITE: 0xd0,
  CHECK_BLACK: 0xd1,
  LIGHT: { dark: 0xf0, body: 0xf1, rim: 0xf2, redOff: 0xf3, redOn: 0xf4, redHi: 0xf5, greenOff: 0xf6, greenOn: 0xf7, greenHi: 0xf8 },
  COUNTDOWN: 0xfd,
  WHITE: 0xff,
};

// Colours shared by every track (cars, HUD, lights); themes fill in the scenery ramps.
export function basePalette() {
  const P = new Palette();
  P.set(0, 0, 0, 0);
  P.set(IDX.SHADOW, 3, 3, 5);
  P.set(IDX.HUD_VALUE, 63, 44, 8);
  P.set(IDX.HUD_LABEL, 60, 62, 63);
  const car = (c, body) => {
    const [r, g, b] = body;
    P.set(c.outline, r * 0.18, g * 0.18, b * 0.18);
    P.set(c.dark, r * 0.55, g * 0.55, b * 0.55);
    P.set(c.body, r * 0.82, g * 0.82, b * 0.82);
    P.set(c.light, Math.min(63, r * 1.0 + 8), Math.min(63, g + 8), Math.min(63, b + 8));
    P.set(c.roof, r * 0.7, g * 0.7, b * 0.7);
    P.set(c.glass, 8, 12, 18);
    P.set(c.glassHi, 26, 36, 46);
    P.set(c.head, 63, 62, 44);
    P.set(c.tail, 63, 10, 6);
    P.set(c.tyre, 6, 6, 7);
    P.set(c.trim, 40, 42, 44);
  };
  car(IDX.RED, [62, 12, 10]);
  car(IDX.YELLOW, [63, 52, 8]);
  P.set(IDX.HUD_BAR, 5, 6, 9);
  P.set(IDX.HUD_EDGE, 20, 22, 28);
  P.set(IDX.EDGE, 12, 12, 14);
  P.set(IDX.KERB_RED, 52, 12, 10);
  P.set(IDX.KERB_WHITE, 58, 58, 58);
  P.set(IDX.PAINT, 54, 55, 56);
  P.set(IDX.CHECK_WHITE, 60, 60, 60);
  P.set(IDX.CHECK_BLACK, 4, 4, 5);
  const L = IDX.LIGHT;
  P.set(L.dark, 3, 3, 4);
  P.set(L.body, 13, 14, 16);
  P.set(L.rim, 30, 32, 36);
  P.set(L.redOff, 18, 4, 4);
  P.set(L.redOn, 63, 14, 8);
  P.set(L.redHi, 63, 48, 40);
  P.set(L.greenOff, 3, 14, 6);
  P.set(L.greenOn, 12, 62, 20);
  P.set(L.greenHi, 46, 63, 48);
  P.set(IDX.COUNTDOWN, 63, 63, 50);
  P.set(IDX.WHITE, 63, 63, 63);
  return P;
}

// 32x14 top-down car texture: column 0 = rear bumper, column 31 = nose, row 0 = left side.
// The engine only samples odd rows and every 2nd-3rd column, so features are drawn chunky.
export function carTexture(c) {
  const t = new Uint8Array(32 * 14).fill(0xff);
  const set = (x, y, v) => {
    if (x >= 0 && x < 32 && y >= 0 && y < 14) t[y * 32 + x] = v;
  };
  const rect = (x0, y0, x1, y1, v) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
  };
  // tyres stick out a little on both sides
  rect(4, 0, 9, 13, c.tyre);
  rect(21, 0, 26, 13, c.tyre);
  // body with dark outline
  rect(1, 1, 30, 12, c.outline);
  rect(2, 2, 29, 11, c.body);
  // shading: lower side darker, upper side lighter
  rect(2, 9, 29, 11, c.dark);
  rect(3, 2, 28, 3, c.light);
  // rear window, roof, windscreen
  rect(7, 3, 9, 10, c.glass);
  rect(10, 3, 17, 10, c.roof);
  rect(11, 3, 16, 4, c.light);
  rect(18, 3, 21, 10, c.glass);
  rect(19, 3, 20, 4, c.glassHi);
  // bonnet line and bumpers
  rect(29, 2, 30, 11, c.trim);
  rect(1, 2, 2, 11, c.trim);
  // lights
  rect(29, 2, 30, 4, c.head);
  rect(29, 9, 30, 11, c.head);
  rect(1, 2, 2, 4, c.tail);
  rect(1, 9, 2, 11, c.tail);
  return t;
}

// GFX.BIN replacement: four 30x48 start-light sprites at x = 0, 30, 60, 90 (0: off, 1: one red,
// 2: two red, 3: two red + green). Drawn with the track palette, like the original.
export function startLights(bmp) {
  const L = IDX.LIGHT;
  for (let s = 0; s < 4; s++) {
    const ox = s * 30;
    // housing: rounded dark box with a light rim on the left/top
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 30; x++) {
        const cx = Math.min(x - 2, 27 - x);
        const cy = Math.min(y - 1, 46 - y);
        if (cx < 0 || cy < 0) continue;
        if (cx + cy < 3) continue; // cut corners
        let v = L.body;
        if (cx === 0 || cy === 0 || cx + cy === 3) v = L.dark;
        else if (x === 3 || y === 2) v = L.rim;
        bmp.set(ox + x, y, v);
      }
    const lamps = [
      [11, s >= 1, L.redOff, L.redOn, L.redHi],
      [24, s >= 2, L.redOff, L.redOn, L.redHi],
      [37, s >= 3, L.greenOff, L.greenOn, L.greenHi],
    ];
    for (const [cy, on, off, lit, hi] of lamps) {
      // visor above each lamp
      for (let x = 7; x <= 22; x++) bmp.set(ox + x, cy - 6, L.dark);
      bmp.fillEllipse(ox + 15, cy + 0.5, 5.6, 5.6, L.dark);
      bmp.fillEllipse(ox + 15, cy + 0.5, 4.6, 4.6, on ? lit : off);
      if (on) bmp.fillEllipse(ox + 13.5, cy - 1, 1.8, 1.6, hi);
    }
  }
}
