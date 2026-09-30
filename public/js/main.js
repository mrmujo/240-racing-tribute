import { REQUIRED, collect, validate, loadCached, saveCached, clearCached, tryDevData } from "./files.js";
import { VGA } from "./vga.js";
import { Clock } from "./clock.js";
import { Keyboard } from "./input.js";
import { Speaker } from "./speaker.js";
import { Game } from "./game.js";
import { OriginalAssets } from "./assets-original.js";
import { FreeAssets } from "./free/index.js";

const $ = (id) => document.getElementById(id);
const overlay = $("overlay");
const list = $("list");
const msg = $("msg");
const startBtn = $("start");
const freeBtn = $("playFree");
const forgetBtn = $("forget");
let files = null;
let running = false;

function renderList(found = {}) {
  list.innerHTML = "";
  for (const [name, size] of Object.entries(REQUIRED)) {
    const li = document.createElement("li");
    const f = found[name];
    li.textContent = (f ? (f.length === size ? "✓ " : "✗ ") : "· ") + name;
    if (f) li.className = f.length === size ? "ok" : "bad";
    list.appendChild(li);
  }
}

function ready(set, fromCache) {
  files = set;
  renderList(set);
  msg.textContent = "";
  startBtn.style.display = "inline-block";
  forgetBtn.hidden = !fromCache;
}

async function accept(fileList) {
  msg.textContent = "";
  try {
    const found = await collect(fileList);
    const v = validate(found);
    renderList(found);
    if (!v.ok) {
      const parts = [];
      if (v.missing.length) parts.push("missing " + v.missing.join(", "));
      if (v.wrong.length) parts.push("unexpected size for " + v.wrong.join(", ") + " (expected version 1.01)");
      msg.textContent = "Can't start: " + parts.join("; ") + ".";
      return;
    }
    await saveCached(v.files);
    ready(v.files, true);
    startBtn.focus();
  } catch (e) {
    msg.textContent = "Couldn't read those files: " + e.message;
  }
}

const drop = $("drop");
$("pick").addEventListener("change", (e) => accept(e.target.files));
["dragenter", "dragover"].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  }),
);
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  accept(e.dataTransfer.files);
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

forgetBtn.addEventListener("click", async () => {
  await clearCached();
  files = null;
  startBtn.style.display = "none";
  forgetBtn.hidden = true;
  renderList();
});

// The emulated PC is created once and reused for every game.
let pc = null;
function machine() {
  if (pc) return pc;
  const vga = new VGA($("screen"));
  const kbd = new Keyboard(window);
  const speaker = new Speaker();
  pc = { vga, kbd, speaker, clock: null };
  document.addEventListener("visibilitychange", () => {
    if (!pc.clock) return;
    if (document.hidden) {
      pc.clock.pause();
      speaker.noSound();
    } else pc.clock.resume();
  });
  const present = () => {
    vga.present();
    requestAnimationFrame(present);
  };
  requestAnimationFrame(present);
  return pc;
}

async function start(makeAssets) {
  if (running) return;
  running = true;
  const m = machine();
  m.speaker.unlock();
  let assets;
  try {
    assets = makeAssets();
  } catch (e) {
    msg.textContent = "Couldn't prepare the game: " + e.message;
    running = false;
    return;
  }
  overlay.classList.add("hidden");
  m.clock = new Clock();
  m.kbd.clear();
  m.vga.mem.fill(0);
  const game = new Game({ vga: m.vga, clock: m.clock, kbd: m.kbd, speaker: m.speaker, assets });
  if (["localhost", "127.0.0.1"].includes(location.hostname)) window.__game = game; // test hook
  try {
    await game.run();
  } catch (e) {
    console.error(e);
  }
  // The original exits to DOS here; go back to the start screen instead.
  m.speaker.noSound();
  running = false;
  overlay.classList.remove("hidden");
}

freeBtn.addEventListener("click", () => start(() => new FreeAssets()));
startBtn.addEventListener("click", () => files && start(() => new OriginalAssets(files)));

(async () => {
  renderList();
  const cached = await loadCached();
  if (cached && validate(cached).ok) return ready(cached, true);
  const dev = await tryDevData();
  if (dev) return ready(dev, false);
})();
