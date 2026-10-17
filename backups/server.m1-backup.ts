import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import { safePath } from "./sandbox.js";

export function createServer() {
  const server = new McpServer({
    name: "mcp-file-server-midterm",
    version: "1.0.0",
  });

  server.registerTool(
    "list_files",
    {
      description:
        "List files and folders inside the safe workspace. Folders end with /.",
      inputSchema: {
        dir: z.string().default(".").describe("Folder path inside the workspace"),
      },
    },
    async ({ dir }) => {
      const entries = await fs.readdir(safePath(dir), {
        withFileTypes: true,
      });

      const lines = entries.map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
      );

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n") || "(empty)",
          },
        ],
      };
    }
  );

  return server;
}
