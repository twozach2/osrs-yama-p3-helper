import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 5173);
const ROOT = resolve(".");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const localPathname =
      pathname.startsWith("/assets/") || pathname.startsWith("/fonts/")
        ? `/public${pathname}`
        : pathname;
    const filePath = normalize(join(ROOT, localPathname));

    if (!filePath.startsWith(ROOT)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use on ${HOST}.`);
    console.error("Another copy of the practice tool may already be running.");
    console.error("Stop the other server, or run with a different port:");
    console.error("  $env:PORT=5174; node server.mjs");
    process.exitCode = 1;
    return;
  }

  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Yama P3 practice tool running at http://${HOST}:${PORT}`);
});
