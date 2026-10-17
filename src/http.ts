import "dotenv/config";
import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const API_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!API_TOKEN || API_TOKEN.length < 32) {
  throw new Error("MCP_AUTH_TOKEN must be set to a secret of at least 32 characters.");
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.use((req, res, next) => {
  const match = (req.header("authorization") ?? "").match(/^Bearer\s+(.+)$/i);

  if (!match || !tokenMatches(match[1], API_TOKEN)) {
    res.status(401).json({
      error: "Unauthorized",
      message: "A valid bearer token is required.",
    });
    return;
  }

  next();
});

type Session = {
  server: ReturnType<typeof createServer>;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, Session>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.header("mcp-session-id");

  try {
    // Initialize a new MCP session.
    if (!sessionId) {
      const server = createServer();

            const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomBytes(24).toString("hex"),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { server, transport });
          console.log("MCP session initialized.");
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;

        if (closedSessionId) {
          sessions.delete(closedSessionId);
          console.log("MCP session closed.");
        }
      };
      res.on("close", () => {
        // The HTTP response may close while an MCP session remains active.
        // Do not destroy the session here.
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Continue an existing session.
    const session = sessions.get(sessionId);

    if (!session) {
      res.status(404).json({
        error: "Unknown or expired MCP session.",
      });
      return;
    }

    await session.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/mcp", (req, res) => {
  const sessionId = req.header("mcp-session-id");
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    res.status(404).json({ error: "Unknown or missing MCP session." });
    return;
  }

  void session.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    res.status(404).json({ error: "Unknown or missing MCP session." });
    return;
  }

  sessions.delete(sessionId!);

  try {
    await session.transport.close();
    await session.server.close();
    res.status(200).end();
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to close MCP session." });
    }
  }
});

app.use((
  error: any,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON request body." });
    return;
  }

  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body exceeds the 1 MB limit." });
    return;
  }

  console.error("HTTP request failed:", error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, HOST, () => {
  console.log(`Authenticated MCP HTTP server listening on http://${HOST}:${PORT}/mcp`);
});