// Font/text unit (segment 468 of 240R.EXE): 58 glyphs of 7x8 pixels, one byte per pixel
// (0 transparent, 1 shadow, other = text colour) and a glyph offset table for '!'..'Z'.
// Å, Ä and Ö are glyphs 26, 27 and 28. The glyph data comes from the active asset set.

import { strInt, strReal } from "./tp.js";

// Browser characters -> CP437 bytes the game understands
const CP437 = { "å": 0x86, "ä": 0x84, "ö": 0x94, "Å": 0x8f, "Ä": 0x8e, "Ö": 0x99 };

export class Font {
  constructor(game) {
    this.g = game;
    const { data, table } = game.assets.font;
    this.data = data;
    this.table = table;
    this.cursor = 0; // DS:41B4
    this.color = 0; // DS:41B6
  }

  // 468:0000
  drawGlyph(ch) {
    if (ch < 0x20) return false;
    if (ch === 0x20) {
      this.cursor = (this.cursor + 7) & 0xffff;
      return true;
    }
    let ofs;
    if (ch === 0x8f) ofs = 0x5b0;
    else if (ch === 0x8e) ofs = 0x5e8;
    else if (ch === 0x99) ofs = 0x620;
    else {
      if (((ch - 0x21) & 0xff) > 0x39) return false;
      ofs = this.table[ch - 0x21];
    }
    const vga = this.g.vga.mem;
    let di = this.cursor;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        const p = this.data[ofs++] ?? 0;
        if (p === 1) vga[di] = 1;
        else if (p > 1) vga[di] = this.color;
        di = (di + 1) & 0xffff;
      }
      di = (di + 313) & 0xffff;
    }
    this.cursor = (this.cursor + 7) & 0xffff;
    return true;
  }

  static codes(s) {
    if (typeof s === "number") return [s];
    const out = [];
    for (const ch of s) out.push(CP437[ch] ?? (ch.charCodeAt(0) & 0xff));
    return out;
  }

  // 468:0d33
  drawChar(x, y, col, ch) {
    this.cursor = (y * 320 + x) & 0xffff;
    this.color = col & 0xff;
    this.drawGlyph(typeof ch === "number" ? ch : Font.codes(ch)[0]);
  }

  // 468:0d52
  drawText(x, y, col, s) {
    this.cursor = (y * 320 + x) & 0xffff;
    this.color = col & 0xff;
    for (const c of Font.codes(s)) this.drawGlyph(c);
  }

  // 468:0db1
  drawInt(x, y, col, n) {
    this.drawText(x, y, col, strInt((n << 16) >> 16));
  }

  // 468:0e08
  drawReal(x, y, col, r) {
    this.drawText(x, y, col, strReal(r, 2, 2));
  }

  // 468:0e69 ReadName: BIOS ReadKey loop with UpCase, å/ä/ö -> Å/Ä/Ö, Backspace, Enter.
  async readName(x, y, maxLen, col) {
    const g = this.g;
    const kbd = g.kbd;
    this.cursor = (y * 320 + x) & 0xffff;
    this.color = col;
    kbd.asciiQueue.length = 0;
    const s = [];
    for (;;) {
      while (kbd.asciiQueue.length === 0) await g.frame();
      let c = kbd.asciiQueue.shift();
      if (c >= 0x61 && c <= 0x7a) c -= 0x20; // UpCase
      if (c === 0x86) c = 0x8f;
      if (c === 0x84) c = 0x8e;
      if (c === 0x94) c = 0x99;
      if (c === 8) {
        if (s.length > 0) {
          s.pop();
          x -= 7;
          this.cursor = (this.cursor - 7) & 0xffff;
          g.blit(g.bg, x, y, x, y, 8, 8);
        }
      } else if (s.length < maxLen) {
        if (this.drawGlyph(c)) {
          s.push(c);
          x += 7;
        }
      }
      if (c === 13) break;
    }
    kbd.clear();
    return String.fromCharCode(...s);
  }
}
