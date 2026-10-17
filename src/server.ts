import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT, safePath } from "./sandbox.js";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_RESULTS = 50;

function text(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
  };
}

async function readTextFile(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    throw new Error("Path is not a file.");
  }

  if (stat.size > MAX_FILE_BYTES) {
    throw new Error("File is too large. Maximum size is 1 MB.");
  }

  const buffer = await fs.readFile(filePath);

  if (buffer.includes(0)) {
    throw new Error("Binary files are not supported.");
  }

  return buffer.toString("utf8");
}

async function listWorkspaceFiles(): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (entry.name === ".git" || entry.name === "node_modules") continue;

      const relative = path.relative(
        ROOT,
        path.join(directory, entry.name)
      );

      const fullPath = safePath(relative);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(relative);
      }
    }
  }

  await walk(ROOT);
  return results;
}

async function runGit(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: ROOT,
    timeout: 10000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  return (stdout + stderr).trim() || "(no output)";
}

export function createServer() {
  const server = new McpServer({
    name: "mcp-file-server-midterm",
    version: "1.0.0",
  });

  server.registerTool(
    "list_files",
    {
      description: "List files and folders inside the workspace.",
      inputSchema: {
        dir: z.string().default(".").describe("Workspace directory"),
      },
    },
    async ({ dir }) => {
      const fullPath = safePath(dir);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const output = entries.slice(0, MAX_RESULTS).map((entry) =>
        entry.isDirectory() ? `${entry.name}/` : entry.name
      );

      return text(output.join("\n") || "(empty)");
    }
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a text file from the workspace, optionally by line range.",
      inputSchema: {
        path: z.string(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      },
    },
    async ({ path: file, offset, limit }) => {
      const content = await readTextFile(safePath(file));
      const lines = content.split(/\r?\n/);
      return text(lines.slice(offset, offset + limit).join("\n") || "(empty range)");
    }
  );

  server.registerTool(
    "write_file",
    {
      description: "Create or replace a text file inside the workspace.",
      inputSchema: {
        path: z.string(),
        content: z.string().max(MAX_FILE_BYTES),
      },
    },
    async ({ path: file, content }) => {
      const fullPath = safePath(file);

      try {
        const previous = await readTextFile(fullPath);
        if (previous.length > 0 && content.trim().length === 0) {
          throw new Error("Refused to overwrite a non-empty file with empty content.");
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("Refused to overwrite")
        ) {
          throw error;
        }

        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf8");
      return text(`Wrote ${content.length} characters to ${file}`);
    }
  );

  server.registerTool(
    "str_replace",
    {
      description: "Replace text only when old_str occurs exactly once.",
      inputSchema: {
        path: z.string(),
        old_str: z.string().min(1),
        new_str: z.string(),
      },
    },
    async ({ path: file, old_str, new_str }) => {
      const fullPath = safePath(file);
      const content = await readTextFile(fullPath);
      const occurrences = content.split(old_str).length - 1;

      if (occurrences !== 1) {
        throw new Error(`old_str occurred ${occurrences} times; exactly one match is required.`);
      }

      const updated = content.replace(old_str, () => new_str);

      if (Buffer.byteLength(updated, "utf8") > MAX_FILE_BYTES) {
        throw new Error("Updated file exceeds the 1 MB size limit.");
      }

      await fs.writeFile(fullPath, updated, "utf8");
      return text(`Replaced one match in ${file}`);
    }
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file, but never delete the handoff files or directories.",
      inputSchema: { path: z.string() },
    },
    async ({ path: file }) => {
      const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
      const protectedFiles = new Set([
        "PROJECT_STATE.md",
        "PLAN_LOG.md",
        "DECISIONS.md",
      ]);

      if (
        protectedFiles.has(normalized) ||
        normalized.startsWith("CHECKPOINTS/") ||
        normalized === "CHECKPOINTS"
      ) {
        throw new Error("Refused to delete a protected handoff file or checkpoint.");
      }

      const fullPath = safePath(file);
      const stat = await fs.lstat(fullPath);

      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("Only regular files can be deleted.");
      }

      await fs.unlink(fullPath);
      return text(`Deleted ${file}`);
    }
  );

  server.registerTool(
    "search_files",
    {
      description: "Search workspace text files, returning at most 50 matches.",
      inputSchema: { query: z.string().min(1).max(500) },
    },
    async ({ query }) => {
      const files = await listWorkspaceFiles();
      const matches: string[] = [];

      for (const file of files) {
        if (matches.length >= MAX_RESULTS) break;

        try {
          const content = await readTextFile(safePath(file));
          content.split(/\r?\n/).forEach((line, index) => {
            if (matches.length < MAX_RESULTS && line.includes(query)) {
              matches.push(`${file}:${index + 1}: ${line.trim()}`);
            }
          });
        } catch {
          // Skip files that cannot be safely read as text.
        }
      }

      return text(matches.join("\n") || "No matches.");
    }
  );

  server.registerTool(
    "git_status",
    {
      description: "Show Git status for the workspace repository.",
      inputSchema: {},
    },
    async () => text(await runGit(["status", "--short", "--branch"]))
  );

  server.registerTool(
    "git_commit",
    {
      description: "Commit changes in the workspace Git repository.",
      inputSchema: {
        message: z.string().min(3).max(200),
      },
    },
    async ({ message }) => {
      await runGit(["add", "-A"]);
      return text(await runGit(["commit", "-m", message]));
    }
  );

  server.registerTool(
    "git_log",
    {
      description: "Show recent workspace Git commits.",
      inputSchema: {
        count: z.number().int().min(1).max(20).default(10),
      },
    },
    async ({ count }) => text(await runGit(["log", "--oneline", "-n", String(count)]))
  );

  server.registerTool(
    "read_project_state",
    {
      description: "Read the current project handoff state.",
      inputSchema: {},
    },
    async () => text(await readTextFile(safePath("PROJECT_STATE.md")))
  );

  server.registerTool(
    "append_plan_log",
    {
      description: "Append a dated entry to the handoff plan log.",
      inputSchema: {
        entry: z.string().min(1).max(5000),
      },
    },
    async ({ entry }) => {
      const fullPath = safePath("PLAN_LOG.md");
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.appendFile(
        fullPath,
        `\n[${new Date().toISOString()}] ${entry}\n`,
        "utf8"
      );
      return text("Appended entry to PLAN_LOG.md");
    }
  );

  server.registerTool(
    "write_checkpoint",
    {
      description: "Create a named checkpoint in the CHECKPOINTS folder.",
      inputSchema: {
        name: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
        content: z.string().min(1).max(20000),
      },
    },
    async ({ name, content }) => {
      const relativePath = `CHECKPOINTS/${name}.md`;
      const fullPath = safePath(relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf8");
      return text(`Created checkpoint ${relativePath}`);
    }
  );

  return server;
}
