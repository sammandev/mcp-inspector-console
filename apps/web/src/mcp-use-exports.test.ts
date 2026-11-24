import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
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

  it("compiles utilities only when the installed Inspector client is a source", async () => {
    const candidate = ["bg-white", "90"].join("/");
    const selector = `.${candidate.replace("/", "\\/")}`;
    const inspectorEntry = fileURLToPath(import.meta.resolve("@mcp-use/inspector/client"));
    const inspectorSource = await readFile(inspectorEntry, "utf8");
    expect(inspectorSource).toContain(candidate);

    const webRoot = fileURLToPath(new URL("..", import.meta.url));
    const sourceDirective = `@source "${join(
      webRoot,
      "node_modules/@mcp-use/inspector/dist/client",
    ).replaceAll("\\", "/")}";`;
    const compile = async (source: string) => {
      const root = await mkdtemp(join(tmpdir(), "mcp-use-tailwind-"));
      const entry = join(root, "entry.css");
      await writeFile(entry, `@import "tailwindcss";\n${source}\n`);

      try {
        const result = await build({
          root,
          configFile: false,
          logLevel: "silent",
          plugins: [tailwindcss()],
          build: {
            write: false,
            rollupOptions: { input: entry },
          },
        });
        const output = Array.isArray(result) ? result[0] : result;
        expect(output).toHaveProperty("output");
        if (Array.isArray(output) || !("output" in output)) {
          throw new Error("Vite one-shot build did not return a Rollup output");
        }
        const css = output.output.find(
          (item) => item.type === "asset" && item.fileName.endsWith(".css"),
        );
        expect(css, "Vite must emit a CSS asset").toBeDefined();
        return String(css && css.type === "asset" ? css.source : "");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    };

    const controlCss = await compile("");
    expect(controlCss, "control build must not discover the Inspector-only class").not.toContain(
      selector,
    );

    const sourceCss = await compile(sourceDirective);
    expect(sourceCss, "Inspector @source must emit the package-only class").toContain(selector);
  });
});
