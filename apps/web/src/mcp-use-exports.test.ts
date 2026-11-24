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
});
