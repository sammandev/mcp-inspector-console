import { describe, expect, it } from "vitest";
import { inspectorDocumentTitle } from "./documentTitle";

describe("inspectorDocumentTitle", () => {
  it("names the open page after the Inspector prefix", () => {
    expect(inspectorDocumentTitle("Server Metadata")).toBe("Inspector | Server Metadata");
  });

  it("falls back to the bare prefix when no page is known", () => {
    expect(inspectorDocumentTitle(undefined)).toBe("Inspector");
  });
});
