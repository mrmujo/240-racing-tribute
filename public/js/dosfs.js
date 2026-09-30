// Tiny emulation of the few DOS files the game writes: HISCORE1..3.DAT.
// Each is a Turbo Pascal `file of THiRec` (262-byte records: string[255] + Real).
// Seeded from the player's own files, persisted per browser in localStorage.

import { real6, toReal6 } from "./exe.js";

export const REC = 262;

function toB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export class DosFs {
  constructor(seedFiles = {}, storageKey = "240racing.fs.") {
    this.key = storageKey;
    this.files = {};
    for (const name of ["HISCORE1.DAT", "HISCORE2.DAT", "HISCORE3.DAT"]) {
      let data = null;
      try {
        const saved = localStorage.getItem(this.key + name);
        if (saved) data = fromB64(saved);
      } catch {
        /* storage unavailable: fall back to the seed */
      }
      if (!data && seedFiles[name]) data = seedFiles[name].slice();
      if (data) this.files[name] = data;
    }
  }

  exists(name) {
    return !!this.files[name.toUpperCase()];
  }

  persist(name) {
    try {
      localStorage.setItem(this.key + name, toB64(this.files[name]));
    } catch {
      /* best effort */
    }
  }

  readRecords(name) {
    const d = this.files[name.toUpperCase()];
    const out = [];
    if (!d) return out;
    for (let o = 0; o + REC <= d.length; o += REC) {
      const len = d[o];
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(d[o + 1 + i]);
      out.push({ name: s, time: real6(d, o + 256) });
    }
    return out;
  }

  writeRecords(name, recs) {
    name = name.toUpperCase();
    const d = new Uint8Array(recs.length * REC);
    recs.forEach((r, k) => {
      const o = k * REC;
      const n = Math.min(255, r.name.length);
      d[o] = n;
      for (let i = 0; i < n; i++) d[o + 1 + i] = r.name.charCodeAt(i) & 0xff;
      toReal6(r.time, d, o + 256);
    });
    this.files[name] = d;
    this.persist(name);
  }

  // Write one record at index `idx` (Seek + Write), growing the file if needed.
  writeRecordAt(name, idx, rec) {
    const recs = this.readRecords(name);
    while (recs.length < idx) recs.push({ name: "", time: 0 });
    recs[idx] = rec;
    this.writeRecords(name, recs);
  }
}
