// 240 Racing: program flow, title screen, race loop and menus.
// Ported from the decompiled main program (segment 000) of 240R.EXE v1.01.
// Procedure names in comments refer to the original code (seg:offset).

import { round, strInt, Rng } from "./tp.js";
import { DosFs } from "./dosfs.js";
import { Font } from "./font.js";
import { CarRenderer } from "./cars.js";
import { Physics } from "./physics.js";
import { Hiscores } from "./hiscore.js";

// PC scancodes used by the program flow
const K = {
  ESC: 0x01, ENTER: 0x1c, H: 0x23, SPACE: 0x39, F1: 0x3b, F2: 0x3c,
  UP: 0x48, DOWN: 0x50, KP_MINUS: 0x4a, KP_PLUS: 0x4e,
};

const PIC_SIZE = 64768; // 64000 pixels + 768 palette
const LEV_SIZE = 64814; // + 46-byte trailer

export class Car {
  constructor() {
    this.x = 0; // +00 Real
    this.y = 0; // +06 Real
    this.speed = 0; // +0C Real
    this.f12 = 0; // +12 Real
    this.f18 = 0; // +18 Real
    this.bestLap = 0; // +1E Real (ticks)
    this.worstLap = 0; // +24 Real
    this.lastLap = 0; // +2A Real
    this.lapStart = 0; // +30 Real
    this.f36 = 0; // +36 Real
    this.f3C = 0; // +3C Real
    this.spriteAng = 0; // +42 Integer (degrees)
    this.f44 = 0; // +44 Integer
    this.lapsDone = -1; // +46 LongInt
    this.finishTime = 0; // +4A Word
    this.finished = 0; // +4C Boolean
    this.armed = 1; // +4D Boolean
    this.keyLeft = 0; // +4F
    this.keyRight = 0; // +51
    this.keyAccel = 0; // +53
    this.keyBrake = 0; // +55
    this.keyReverse = 0; // +57
    this.cp = [0, 0, 0, 0, 0]; // +59..+5C, index 1..4
  }

  get keys() {
    return [this.keyLeft, this.keyRight, this.keyAccel, this.keyBrake, this.keyReverse];
  }

  setKey(i, scan) {
    ["keyLeft", "keyRight", "keyAccel", "keyBrake", "keyReverse"].forEach((k, n) => {
      if (n === i - 1) this[k] = scan;
    });
  }
}

export class Game {
  constructor(sys) {
    Object.assign(this, sys); // vga, clock, kbd, speaker, assets
    // TP heap layout: GetMem(64814) for the level/picture buffer ("bg") at HeapOrg:0, then GetMem(64768)
    // for GFX.BIN 4051 paragraphs later. Each is addressed as a 64 KB segment, so reads past the end of
    // the level buffer land in the GFX buffer exactly as in DOS.
    this.heap = new Uint8Array(0x30000);
    this.bg = this.heap.subarray(0, 0x10000);
    this.gfx = this.heap.subarray(4051 * 16, 4051 * 16 + 0x10000);
    this.palette = new Uint8Array(768); // DS:0398, palette of the last ShowPicture
    this.rng = new Rng();
    this.fs = new DosFs(this.assets.hiscoreSeed, this.assets.storageKey);
    this.font = new Font(this);
    this.carGfx = new CarRenderer(this);
    this.physics = new Physics(this);
    this.hiscores = new Hiscores(this);
    this.cars = [null, new Car(), new Car()];
    this.players = 1;
    this.laps = 3;
    this.track = 1;
    this.trackFile = "BANA1.LEV";
    this.hiFile = "HISCORE1.DAT";
    this.soundOn = 1;
    this.lakris = 1;
    this.msgTimer = 0;
    this.scrollPos = 0;
    this.winner = 0;
    this.raceOver = 0;
    this.showHiscoreAfterRace = 0;
    this.trailer = null;
  }

  // ---------------------------------------------------------------- helpers

  down(scan) {
    return this.kbd.down(scan);
  }

  frame() {
    return this.clock.waitVRetrace();
  }

  async waitKeyDown(scan) {
    while (!this.down(scan)) await this.frame();
  }

  async waitKeyUp(scan) {
    while (this.down(scan)) await this.frame();
  }

  async waitTicks(n) {
    await this.clock.waitTicks(n);
  }

  sound(hz) {
    this.speaker.sound(hz & 0xffff);
  }

  noSound() {
    this.speaker.noSound();
  }

