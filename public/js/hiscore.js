// Hiscore unit (segment 3af): default tables, sorting, the hiscore screen and key names.

import { real6 } from "./physics.js";

// 3af:085a scancode -> name shown on the key setup screen
const KEY_NAMES = {
  0x1d: "CTRL KEY", 0x38: "ALT KEY", 0x4b: "LEFT ARROW", 0x4d: "RIGHT ARROW", 0x48: "UP ARROW",
  0x50: "DOWN ARROW",
};
const LETTERS = {
  0x1e: "A", 0x30: "B", 0x2e: "C", 0x20: "D", 0x12: "E", 0x21: "F", 0x22: "G", 0x23: "H", 0x17: "I",
  0x24: "J", 0x25: "K", 0x26: "L", 0x32: "M", 0x31: "N", 0x18: "O", 0x19: "P", 0x10: "Q", 0x13: "R",
  0x1f: "S", 0x14: "T", 0x16: "U", 0x2f: "V", 0x11: "W", 0x2d: "X", 0x15: "Y", 0x2c: "Z",
};
for (const [sc, l] of Object.entries(LETTERS)) KEY_NAMES[sc] = l + " KEY";

export class Hiscores {
  constructor(game) {
    this.g = game;
  }

  // Default table: ten names with a time multiplier each (time = (laps div 3) * multiplier)
  defaults() {
    return this.g.assets.hiscoreDefaults;
  }

  // 3af:0151
  createDefaultIfMissing() {
    const g = this.g;
    if (g.fs.exists(g.hiFile)) return;
    const k = Math.trunc(g.laps / 3);
    g.fs.writeRecords(
      g.hiFile,
      this.defaults().map((d) => ({ name: d.name, time: real6(k * d.mult) })),
    );
  }

  // 3af:0374: stable bubble sort ascending, keep at most 10 records
  sort() {
    const g = this.g;
    const recs = g.fs.readRecords(g.hiFile);
    const n = recs.length - 1;
    let sorted;
    do {
      sorted = true;
      for (let j = 0; j < n; j++) {
        if (recs[j + 1].time < recs[j].time) {
          [recs[j], recs[j + 1]] = [recs[j + 1], recs[j]];
          sorted = false;
        }
      }
    } while (!sorted);
    g.fs.writeRecords(g.hiFile, recs.slice(0, Math.min(10, n + 1)));
  }

  // 3af:065a
  async show() {
    const g = this.g;
    const f = g.font;
    g.blitBg(0, 50, 320, 150);
    f.drawText(130, 53, 0xf0, "HISCORES");
    let y = 65;
    let rank = 1;
    for (const r of g.fs.readRecords(g.hiFile)) {
      f.drawText(20, y, 0xf9, r.name);
      f.drawReal(276, y, 0xf8, r.time);
      f.drawInt(1, y, 0xff, rank);
      y += 12;
      rank++;
    }
    f.drawText(60, 192, 0xfc, "PRESS SPACE TO CONTINUE...");
    await g.waitKeyDown(0x39);
    await g.waitKeyUp(0x39);
    let x = 0;
    do {
      g.blit(g.bg, x, 50, x, 50, 4, 150);
      await g.frame();
      x += 4;
    } while (!(x > 316));
    g.showHiscoreAfterRace = 0;
  }

  // 3af:085a: draws the key name at (140, y) and returns true if the scancode is supported
  keyName(y, sc) {
    const name = KEY_NAMES[sc & 0xff];
    if (!name) return false;
    this.g.font.drawText(140, y, 0xfb, name);
    return true;
  }
}
