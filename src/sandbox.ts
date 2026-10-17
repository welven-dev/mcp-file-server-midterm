import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(
  process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), "workspace")
);

export function safePath(userPath: string): string {
  if (typeof userPath !== "string" || userPath.includes("\0")) {
    throw new Error("Invalid path.");
  }

  const normalized = userPath.replace(/\\/g, "/");

  if (
    path.isAbsolute(userPath) ||
    /^[a-zA-Z]:/.test(userPath) ||
    normalized.startsWith("//") ||
    /%2e/i.test(normalized)
  ) {
    throw new Error("Absolute or encoded paths are not allowed.");
  }

  const fullPath = path.resolve(ROOT, userPath);
  const relativePath = path.relative(ROOT, fullPath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Path escapes the workspace. Not allowed.");
  }

  let currentPath = ROOT;

  for (const part of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, part);

    try {
      const stat = fs.lstatSync(currentPath);

      if (stat.isSymbolicLink()) {
        const realTarget = fs.realpathSync(currentPath);
        const realRoot = fs.realpathSync(ROOT);
        const targetRelative = path.relative(realRoot, realTarget);

        if (
          targetRelative === ".." ||
          targetRelative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(targetRelative)
        ) {
          throw new Error("Symbolic link escapes the workspace. Not allowed.");
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Symbolic link escapes")
      ) {
        throw error;
      }

      const code = (error as NodeJS.ErrnoException).code;

      if (code !== "ENOENT") {
        throw error;
      }

      break;
    }
  }

  return fullPath;
}
