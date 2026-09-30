// Assets read from the player's own copy of the original 1998 game (240R.EXE + data files).
// Nothing here is bundled with the project; everything is parsed from the files the player supplies.

import { Exe } from "./exe.js";

export class OriginalAssets {
  constructor(files) {
    this.id = "original";
    this.files = files;
    this.exe = new Exe(files["240R.EXE"]);
    this.storageKey = "240racing.fs.";
    this.hiscoreSeed = files;
  }

  // "240BURN.BIN", "GFX.BIN", "BANA1.LEV", "BANA2.LEV"
  file(name) {
    return this.files[name];
  }

  // Font unit 468: 58 glyphs of 7x8 at 468:007D, glyph offset table for '!'..'Z' at DS:0202
  get font() {
    const exe = this.exe;
    const table = [];
    for (let k = 0; k < 58; k++) table.push(exe.word(0x8db, 0x202 + k * 2));
    return { data: exe.bytes(0x468, 0x007d, 58 * 56).slice(), table };
  }

  // Graphics unit 57d: two 32x14 car textures (stride 32) at 57D:0C3C and 57D:0E1C
  carTexture(car) {
    return this.exe.bytes(0x57d, car === 1 ? 0x0c3c : 0x0e1c, 32 * 14);
  }

  // Scroller source: two string[255] typed constants at DS:0002 and DS:0102
  get scrollerTexts() {
    return [this.exe.pstr(0x8db, 0x0002), this.exe.pstr(0x8db, 0x0102)];
  }

  // Default hiscore table: ten Pascal strings from 3af:002F, each followed by a float32 multiplier
  get hiscoreDefaults() {
    const out = [];
    let off = 0x002f;
    for (let i = 0; i < 10; i++) {
      const name = this.exe.pstr(0x3af, off);
      off += 1 + name.length;
      const b = this.exe.bytes(0x3af, off, 4);
      out.push({ name, mult: new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true) });
      off += 4;
    }
    return out;
  }

  // Options menu lines "TRACK      : ..." for tracks 1..3 (CS strings in the main program)
  get trackLines() {
    return [0x2abb, 0x2ad9, 0x2afa].map((o) => this.exe.pstr(0x000, o));
  }
}
