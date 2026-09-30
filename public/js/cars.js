// Car sprite renderer (graphics unit 57d): each car is a 32x14 texture, rotated and affine-mapped onto
// a quad, scan-converted with 9.7 fixed point x and 8.8 fixed point texture coordinates, drawn straight
// to VGA. Texel 0xFF is transparent. The two textures come from the active asset set.

import { round } from "./tp.js";
import { real6 } from "./physics.js";

const w16 = (v) => v & 0xffff;
const s16 = (v) => ((v & 0xffff) << 16) >> 16;
const idiv = (a, b) => s16(Math.trunc(s16(a) / s16(b)));

export class CarRenderer {
  constructor(game) {
    this.g = game;
    // 8 KB texture buffer with a 256-byte stride (57d:0187); car 2 starts at +0x1000.
    this.tex = new Uint8Array(0x20000).fill(0xff);
    for (const [base, car] of [[0x0000, 1], [0x1000, 2]]) {
      const src = game.assets.carTexture(car);
      for (let row = 0; row < 14; row++)
        for (let col = 0; col < 32; col++) this.tex[base + row * 256 + col] = src[row * 32 + col];
    }
    // Real sin/cos tables in degrees, stored as TP Reals
    this.sinTab = new Float64Array(360);
    this.cosTab = new Float64Array(360);
    for (let i = 0; i < 360; i++) {
      this.sinTab[i] = real6(Math.sin(i * 0.017453292519943295));
      this.cosTab[i] = real6(Math.cos(i * 0.017453292519943295));
    }
    // edge table: 201 entries of xa, xb (9.7), ua, va, ub, vb (8.8); xa = 0xFFFF means empty
    this.xa = new Uint16Array(201).fill(0xffff);
    this.xb = new Uint16Array(201);
    this.ua = new Uint16Array(201);
    this.va = new Uint16Array(201);
    this.ub = new Uint16Array(201);
    this.vb = new Uint16Array(201);
    this.frontPixel = [0, 0, 0];
    this.bgOfs = [0, 0, 0];
    this.bgW = [0, 0, 0];
    this.bgH = [0, 0, 0];
    this.minX = this.maxX = this.minY = this.maxY = 0;
    this.curTex = 0;
  }

  // 57d:030c
  scanEdge(x1, y1, u1, v1, x2, y2, u2, v2) {
    if (y1 === y2) return;
    if (y1 > y2) {
      [x1, x2] = [x2, x1];
      [y1, y2] = [y2, y1];
      [u1, u2] = [u2, u1];
      [v1, v2] = [v2, v1];
    }
    if (x1 > x2) {
      if (x1 > this.maxX) this.maxX = x1;
      if (x2 < this.minX) this.minX = x2;
    } else {
      if (x1 < this.minX) this.minX = x1;
      if (x2 > this.maxX) this.maxX = x2;
    }
    const dy = y2 - y1;
    const dx = idiv((x2 - x1) << 7, dy);
    const du = idiv((u2 - u1) << 8, dy);
    const dv = idiv((v2 - v1) << 8, dy);
    let x = w16((x1 << 7) + idiv(dx, 2));
    let y = y1 + 1;
    let u = w16((u1 << 8) + idiv(du, 2));
    let v = w16((v1 << 8) + idiv(dv, 2));
    if (y < 0) {
      x = w16(x + w16(-y * dx));
      y = 0; // the original does not advance u and v here
    }
    if (y2 > 199) y2 = 199;
    if (y < this.minY) this.minY = y;
    if (y2 > this.maxY) this.maxY = y2;
    for (; y <= y2; y++) {
      if (this.xa[y] === 0xffff) {
        this.xa[y] = x;
        this.ua[y] = u;
        this.va[y] = v;
      } else {
        this.xb[y] = x;
        this.ub[y] = u;
        this.vb[y] = v;
      }
      x = w16(x + dx);
      u = w16(u + du);
      v = w16(v + dv);
    }
  }