  // 57d:0051
  blit(src, sx, sy, dx, dy, w, h) {
    this.vga.blit(src, sx, sy, dx, dy, w, h);
  }

  blitBg(x, y, w, h) {
    this.blit(this.bg, x, y, x, y, w, h);
  }

  // 57d:00ab — final palette is p*63 shr 6 (one step darker), exactly like the original
  async fadeIn(p) {
    const tmp = new Uint8Array(768);
    for (let s = 0; s <= 63; s++) {
      for (let i = 0; i < 768; i++) tmp[i] = (p[i] * s) >> 6;
      await this.frame();
      this.vga.setPalette(tmp);
    }
  }

  // 57d:0114
  async fadeOut(p) {
    const tmp = new Uint8Array(768);
    for (let s = 63; s >= 0; s--) {
      for (let i = 0; i < 768; i++) tmp[i] = (p[i] * s) >> 6;
      await this.frame();
      this.vga.setPalette(tmp);
    }
  }

  // 000:037f
  loadPicture(name, buf) {
    buf.set(this.assets.file(name).subarray(0, PIC_SIZE));
  }

  // 000:02c4 — the whole LEV file, including the trailer, lands in the shared buffer
  loadTrack(name) {
    const data = this.assets.file(name);
    if (!data) throw new Error("Can't find TRACKFILE " + name);
    this.bg.set(data.subarray(0, LEV_SIZE));
    const w = (i) => data[0xfd00 + i * 2] | (data[0xfd01 + i * 2] << 8);
    const lines = [];
    for (let k = 0; k <= 4; k++) lines.push({ x: w(8 + k * 3), y1: w(9 + k * 3), y2: w(10 + k * 3) });
    this.trailer = { car1X: w(0), car1Y: w(1), car2X: w(2), car2Y: w(3), numCP: w(4), lines };
  }

  // 000:041d
  async showPicture(buf) {
    this.palette.fill(0);
    this.vga.setPalette(this.palette);
    this.palette.set(buf.subarray(64000, 64768));
    this.blit(buf, 0, 0, 0, 0, 320, 200);
    await this.fadeIn(this.palette);
  }

  // 000:0000
  showMessage(s, color) {
    this.blitBg(0, 192, 320, 8);
    this.font.drawText((320 - s.length * 7) >> 1, 192, color, s);
    this.msgTimer = 100;
  }

  // ---------------------------------------------------------------- program

  // 000:39bd
  async run() {
    this.hiFile = "HISCORE1.DAT";
    this.players = 1;
    this.laps = 3;
    this.track = 1;
    this.trackFile = "BANA1.LEV";
    this.hiscores.createDefaultIfMissing();
    this.init();
    this.scrollPos = 0;
    this.lakris = 1;
    this.loadPicture("240BURN.BIN", this.bg);
    this.loadPicture("GFX.BIN", this.gfx);
    await this.showPicture(this.bg);
    this.kbd.clear();
    for (;;) {
      if (this.down(K.KP_MINUS)) await this.soundOff();
      if (this.down(K.KP_PLUS)) await this.soundOnCmd();
      if (this.down(K.H)) await this.hiscores.show();
      if (this.down(K.SPACE)) await this.race();
      if (this.down(K.F1)) await this.helpMenu();
      if (this.down(K.F2)) await this.optionsMenu();
      await this.frame();
      if (this.msgTimer < 0) this.drawScroller();
      if (this.msgTimer === 0) {
        this.blitBg(0, 192, 320, 8);
        this.msgTimer = -1;
      }
      if (this.msgTimer > 0) this.msgTimer--;
      if (this.down(K.ESC)) break;
    }
    await this.fadeOut(this.palette);
    this.noSound();
  }

  // 000:0070
  init() {
    this.soundOn = 1;
    const [c1, c2] = [this.cars[1], this.cars[2]];
    c2.keyAccel = 0x1d; c2.keyBrake = 0x38; c2.keyLeft = 0x4b; c2.keyRight = 0x4d; c2.keyReverse = 0x50;
    c1.keyAccel = 0x1e; c1.keyBrake = 0x2c; c1.keyLeft = 0x1f; c1.keyRight = 0x21; c1.keyReverse = 0x2d;
    this.parseScroller();
  }

