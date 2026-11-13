import { createServer } from "http";
import { parse } from "url";
import net from "net";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
let nextUpgradeHandler = null;

app.prepare().then(() => {
  if (typeof app.getUpgradeHandler === "function") {
    nextUpgradeHandler = app.getUpgradeHandler();
  }

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  // Proxy /ws/* WebSocket upgrades directly to FastAPI on 127.0.0.1:8000
  // so 1 single port (3000) and 1 single tunnel URL handles both Next.js and multiplayer WebSockets!
  server.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/ws/")) {
      const backendSocket = net.connect(8000, "127.0.0.1", () => {
        const headers = [`GET ${req.url} HTTP/1.1`];
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const k = req.rawHeaders[i];
          const v = req.rawHeaders[i + 1];
          if (k.toLowerCase() === "host") {
            headers.push(`Host: 127.0.0.1:8000`);
          } else {
            headers.push(`${k}: ${v}`);
          }
        }
        headers.push("", "");
        backendSocket.write(headers.join("\r\n"));
        if (head && head.length) {
          backendSocket.write(head);
        }
        socket.pipe(backendSocket).pipe(socket);
      });

      backendSocket.on("error", () => {
        try {
          socket.destroy();
        } catch {}
      });
      socket.on("error", () => {
        try {
          backendSocket.destroy();
        } catch {}
      });
    } else if (nextUpgradeHandler) {
      nextUpgradeHandler(req, socket, head);
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Chaos Arena Unified Server ready on http://localhost:${port} (WS /ws/* -> :8000)`);
  });
});
