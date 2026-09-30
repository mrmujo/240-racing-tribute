// PC speaker emulation: SND_Sound(freq) / SND_NoSound (unit 55f).
export class Speaker {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.enabled = true;
    this.volume = 0.08;
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
      this.osc = this.ctx.createOscillator();
      this.osc.type = "square";
      this.osc.frequency.value = 440;
      this.osc.connect(this.gain);
      this.osc.start();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  // 55f:0000 Sound(hz): ignored when hz <= 18 (the old tone keeps playing); otherwise the PIT
  // divisor is 1193181 div hz, so the real pitch is quantised the same way as on the PC speaker.
  sound(freq) {
    if (!this.ctx || !this.enabled) return;
    freq &= 0xffff;
    if (freq <= 18) return;
    const hz = 1193181 / Math.floor(1193181 / freq);
    const t = this.ctx.currentTime;
    if (hz > 16000) {
      this.gain.gain.setValueAtTime(0, t); // ultrasonic on the real speaker: inaudible
      return;
    }
    this.osc.frequency.setValueAtTime(hz, t);
    this.gain.gain.setValueAtTime(this.volume, t);
  }

  noSound() {
    if (!this.ctx) return;
    this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}
