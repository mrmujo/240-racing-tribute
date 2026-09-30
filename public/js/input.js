// Keyboard emulation. The original installs its own INT 9 handler that keeps a key-down table
// indexed by PC scancode (set 1). Extended keys (arrows, right Ctrl/Alt) arrive with an E0 prefix
// that the handler ignores, so they alias to the keypad/left-hand scancodes.

const CODE_TO_SCAN = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06, Digit6: 0x07,
  Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e,
  Tab: 0x0f, KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16,
  KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c,
  ControlLeft: 0x1d, ControlRight: 0x1d, KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22,
  KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29,
  ShiftLeft: 0x2a, Backslash: 0x2b, KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30,
  KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34, Slash: 0x35, ShiftRight: 0x36,
  NumpadMultiply: 0x37, AltLeft: 0x38, AltRight: 0x38, Space: 0x39, CapsLock: 0x3a,
  F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44,
  NumLock: 0x45, ScrollLock: 0x46, Numpad7: 0x47, Home: 0x47, Numpad8: 0x48, ArrowUp: 0x48,
  Numpad9: 0x49, PageUp: 0x49, NumpadSubtract: 0x4a, Numpad4: 0x4b, ArrowLeft: 0x4b, Numpad5: 0x4c,
  Numpad6: 0x4d, ArrowRight: 0x4d, NumpadAdd: 0x4e, Numpad1: 0x4f, End: 0x4f, Numpad2: 0x50,
  ArrowDown: 0x50, Numpad3: 0x51, PageDown: 0x51, Numpad0: 0x52, Insert: 0x52, NumpadDecimal: 0x53,
  Delete: 0x53, NumpadEnter: 0x1c, NumpadDivide: 0x35, F11: 0x57, F12: 0x58, IntlBackslash: 0x56,
};

const EXTENDED = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Insert", "Delete",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10",
]);

// Shortest key press the frame-polled key table is guaranteed to see.
const MIN_TAP = 30;

// On laptops without a keypad, let the main-row +/- act as the keypad ones (sound toggle).
const ALIASES = { Equal: 0x4e, Minus: 0x4a };

export class Keyboard {
  constructor(target = window) {
    this.keys = new Uint8Array(128); // DS:41BA
    this.downAt = new Float64Array(128);
    this.lastScan = 0; // DS:41B8
    this.anyHit = false; // DS:423F
    this.asciiQueue = []; // BIOS keyboard buffer for Crt.ReadKey emulation (byte codes)
    this.onKey = null;
    target.addEventListener("keydown", (e) => this.handle(e, true));
    target.addEventListener("keyup", (e) => this.handle(e, false));
    window.addEventListener("blur", () => this.keys.fill(0));
  }

  handle(e, down) {
    const scan = CODE_TO_SCAN[e.code];
    if (scan === undefined) return;
    if (e.metaKey) return; // leave browser shortcuts alone
    e.preventDefault();
    const scans = [scan];
    if (ALIASES[e.code]) scans.push(ALIASES[e.code]);
    for (const s of scans) {
      if (down) {
        if (!e.repeat) {
          this.lastScan = s;
          this.anyHit = true;
          this.downAt[s] = performance.now();
        }
        this.keys[s] = 1;
      } else {
        // The game polls the table once per frame; keep very short taps visible for at least MIN_TAP ms.
        const held = performance.now() - (this.downAt[s] || 0);
        if (held >= MIN_TAP) this.keys[s] = 0;
        else {
          const at = this.downAt[s];
          setTimeout(() => {
            if (this.downAt[s] === at) this.keys[s] = 0;
          }, MIN_TAP - held);
        }
      }
    }
    if (down) {
      // What Crt.ReadKey would return through the BIOS: CP437 codes, extended keys as #0 + scancode
      const CP437 = { "å": 0x86, "ä": 0x84, "ö": 0x94, "Å": 0x8f, "Ä": 0x8e, "Ö": 0x99 };
      if (e.key.length === 1) {
        const c = CP437[e.key] ?? e.key.charCodeAt(0);
        if (c < 0x100) this.asciiQueue.push(c);
      } else if (e.key === "Enter") this.asciiQueue.push(13);
      else if (e.key === "Backspace") this.asciiQueue.push(8);
      else if (e.key === "Escape") this.asciiQueue.push(27);
      else if (e.key === "Tab") this.asciiQueue.push(9);
      else if (EXTENDED.has(e.code)) this.asciiQueue.push(0, scan);
      if (this.onKey) this.onKey(e);
    }
  }

  down(scan) {
    return this.keys[scan] === 1;
  }

  // 55f:016e
  clear() {
    this.keys.fill(0);
    this.anyHit = false;
  }

  // 55f:014f
  takeAnyHit() {
    const h = this.anyHit;
    this.anyHit = false;
    return h;
  }
}

export const SCAN = CODE_TO_SCAN;
