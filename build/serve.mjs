/* Tiny static server for previewing dist/ locally: npm run serve */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT) || 8080;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(dist, p);
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": types[".html"] }).end(fs.readFileSync(path.join(dist, "404.html"))); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}/`));
