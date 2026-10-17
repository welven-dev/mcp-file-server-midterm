import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(
  process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), "workspace")
);

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

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

  const realRoot = fs.realpathSync(ROOT);
  const fullPath = path.resolve(realRoot, userPath);

  if (!isInside(realRoot, fullPath)) {
    throw new Error("Path escapes the workspace. Not allowed.");
  }

  const relativePath = path.relative(realRoot, fullPath);
  let currentPath = realRoot;

  for (const part of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, part);

    try {
      const stat = fs.lstatSync(currentPath);

      if (stat.isSymbolicLink()) {
        const realTarget = fs.realpathSync(currentPath);

        if (!isInside(realRoot, realTarget)) {
          throw new Error(
            "Symbolic link escapes the workspace. Not allowed."
          );
        }

        currentPath = realTarget;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Symbolic link escapes")
      ) {
        throw error;
      }

      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        break;
      }

      throw error;
    }
  }

  return fullPath;
}