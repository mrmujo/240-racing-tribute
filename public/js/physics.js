// Car movement, skid marks and HUD (main program 000:0529, 000:0e11, 000:142e).
// One call per 70 Hz frame; all speeds are pixels per frame.

import { round, trunc } from "./tp.js";

// Store to a Turbo Pascal Real: 40-bit significand, ties away from zero.
export function real6(v) {
  if (v === 0 || !Number.isFinite(v)) return v === 0 ? 0 : v;
  const a = Math.abs(v);
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e--;
  else if (2 ** (e + 1) <= a) e++;
  if (e < -128) return 0;
  const ulp = 2 ** (e - 39);
  return Math.sign(v) * Math.floor(a / ulp + 0.5) * ulp;
}

const DEG = 0.017453292519943295;

export class Physics {
  constructor(game) {
    this.g = game;
  }

  // 000:0529 MoveCar
  carPhysics(p) {
    const g = this.g;
    const car = g.cars[p];
    const key = (sc) => g.kbd.keys[sc & 0x7f] === 1;

    // 1. coast-down after the chequered flag
    if (car.finished === 1 && car.speed > 0.03) {
      car.speed = real6(car.speed - 0.03);
      if (car.speed <= 0.03) car.speed = 0;
    }
    // 2. steering: exactly 2 degrees per frame
    if (key(car.keyLeft) && car.finished === 0) car.f18 = real6(car.f18 - 2.0);
    if (key(car.keyRight) && car.finished === 0) car.f18 = real6(car.f18 + 2.0);
    // 3. integer draw angle
    let angle = trunc(car.f18);
    // 4. travel direction (f12) follows heading (f18), using the speed from before the throttle
    if (car.f18 < car.f12 && car.speed !== 0) car.f12 = real6(car.f12 - (1.0 / Math.abs(car.speed) + 1.0));
    if (car.f18 > car.f12 && car.speed !== 0) car.f12 = real6(car.f12 + (1.0 / Math.abs(car.speed) + 1.0));
    // 5. wrap the integer angle
    do {
      if (angle > 359) angle -= 360;
      if (angle < 0) angle += 360;
    } while (!(angle >= 0 && angle <= 359));
    car.spriteAng = angle;
    // 6. sign of the speed (0 counts as negative)
    const dir = car.speed > 0 ? 1.0 : -1.0;
    // 7. throttle chain
    if (car.finished === 0) {
      if (key(car.keyAccel)) {
        if (car.speed < 2.5) car.speed = real6(car.speed + 0.01);
      } else if (key(car.keyReverse)) {
        if (car.speed > -1.0) car.speed = real6(car.speed - 0.02);
      } else {
        car.speed = real6(car.speed - (dir * 0.0015 + car.speed * 0.003));
        if (Math.abs(car.speed) < 0.1) car.speed = 0;
      }
    }
    // 8. brake, independent and active even when finished
    if (key(car.keyBrake)) {
      car.speed = real6(car.speed - (dir * 0.016 + car.speed * 0.005));
      if (Math.abs(car.speed) < 0.1) car.speed = 0;
    }
    // 9. off-road: pixel sampled by DrawCar at the start of this frame
    if (g.carGfx.isOffRoad(p)) {
      car.speed = real6(car.speed * 0.93);
      car.f36 = real6(car.f36 * 0.93);
      car.f3C = real6(car.f3C * 0.93);
    }
    // 10. integrate along the travel direction (y step scaled for non-square pixels)
    car.x = real6(car.x + car.f36 + car.speed * Math.cos(car.f12 * DEG));
    car.y = real6(car.y + (car.f3C + car.speed * Math.sin(car.f12 * DEG)) * 0.75);
    car.f36 = real6(car.f36 * 0.99);
    car.f3C = real6(car.f3C * 0.99);
    // 11. clamp to the screen
    if (car.x < 0) car.x = 0;
    if (car.x > 320) car.x = 320;
    if (car.y < 0) car.y = 0;
    if (car.y > 200) car.y = 200;
  }

  // 000:0e11 SkidMarks ("LAKRIS"): permanent tyre marks written into the background buffer
  skidMarks(p) {
    const g = this.g;
    const car = g.cars[p];
    const bg = g.bg;
    const sn = Math.sin(car.f18 * DEG) * 2.0;
    const cs = Math.cos(car.f18 * DEG) * 2.0;
    const shadeL = (round(Math.abs(car.f18 - car.f12) / 3.0) + 0xc0 - 2) & 0xff;
    let shade = shadeL;
    if (shade < 0xc0) shade = 0xc0;
    if (shade > 0xc6) shade = 0xc6;
    const mark = (sx, sy) => {
      const o = (((sy << 16) >> 16) * 320 + ((sx << 16) >> 16)) & 0xffff;
      const pix = bg[o];
      if (pix >= 0xc0 && shade > pix && pix < 0xf0) bg[o] = shade;
    };
    mark(round(car.x + sn), round(car.y - cs));
    mark(round(car.x - sn), round(car.y + cs));
  }

  // 000:142e DrawHUD (bottom strip, rows 192..199)
  drawHud() {
    const g = this.g;
    const f = g.font;
    const [c1, c2] = [g.cars[1], g.cars[2]];
    const two = g.players === 2;
    g.blitBg(0, 192, 320, 8);
    f.drawText(0, 192, 15, "LAP: /");
    f.drawText(60, 192, 15, "MPH:");
    if (two) f.drawText(265, 192, 15, "LAP: /");
    if (two) f.drawText(210, 192, 15, "MPH:");
    f.drawText(120, 192, 15, "TIME:");
    f.drawInt(28, 192, 9, g.laps === c1.lapsDone ? c1.lapsDone : c1.lapsDone + 1);
    f.drawInt(41, 192, 9, g.laps);
    f.drawInt(88, 192, 9, round(Math.abs(c1.speed * 33.0)));
    if (two) {
      f.drawInt(293, 192, 9, g.laps === c2.lapsDone ? c2.lapsDone : c2.lapsDone + 1);
      f.drawInt(306, 192, 9, g.laps);
      f.drawInt(238, 192, 9, round(Math.abs(c2.speed * 33.0)));
    }
    f.drawReal(160, 192, 9, g.clock.getCounter(1) / 100.0);
  }
}
