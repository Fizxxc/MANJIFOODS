import http from "node:http";
import { readFile } from "node:fs/promises";
const html =
  '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MANJI FOOD — isolated UI test fixture</title><link rel="stylesheet" href="/style.css"><style>:root{--font-body:Quicksand;--font-display:Fredoka}</style><body><div id="root"></div><script src="/app.js"></script></body></html>';
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (/^\/_next\/static\/media\/[a-z0-9.-]+\.woff2$/.test(url.pathname)) {
        res.setHeader("Content-Type", "font/woff2");
        res.end(
          await readFile("." + url.pathname.replace("/_next/", "/.next/")),
        );
      } else if (
        url.pathname === "/style.css" ||
        url.pathname.endsWith(".js")
      ) {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
        );
        res.end(await readFile(".local/ui/" + url.pathname.slice(1)));
      } else if (url.pathname === "/api/time") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ serverTime: Date.now() }));
      } else if (url.pathname.startsWith("/api/")) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          '{"error":"Test API must be intercepted by the UI test runner."}',
        );
      } else {
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      }
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(3120, "127.0.0.1", () =>
    console.log("Isolated UI fixture on http://127.0.0.1:3120"),
  );
