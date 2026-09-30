// Mode 13h emulation: the whole 64 KB A000 segment (only the first 64000 bytes are visible)
// plus a 6-bit VGA DAC palette. The game writes into `mem` exactly like it wrote to A000,
// including the off-screen area and 16-bit offset wraparound.

export const W = 320;
export const H = 200;
const VISIBLE = W * H;

export class VGA {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.image = this.ctx.createImageData(W, H);
    this.out32 = new Uint32Array(this.image.data.buffer);
    this.mem = new Uint8Array(65536);
    this.dac = new Uint8Array(768); // current DAC contents, 0..63
    this.lut = new Uint32Array(256);
    this.dirtyPal = true;
  }

  setPalette(pal768) {
    this.dac.set(pal768.subarray ? pal768.subarray(0, 768) : pal768);
    this.dirtyPal = true;
  }

  rebuildLut() {
    const d = this.dac;
    for (let i = 0; i < 256; i++) {
      const r = (d[i * 3] << 2) | (d[i * 3] >> 4);
      const g = (d[i * 3 + 1] << 2) | (d[i * 3 + 1] >> 4);
      const b = (d[i * 3 + 2] << 2) | (d[i * 3 + 2] >> 4);
      this.lut[i] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
    this.dirtyPal = false;
  }

  // 57d:0025
  getPixel(x, y) {
    return this.mem[(y * 320 + x) & 0xffff];
  }

  // 57d:0051 Blit(srcSeg, sx, sy, dx, dy, w, h): copies w shr 1 words per row, then skips 320-w.
  // An odd width therefore copies w-1 bytes and drifts one pixel left per row, like the original.
  // `src` must be a 64 KB segment view.
  blit(src, sx, sy, dx, dy, w, h) {
    const m = this.mem;
    let si = (sy * 320 + sx) & 0xffff;
    let di = (dy * 320 + dx) & 0xffff;
    const bytes = ((w & 0xffff) >> 1) * 2;
    const skip = (320 - w) & 0xffff;
    let rows = h & 0xffff || 65536;
    while (rows-- > 0) {
      for (let i = 0; i < bytes; i++) {
        m[di] = src[si];
        di = (di + 1) & 0xffff;
        si = (si + 1) & 0xffff;
      }
      di = (di + skip) & 0xffff;
      si = (si + skip) & 0xffff;
    }
  }

  present() {
    if (this.dirtyPal) this.rebuildLut();
    const m = this.mem;
    const o = this.out32;
    const lut = this.lut;
    for (let i = 0; i < VISIBLE; i++) o[i] = lut[m[i]];
    this.ctx.putImageData(this.image, 0, 0);
  }
}