  // Scroller text: two strings with %"NNN" colour codes (typed constants DS:0002/DS:0102 in the original)
  parseScroller() {
    const scroll = [null];
    let color = 255;
    for (const t of this.assets.scrollerTexts) {
      const at = (j) => t.charCodeAt(j - 1) || 0;
      for (let j = 1; j <= t.length; j++) {
        if (at(j) === 0x25) {
          while (at(j) !== 0x22 && j <= t.length) j++;
          j++;
          color = 0;
          do {
            color = color * 10 + at(j) - 48;
            j++;
          } while (at(j) !== 0x22 && j <= t.length);
          j++;
        }
        scroll.push({ ch: at(j), col: color & 0xff });
      }
    }
    for (let n = 0; n < 50; n++) scroll.push({ ch: 0x20, col: 0 });
    scroll.push({ ch: 0x23, col: 0 }); // '#'
    this.scroll = scroll;
  }

  // 000:3076
  drawScroller() {
    this.blitBg(0, 191, 320, 8);
    let x = 320 - this.scrollPos;
    let idx;
    if (x < 0) {
      idx = (Math.abs(x) >> 3) + 2;
      x = 8 - (Math.abs(x) & 7);
    } else idx = 1;
    while (x < 313) {
      const e = this.scroll[idx] || { ch: 0x20, col: 0 };
      this.font.drawChar(x, 191, e.col, e.ch);
      idx++;
      x += 8;
    }
    if (this.scroll[idx] && this.scroll[idx].ch === 0x23) this.scrollPos = 0;
    this.scrollPos++;
  }

  // 000:25c7
  async soundOnCmd() {
    if (this.soundOn === 1) {
      this.noSound();
      this.showMessage("SOUND ALREADY TURNED ON", 251);
    } else {
      this.soundOn = 1;
      this.speaker.enabled = true;
      this.showMessage("SOUND TURNED ON", 251);
      this.sound(600);
      await this.waitTicks(10);
      this.noSound();
    }
    await this.waitKeyUp(K.KP_PLUS);
  }

  // 000:263a
  async soundOff() {
    if (this.soundOn === 0) this.showMessage("SOUND ALREADY TURNED OFF", 252);
    else {
      this.soundOn = 0;
      this.showMessage("SOUND TURNED OFF", 252);
    }
    await this.waitKeyUp(K.KP_MINUS);
  }

  // ---------------------------------------------------------------- race

  // 000:101b
  checkLines(c) {
    const car = this.cars[c];
    const L = this.trailer.lines;
    const n = this.trailer.numCP;
    for (let k = 1; k <= n; k++) {
      if (Math.abs(car.x - L[k].x) < 5.0 && !(L[k].y1 > car.y) && !(L[k].y2 < car.y)) {
        if (car.armed === 1) {
          car.armed = 0;
          car.cp[k] = 1;
        }
      }
    }
    if (Math.abs(car.x - L[0].x) < 5.0 && L[0].y1 <= car.y && L[0].y2 >= car.y) {
      let all = true;
      for (let k = 1; k <= n; k++) if (car.cp[k] === 0) all = false;
      if (car.armed === 1 && all) {
        car.armed = 0;
        for (let k = 1; k <= n; k++) car.cp[k] = 0;
        car.lapsDone++;
        if (car.lapsDone > 0) {
          car.lastLap = this.clock.getCounter(1) - car.lapStart;
          car.lapStart = this.clock.getCounter(1);
          if (car.bestLap > car.lastLap) car.bestLap = car.lastLap;
          if (car.worstLap < car.lastLap) car.worstLap = car.lastLap;
        }
        if (car.lapsDone === this.laps) {
          car.finishTime = this.clock.getCounter(1);
          if (this.winner === 0) this.winner = c;
          car.finished = 1;
        }
      }
    } else car.armed = 1;
  }

  resetCars() {
    const t = this.trailer;
    for (const c of [1, 2]) {
      const car = this.cars[c];
      car.lastLap = 0;
      car.lapStart = 0;
      car.bestLap = 20000.0;
      car.worstLap = 0;
      car.finished = 0;
      car.spriteAng = 0;
      car.f44 = 0;
      car.f12 = 0;
      car.f18 = 0;
      car.f36 = 0;
      car.f3C = 0;
      car.armed = 1;
      car.speed = 0;
      car.lapsDone = -1;
      car.cp = [0, 0, 0, 0, 0];
      for (let i = 1; i <= Math.min(4, t.numCP); i++) car.cp[i] = 1;
    }
    this.cars[1].x = t.car1X;
    this.cars[2].x = t.car2X;
    this.cars[1].y = t.car1Y;
    this.cars[2].y = t.car2Y;
  }

