import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { WebSocketServer } from "ws";
import { attachWebSocket } from "./room.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = path.resolve(__dirname, "../../client/dist");
const PORT = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const wss = new WebSocketServer({ noServer: true });
attachWebSocket(wss);

const server = http.createServer((req, res) => {
  if (!req.url || req.method !== "GET") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  const urlPath = req.url.split("?")[0];

  if (urlPath === "/" || urlPath === "") {
    const filePath = path.join(ROOT, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500).end("Server Error");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  let filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      fs.readFile(filePath, (err2, data) => {
        if (err2) {
          res.writeHead(500).end("Server Error");
          return;
        }
        const contentType = MIME[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      });
    } else {
      const indexPath = path.join(ROOT, "index.html");
      fs.readFile(indexPath, (err2, data) => {
        if (err2) {
          res.writeHead(404).end("Not Found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data);
      });
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[prod] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[prod] WebSocket on ws://0.0.0.0:${PORT}`);
});
