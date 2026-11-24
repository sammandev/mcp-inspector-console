import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./vendor/mcp-use/manifest.json" with { type: "json" };

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const local = (path: string) => path.startsWith("public/")
  ? root(`./public/mcp-use/${path.slice("public/".length)}`)
  : root(`./vendor/mcp-use/${path}`);
const marker = "// Modified for the combined Inspector:";

describe("vendored mcp-use UI provenance", () => {
  it("pins the MIT source and matches every unmodified file checksum", async () => {
    expect(manifest.commit).toBe("8ff4b865e0e5712c66d5077e93392807daca9354");
    expect(await readFile(root("./vendor/mcp-use/LICENSE"), "utf8")).toMatch(/MIT License/);
    for (const { path, sha256 } of manifest.files) {
      const content = await readFile(local(path));
      const actual = createHash("sha256").update(content).digest("hex");
      if (manifest.modified.includes(path)) {
        expect(actual, path).not.toBe(sha256);
        expect(content.toString("utf8").startsWith(marker), path).toBe(true);
      } else {
        expect(actual, path).toBe(sha256);
      }
    }
  });

  it("contains no unrecorded files in the vendored client", async () => {
    const recorded = new Set(manifest.files.map(({ path }) => path));
    const client = root("./vendor/mcp-use/client");
    const entries = await readdir(client, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile())
      .map((entry) => `client/${relative(client, join(entry.parentPath, entry.name)).replaceAll("\\", "/")}`);
    expect(files.filter((file) => !recorded.has(file))).toEqual([]);
  });
});
