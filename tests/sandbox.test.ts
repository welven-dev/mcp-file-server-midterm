import { describe, it, expect } from "vitest";
import { safePath, ROOT } from "../src/sandbox.js";
import path from "node:path";

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
});