  // 57d:051a
  fillSpans() {
    const vga = this.g.vga.mem;
    const tex = this.tex;
    let rowOfs = w16(this.minY * 320);
    if (this.minY > this.maxY) return;
    for (let y = this.minY; y <= this.maxY; y++) {
      let xa = this.xa[y] >> 7;
      this.xa[y] = 0xffff;
      let xb = this.xb[y] >> 7;
      let ua, ub, va, vb;
      if (xa > xb) {
        [xa, xb] = [xb, xa];
        ua = this.ub[y];
        ub = this.ua[y];
        va = this.vb[y];
        vb = this.va[y];
      } else {
        ua = this.ua[y];
        ub = this.ub[y];
        va = this.va[y];
        vb = this.vb[y];
      }
      const n = xb + 1 - xa;
      const du = w16(Math.trunc(s16(ub - ua) / n));
      const dv = w16(Math.trunc(s16(vb - va) / n));
      if (xa < 100) {
        ua = w16(ua + w16((100 - xa) * du));
        va = w16(va + w16((100 - xa) * dv));
        xa = 100;
      }
      if (xb > 419) xb = 419;
      let di = w16(rowOfs + xa - 100);
      if (xb - xa >= 0) {
        let cnt = (xb - xa + 1) & 0xff || 256;
        while (cnt-- > 0) {
          const t = tex[this.curTex + ((va >> 8) << 8) + (ua >> 8)];
          ua = w16(ua + du);
          va = w16(va + dv);
          if (t !== 0xff) vga[di] = t;
          di = w16(di + 1);
        }
      }
      rowOfs = w16(rowOfs + 320);
    }
  }

  // 57d:06f8 DrawCar(x, y, angle, car)
  drawCar(x, y, angle, car) {
    this.minY = 32000;
    this.minX = 32000;
    this.maxY = -32000;
    this.maxX = -32000;
    const s = this.sinTab[angle];
    const c = this.cosTab[angle];
    const X = s16(x + 100);
    const X1 = real6(X + (c * -3.6 - s * -4.0));
    const Y1 = real6(y + (s * -3.6 + c * -4.0) * 0.75);
    const X2 = real6(X + (c * 8.4 - s * -4.0));
    const Y2 = real6(y + (s * 8.4 + c * -4.0) * 0.75);
    const X3 = real6(X + (c * 8.4 - s * 4.0));
    const Y3 = real6(y + (s * 8.4 + c * 4.0) * 0.75);
    const X4 = real6(X + (c * -3.6 - s * 4.0));
    const Y4 = real6(y + (s * -3.6 + c * 4.0) * 0.75);
    const [ix1, ix2, ix3, ix4] = [X1, X2, X3, X4].map(round);
    const [iy1, iy2, iy3, iy4] = [Y1, Y2, Y3, Y4].map(round);
    const fx = idiv(ix3 - 100 + (ix2 - 100), 2);
    const fy = idiv(iy2 + iy3, 2);
    this.frontPixel[car] = this.g.vga.getPixel(fx, fy);
    this.scanEdge(ix1, iy1, 0, 0, ix2, iy2, 31, 0);
    this.scanEdge(ix2, iy2, 31, 0, ix3, iy3, 31, 13);
    this.scanEdge(ix3, iy3, 31, 13, ix4, iy4, 0, 13);
    this.scanEdge(ix4, iy4, 0, 13, ix1, iy1, 0, 0);
    if (this.minY >= 199 || this.maxY < 0) return;
    this.bgOfs[car] = w16((this.minY - 2) * 320 + this.minX - 102) & 0xfffe;
    this.bgW[car] = w16(this.maxX - this.minX + 4) >> 1;
    this.bgH[car] = w16(this.maxY - this.minY + 4);
    this.curTex = car === 1 ? 0x0000 : 0x1000;
    this.fillSpans();
  }

  // 57d:069c RestoreCarBg: copy last frame's rectangle back from the level buffer
  eraseCar(car) {
    const vga = this.g.vga.mem;
    const bg = this.g.bg;
    let di = this.bgOfs[car];
    let si = di;
    const bytes = this.bgW[car] * 2;
    if (bytes === 0) return;
    const skip = w16(320 - bytes);
    let rows = this.bgH[car] || 65536;
    while (rows-- > 0) {
      for (let i = 0; i < bytes; i++) {
        vga[di] = bg[si];
        di = w16(di + 1);
        si = w16(si + 1);
      }
      di = w16(di + skip);
      si = w16(si + skip);
    }
  }

  // 57d:0c13
  isOffRoad(car) {
    const p = this.frontPixel[car];
    return p < 0xc0 && p > 0x20;
  }
}