  drawCars() {
    const [c1, c2] = [this.cars[1], this.cars[2]];
    this.carGfx.drawCar(round(c1.x), round(c1.y), c1.spriteAng, 1);
    if (this.players === 2) this.carGfx.drawCar(round(c2.x), round(c2.y), c2.spriteAng, 2);
  }

  // 000:178c
  async race() {
    this.kbd.clear();
    this.loadTrack(this.trackFile);
    await this.showPicture(this.bg);
    this.name1 = "";
    this.name2 = "";
    this.resetCars();
    this.raceOver = 0;
    this.winner = 0;

    this.drawCars();
    this.clock.resetCounter(1);
    this.physics.drawHud();

    // countdown: traffic lights from GFX.BIN, drawn with the level palette
    this.blit(this.gfx, 0, 0, 0, 0, 30, 48);
    await this.waitTicks(100);
    this.blit(this.gfx, 30, 0, 0, 0, 30, 48);
    this.font.drawText(125, 100, 253, "GET READY!");
    if (this.soundOn === 1) this.sound(450);
    await this.waitTicks(80);
    this.noSound();
    await this.waitTicks(50);
    this.blit(this.gfx, 60, 0, 0, 0, 30, 48);
    if (this.soundOn === 1) this.sound(450);
    await this.waitTicks(80);
    this.noSound();
    await this.waitTicks(50);
    this.blit(this.gfx, 90, 0, 0, 0, 30, 48);
    this.blitBg(125, 100, 200, 10);
    this.font.drawText(150, 100, 253, "GO!");
    if (this.soundOn === 1) this.sound(600);
    await this.waitTicks(100);
    this.noSound();
    this.blitBg(150, 100, 180, 10);
    this.clock.resetCounter(1);

    let k = 100;
    for (;;) {
      if (k >= 0 && k < 48) {
        this.blit(this.gfx, 90, 47 - k, 0, 0, 30, k + 1);
        this.blitBg(0, k, 30, 1);
      }
      k = ((k - 1) << 16) >> 16;
      this.drawCars();
      this.physics.drawHud();
      this.physics.carPhysics(1);
      if (this.lakris === 1) this.physics.skidMarks(1);
      this.checkLines(1);
      if (this.players >= 2) {
        this.physics.carPhysics(2);
        this.checkLines(2);
        if (this.lakris === 1) this.physics.skidMarks(2);
      }
      const [c1, c2] = [this.cars[1], this.cars[2]];
      if (this.down(K.KP_MINUS)) {
        this.soundOn = 0;
        this.noSound();
      }
      if (this.down(K.KP_PLUS)) this.soundOn = 1;
      if (this.soundOn !== 0) {
        if (this.players === 2)
          this.sound(round(Math.abs(((c1.speed + c2.speed) / 2.0) * 150.0)) + this.rng.random(7) + 20);
        else this.sound(round(c1.speed * 150.0) + this.rng.random(7) + 40);
      }
      if (c1.finished === 1 && c2.finished === 1 && c1.speed < 0.01 && c2.speed < 0.01) this.raceOver = 1;
      if (this.players === 1 && c1.finished === 1 && c1.speed < 0.01) this.raceOver = 1;
      await this.frame();
      this.carGfx.eraseCar(1);
      if (this.players === 2) this.carGfx.eraseCar(2);
      if (this.down(K.ESC) || this.raceOver === 1) break;
    }

    // ---- after the race
    this.noSound();
    this.loadPicture("240BURN.BIN", this.bg);
    await this.showPicture(this.bg);
    const f = this.font;
    const w = this.winner;
    if (w === 0) f.drawText(110, 70, 247, "RACE SKIPPED...");
    if (w !== 0) {
      this.drawStats(w, false);
      f.drawText(60, 192, 252, "PRESS SPACE TO CONTINUE...");
      await this.waitKeyDown(K.SPACE);
      await this.waitKeyUp(K.SPACE);
    }
    if (w > 0 && this.players > 1 && this.cars[3 - w].finished === 1) {
      this.blitBg(0, 0, 320, 200);
      this.drawStats(3 - w, true);
    }
    f.drawText(60, 192, 252, "PRESS SPACE TO CONTINUE...");
    // Original reads cars[3-winner]; with no winner that is "cars[3]", which overlaps the palette
    // variable (bytes 70..73 as a LongInt), so it still waits for SPACE after a skipped race.
    const otherLaps = w === 0 ? this.paletteLong(70) : this.cars[3 - w].lapsDone;
    if (otherLaps >= this.laps) {
      await this.waitKeyDown(K.SPACE);
      await this.waitKeyUp(K.SPACE);
    }

    if (w > 0 && this.cars[w].lapsDone === this.laps) await this.hiscoreEntry(w, w === 1 ? 1 : 2);
    if (w > 0 && this.cars[3 - w].lapsDone === this.laps) await this.hiscoreEntry(3 - w, w === 2 ? 1 : 2);

    this.blitBg(0, 0, 320, 200);
    if (this.showHiscoreAfterRace === 1) {
      await this.hiscores.show();
      this.showHiscoreAfterRace = 0;
    }
    this.kbd.clear();
  }

