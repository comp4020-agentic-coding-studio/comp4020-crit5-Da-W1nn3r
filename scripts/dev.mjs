#!/usr/bin/env node
// Zero-dependency static server for local preview. A bare site needs no
// bundler dev server, just something that serves files with correct
// content types. Pass a root dir to serve `dist/` instead (used by `preview`).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const root = process.argv[2] ?? ".";
const port = process.env.PORT ?? 5173;

const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split("?")[0]);
    let full = join(root, path);
    if (path.endsWith("/") || (await stat(full)).isDirectory()) {
      full = join(full, "index.html");
    }
    const body = await readFile(full);
    res.writeHead(200, { "Content-Type": TYPES[extname(full)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}`));
