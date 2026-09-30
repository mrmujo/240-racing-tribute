// Loading the player's own copy of the original game files.
// Accepts the distribution zip or the loose files, validates them, and caches them in IndexedDB
// so the player only has to do it once per browser.

export const REQUIRED = {
  "240R.EXE": 40032,
  "GFX.BIN": 64768,
  "240BURN.BIN": 64768,
  "BANA1.LEV": 64814,
  "BANA2.LEV": 64814,
};
export const OPTIONAL = ["HISCORE1.DAT", "HISCORE2.DAT", "HISCORE3.DAT"];

const DB_NAME = "240racing";
const STORE = "files";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCached() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get("set");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCached(files) {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(files, "set");
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* caching is best effort */
  }
}

export async function clearCached() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete("set");
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* ignore */
  }
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Minimal zip reader (central directory, stored + deflate entries).
export async function readZip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt zip directory");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder("latin1").decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const data = u8.subarray(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize);
    const base = name.split("/").pop().toUpperCase();
    if (method === 0) out[base] = data.slice();
    else if (method === 8) out[base] = await inflateRaw(data);
  }
  return out;
}

// Turns a FileList / array of File into {NAME: Uint8Array}, expanding zips.
export async function collect(fileList) {
  const found = {};
  for (const f of fileList) {
    const buf = await f.arrayBuffer();
    if (f.name.toLowerCase().endsWith(".zip")) Object.assign(found, await readZip(buf));
    else found[f.name.split("/").pop().toUpperCase()] = new Uint8Array(buf);
  }
  return found;
}

// Returns {ok, files, missing[], wrong[]}
export function validate(found) {
  const files = {};
  const missing = [];
  const wrong = [];
  for (const [name, size] of Object.entries(REQUIRED)) {
    if (!found[name]) missing.push(name);
    else if (found[name].length !== size) wrong.push(name);
    else files[name] = found[name];
  }
  for (const name of OPTIONAL) if (found[name]) files[name] = found[name];
  return { ok: missing.length === 0 && wrong.length === 0, files, missing, wrong };
}

// Development convenience: the local server exposes ./original at /dev-data/ (never in production).
export async function tryDevData() {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return null;
  const found = {};
  for (const name of [...Object.keys(REQUIRED), ...OPTIONAL]) {
    try {
      const r = await fetch("/dev-data/" + name);
      if (r.ok) found[name] = new Uint8Array(await r.arrayBuffer());
    } catch {
      return null;
    }
  }
  const v = validate(found);
  return v.ok ? v.files : null;
}