  paletteLong(off) {
    const p = this.palette;
    return (p[off] | (p[off + 1] << 8) | (p[off + 2] << 16) | (p[off + 3] << 24)) | 0;
  }

  drawStats(c, loser) {
    const f = this.font;
    const car = this.cars[c];
    f.drawText(100, 50, 252, "RACE STATISTICS...");
    if (!loser) {
      if (c === 1 && this.players === 2) f.drawText(80, 64, 248, "THE WINNER IS THE RED CAR");
      if (c === 2 && this.players === 2) f.drawText(70, 64, 251, "THE WINNER IS THE YELLOW CAR");
    } else if (c === 1) f.drawText(80, 64, 248, "THE LOOSER IS THE RED CAR");
    else f.drawText(70, 64, 251, "THE LOOSER IS THE YELLOW CAR");
    f.drawText(20, 84, 247, "TOTAL TIME       :");
    f.drawReal(270, 84, 248, car.finishTime / 100);
    f.drawText(20, 98, 247, loser ? "BEST TIME        :" : "BEST LAP TIM     :");
    f.drawReal(270, 98, 248, car.bestLap / 100);
    f.drawText(20, 112, 247, "WORST TIME       :");
    f.drawReal(270, 112, 248, car.worstLap / 100);
    f.drawText(20, 126, 247, "AVERAGE LAP TIME :");
    f.drawReal(270, 126, 248, car.finishTime / this.laps / 100);
  }

  // Hiscore entry for car c (colour text depends on which car, see 000:178c)
  async hiscoreEntry(c, redYellow) {
    const recs = this.fs.readRecords(this.hiFile);
    const car = this.cars[c];
    const time = car.finishTime / 100;
    const tenth = recs[9] ? recs[9].time : Infinity;
    if (!(tenth > time)) return;
    this.blitBg(0, 0, 320, 200);
    this.kbd.clear();
    const f = this.font;
    f.drawText(111, 45, 252, "CONGRATULATION");
    if (redYellow === 1) f.drawText(76, 65, 248, "RED CAR MADE A NICE RACE");
    else f.drawText(65, 65, 251, "YELLOW CAR MADE A NICE RACE");
    f.drawText(20, 85, 255, "ENTER YOUR NAME:");
    const name = await f.readName(135, 85, 22, 249);
    this.fs.writeRecordAt(this.hiFile, 9, { name, time });
    this.hiscores.sort();
    this.showHiscoreAfterRace = 1;
  }

  // ---------------------------------------------------------------- menus

  // 000:271b
  async helpMenu() {
    const f = this.font;
    this.blitBg(0, 0, 320, 200);
    f.drawText(125, 45, 249, "HELP MENU!");
    f.drawText(120, 49, 249, "-----------");
    f.drawText(122, 49, 249, "-----------");
    f.drawText(20, 60, 249, "+/-            SOUND ON/OFF");
    f.drawText(20, 70, 249, "H              SHOW HISCORE");
    f.drawText(20, 80, 249, "F1             THIS MENU");
    f.drawText(20, 90, 249, "F2             OPTIONS MENU");
    f.drawText(20, 100, 249, "ESC            QUIT");
    f.drawText(76, 192, 252, "PRESS ESC TO CONTINUE...");
    await this.waitKeyDown(K.ESC);
    await this.waitKeyUp(K.ESC);
    this.blitBg(0, 0, 320, 200);
  }

