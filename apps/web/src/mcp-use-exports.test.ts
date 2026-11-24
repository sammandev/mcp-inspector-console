import { exec } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  publishedExports,
  unavailableSurfaces,
  type PublishedExportName,
} from "./mcp-use-exports.js";

const expectedExports = [
  "ThemeProvider",
  "InspectorProvider",
  "ToolsTab",
  "ResourcesTab",
  "PromptsTab",
  "SkillsTab",
  "ChatTab",
  "ToolResultRenderer",
  "ViewRenderer",
] as const satisfies readonly PublishedExportName[];

describe("published mcp-use export boundary", () => {
  it("loads every intended Inspector client export at runtime", () => {
    expect(Object.keys(publishedExports)).toEqual(expectedExports);

    for (const name of expectedExports) {
      const value = publishedExports[name];
      expect(
        typeof value === "function" || (typeof value === "object" && value !== null),
        `${name} must be React-compatible`,
      ).toBe(true);
    }
  });

  it("marks non-published shell surfaces for rebuild", () => {
    expect(unavailableSurfaces).toEqual({
      Shell: "rebuild",
      Sampling: "rebuild",
      Elicitation: "rebuild",
      Notifications: "rebuild",
      AppsControls: "rebuild",
      Metadata: "rebuild",
    });
  });

  it("compiles utilities found in the installed Inspector client bundle", async () => {
    const inspectorEntry = fileURLToPath(import.meta.resolve("@mcp-use/inspector/client"));
    const inspectorSource = await readFile(inspectorEntry, "utf8");
    expect(inspectorSource).toContain("bg-white/90");

    const execAsync = promisify(exec);
    await execAsync("pnpm run build", {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    });

    const assetsPath = new URL("../dist/assets/", import.meta.url);
    const cssFile = (await readdir(assetsPath)).find((name) => name.endsWith(".css"));
    expect(cssFile, "Vite must emit a CSS asset").toBeDefined();

    const css = await readFile(new URL(cssFile!, assetsPath), "utf8");
    expect(css).toContain(".bg-white\\/90");
  });
});
