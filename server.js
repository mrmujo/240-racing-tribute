// Minimal static file server for Railway (or any Node host).
// Serves ./public. The original game files are never served from here in production:
// players load their own copy in the browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
// Local convenience only: if ./original exists (it is gitignored), expose it at /dev-data/
// so the page can auto-load it while developing. Disabled in production and on Railway.
const IS_PROD = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
const DEV_DATA = IS_PROD ? null : path.join(__dirname, "original");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      return send(res, 400, "Bad request");
    }
    if (urlPath === "/healthz") return send(res, 200, "ok");

    let base = ROOT;
    if (urlPath.startsWith("/dev-data/")) {
      if (!DEV_DATA || !fs.existsSync(DEV_DATA)) return send(res, 404, "Not found");
      base = DEV_DATA;
      urlPath = urlPath.slice("/dev-data".length);
    }
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.normalize(path.join(base, urlPath));
    if (!file.startsWith(base + path.sep)) return send(res, 403, "Forbidden");

    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Not found");
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => console.log(`240 Racing JS listening on http://localhost:${PORT}`));