  // 000:2bb8
  async optionsMenu() {
    const f = this.font;
    let cur = 60;
    this.blitBg(0, 0, 320, 200);
    const col = (y) => (cur === y ? 255 : 245);
    const TRACKS = this.assets.trackLines;
    for (;;) {
      f.drawText(30, cur, 255, "*");
      if (this.down(K.DOWN) && cur < 150) {
        this.blitBg(30, cur, 35, 10);
        this.kbd.clear();
        cur += 15;
      }
      if (this.down(K.UP) && cur > 60) {
        this.blitBg(30, cur, 35, 10);
        this.kbd.clear();
        cur -= 15;
      }
      if (this.down(K.ENTER)) {
        switch (cur) {
          case 60:
            this.soundOn = this.soundOn ? 0 : 1;
            this.speaker.enabled = !!this.soundOn;
            this.blitBg(168, 60, 30, 10);
            break;
          case 75:
            this.lakris = this.lakris ? 0 : 1;
            this.blitBg(168, 75, 30, 10);
            break;
          case 90:
            this.track++;
            if (this.track === 3) this.track = 1;
            this.trackFile = "BANA" + strInt(this.track) + ".LEV";
            this.blitBg(168, 90, 145, 10);
            break;
          case 105:
            this.laps += 3;
            if (this.laps === 12) this.laps = 3;
            this.blitBg(168, 105, 20, 10);
            break;
          case 120:
            this.players = 3 - this.players;
            this.blitBg(168, 120, 30, 10);
            break;
          case 135:
            await this.setupKeys(1);
            this.blitBg(0, 0, 320, 200);
            break;
          case 150:
            await this.setupKeys(2);
            this.blitBg(0, 0, 320, 200);
            break;
        }
        this.kbd.clear();
      }
      f.drawText(115, 45, 250, "OPTIONS MENU!");
      f.drawText(110, 49, 250, "--------------");
      f.drawText(112, 49, 250, "--------------");
      f.drawText(81, 60, col(60), this.soundOn ? "SOUND      : ON   " : "SOUND      : OFF  ");
      f.drawText(81, 75, col(75), this.lakris ? "LAKRIS     : ON   " : "LAKRIS     : OFF  ");
      f.drawText(81, 90, col(90), TRACKS[this.track - 1]);
      f.drawText(81, 105, col(105), "LAPS       :     ");
      f.drawInt(172, 105, col(105), this.laps);
      f.drawText(81, 120, col(120), this.players === 1 ? "PLAYERS    : ONE " : "PLAYERS    : TWO ");
      f.drawText(81, 135, col(135), "SETUP KEYS : PLAYER1");
      f.drawText(81, 150, col(150), "SETUP KEYS : PLAYER2");
      f.drawText(76, 192, 252, "PRESS ESC TO CONTINUE...");
      if (this.down(K.ESC)) break;
      await this.frame();
    }
    await this.waitKeyUp(K.ESC);
    this.blitBg(0, 0, 320, 200);
    this.hiFile = { 3: "HISCORE1.DAT", 6: "HISCORE2.DAT", 9: "HISCORE3.DAT" }[this.laps];
    this.hiscores.createDefaultIfMissing();
  }

  // 000:286a
  async setupKeys(p) {
    const f = this.font;
    this.blitBg(0, 0, 320, 200);
    f.drawText(80, 45, 250, "SETUP KEYS : PLAYER");
    f.drawInt(221, 45, 250, p);
    f.drawText(75, 49, 250, "------------------------");
    f.drawText(77, 49, 250, "------------------------");
    f.drawText(20, 60, 255, "TURN LEFT  :");
    f.drawText(20, 75, 255, "TURN RIGHT :");
    f.drawText(20, 90, 255, "ACCELERATE :");
    f.drawText(20, 105, 255, "BRAKE      :");
    f.drawText(20, 120, 255, "REVERSE    :");
    f.drawText(111, 190, 252, "ESC TO QUIT!!!");
    this.kbd.clear();
    this.cars[p].keys.forEach((scan, n) => this.hiscores.keyName(45 + 15 * (n + 1), scan));
    let i = 1;
    for (;;) {
      while (!this.kbd.takeAnyHit()) await this.frame();
      const scan = this.kbd.lastScan;
      if (scan === 1) return;
      this.blitBg(140, 45 + 15 * i, 120, 8);
      if (this.hiscores.keyName(45 + 15 * i, scan)) {
        this.cars[p].setKey(i, scan);
        this.kbd.clear();
        if (i === 5) return;
        i++;
      }
    }
  }
}
