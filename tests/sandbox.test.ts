import { afterEach, describe, it, expect } from "vitest";
import { safePath, ROOT } from "../src/sandbox.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const createdPaths: string[] = [];

afterEach(() => {
  for (const item of createdPaths.splice(0)) {
    try {
      fs.rmSync(item, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of test artifacts.
    }
  }
});

describe("sandbox security", () => {
  it("allows a normal path inside the workspace", () => {
    expect(safePath("notes.txt")).toBe(path.join(ROOT, "notes.txt"));
  });

  it("blocks ../ traversal", () => {
    expect(() => safePath("../secret.txt")).toThrow();
  });

  it("blocks nested traversal", () => {
    expect(() => safePath("notes/../../secret.txt")).toThrow();
  });

  it("blocks absolute paths", () => {
    expect(() => safePath("C:\\Windows\\win.ini")).toThrow();
  });

  it("blocks encoded traversal attempts", () => {
    expect(() => safePath("%2e%2e/secret.txt")).toThrow();
  });

  it("blocks a sibling folder named workspace-evil", () => {
    expect(() => safePath("../workspace-evil/secret.txt")).toThrow();
  });

  it("blocks a symbolic link pointing outside the workspace", () => {
    const outsideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "mcp-outside-")
    );
    createdPaths.push(outsideDir);

    const outsideFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(outsideFile, "secret");

    const linkPath = path.join(ROOT, "test-outside-link");
    createdPaths.push(linkPath);

    try {
      fs.symlinkSync(outsideDir, linkPath, "junction");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "EPERM" || code === "EACCES") {
        console.warn("Skipping symlink test: permission denied.");
        return;
      }

      throw error;
    }

    expect(() => safePath("test-outside-link/secret.txt")).toThrow();
  });

  it("blocks a symbolic link to an outside file", () => {
    const outsideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "mcp-outside-file-")
    );
    createdPaths.push(outsideDir);

    const outsideFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(outsideFile, "secret");

    const linkPath = path.join(ROOT, "test-outside-file-link");
    createdPaths.push(linkPath);

    try {
      fs.symlinkSync(outsideFile, linkPath, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "EPERM" || code === "EACCES") {
        console.warn("Skipping symlink test: permission denied.");
        return;
      }

      throw error;
    }

    expect(() => safePath("test-outside-file-link")).toThrow();
  });
});