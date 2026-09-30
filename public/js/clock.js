// Timing that mirrors the original hardware setup:
//  - the PIT reprogrammed to 100 Hz (TMR_Install(100)), feeding a wait counter and two race counters
//  - the VGA vertical retrace at ~70 Hz (mode 13h), which the game polls
// Game code is written as async functions; every blocking wait in the original becomes an await here.

export const TICK_HZ = 100;
export const VRETRACE_HZ = 70.086;

export class Clock {
  constructor() {
    this.t0 = performance.now();
    this.waitBase = 0;
    this.counterBase = [0, 0, 0, 0];
    this.paused = false;
    this.pausedAt = 0;
  }

  now() {
    return (this.paused ? this.pausedAt : performance.now()) - this.t0;
  }

  ticks() {
    return Math.floor((this.now() * TICK_HZ) / 1000);
  }

  // Pausing (tab hidden) freezes all game time so races are not disturbed.
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = performance.now();
    }
  }

  resume() {
    if (this.paused) {
      this.t0 += performance.now() - this.pausedAt;
      this.paused = false;
    }
  }

  sleepUntil(ms) {
    return new Promise((resolve) => {
      const step = () => {
        const left = ms - this.now();
        if (left <= 0 && !this.paused) resolve();
        else setTimeout(step, this.paused ? 50 : Math.max(0, left - 1));
      };
      step();
    });
  }

  // 55f:0197 — reset the wait counter, then wait until n ticks (1/100 s) have elapsed
  async waitTicks(n) {
    this.waitBase = this.ticks();
    await this.sleepUntil(((this.waitBase + n) * 1000) / TICK_HZ);
  }

  // 55f:01a9 / 55f:01bb — race counters (1/100 s)
  resetCounter(i) {
    this.counterBase[i] = this.ticks();
  }

  getCounter(i) {
    return (this.ticks() - this.counterBase[i]) & 0xffff;
  }

  // 57d:009d — wait for the start of the next vertical retrace
  async waitVRetrace() {
    const period = 1000 / VRETRACE_HZ;
    const next = (Math.floor(this.now() / period) + 1) * period;
    await this.sleepUntil(next);
  }

  // Yield to the browser without advancing emulated time meaningfully (used by busy loops).
  yield() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
