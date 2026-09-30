// Reads data out of the player's own 240R.EXE (a Turbo Pascal 6 MZ executable).
// Nothing from the executable is bundled with this project; it is only parsed in the browser.

export class Exe {
  constructor(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint16(0, true) !== 0x5a4d) throw new Error("240R.EXE is not an MZ executable");
    const lastPage = dv.getUint16(2, true);
    const pages = dv.getUint16(4, true);
    const hdrParas = dv.getUint16(8, true);
    const size = (pages - 1) * 512 + (lastPage || 512);
    this.image = bytes.subarray(hdrParas * 16, size);
  }

  // Linear address of seg:off in the load image (segments as they appear in the listing).
  lin(seg, off) {
    return seg * 16 + off;
  }

  bytes(seg, off, n) {
    const a = this.lin(seg, off);
    return this.image.subarray(a, a + n);
  }

  byte(seg, off) {
    return this.image[this.lin(seg, off)];
  }

  word(seg, off) {
    const a = this.lin(seg, off);
    return this.image[a] | (this.image[a + 1] << 8);
  }

  // Turbo Pascal length-prefixed string
  pstr(seg, off) {
    const a = this.lin(seg, off);
    const n = this.image[a];
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.image[a + 1 + i]);
    return s;
  }
}

// Turbo Pascal 6-byte Real -> JS number
export function real6(b, o = 0) {
  const e = b[o];
  if (e === 0) return 0;
  const sign = b[o + 5] & 0x80 ? -1 : 1;
  const mant =
    (b[o + 5] & 0x7f) * 2 ** 32 + b[o + 4] * 2 ** 24 + b[o + 3] * 2 ** 16 + b[o + 2] * 2 ** 8 + b[o + 1];
  return sign * (1 + mant / 2 ** 39) * 2 ** (e - 129);
}

// JS number -> Turbo Pascal 6-byte Real (used for hiscore files)
export function toReal6(v, out = new Uint8Array(6), o = 0) {
  out.fill(0, o, o + 6);
  if (v === 0 || !Number.isFinite(v)) return out;
  const sign = v < 0 ? 0x80 : 0;
  v = Math.abs(v);
  let e = Math.floor(Math.log2(v));
  let m = v / 2 ** e;
  if (m >= 2) {
    m /= 2;
    e++;
  }
  let mant = Math.round((m - 1) * 2 ** 39);
  if (mant >= 2 ** 39) {
    mant = 0;
    e++;
  }
  out[o] = e + 129;
  out[o + 1] = mant % 256;
  out[o + 2] = Math.floor(mant / 2 ** 8) % 256;
  out[o + 3] = Math.floor(mant / 2 ** 16) % 256;
  out[o + 4] = Math.floor(mant / 2 ** 24) % 256;
  out[o + 5] = (Math.floor(mant / 2 ** 32) & 0x7f) | sign;
  return out;
}
