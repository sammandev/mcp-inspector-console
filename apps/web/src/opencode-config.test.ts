import { describe, expect, it } from "vitest";
import { generateOpenCodeCommand, generateOpenCodeConfig } from "../vendor/mcp-use/client/utils/mcpClientUtils.js";

describe("OpenCode install command", () => {
  it("adds a remote server with quoted environment header references", () => {
    const { command, envVars } = generateOpenCodeCommand("https://x/mcp?a='b'", "My Server", {
      Authorization: "Bearer s3cret",
    });
    expect(command).toBe(
      `opencode mcp add "my_server" --url 'https://x/mcp?a='\\''b'\\''' \\\n  --header 'Authorization={env:AUTHORIZATION}'`,
    );
    expect(command).not.toContain("s3cret");
    expect(envVars).toEqual([{ name: "AUTHORIZATION", header: "Authorization" }]);
  });

  it("has no header flags when the server has none", () => {
    expect(generateOpenCodeCommand("https://x/mcp", "plain").command).toBe(
      `opencode mcp add "plain" --url 'https://x/mcp'`,
    );
  });
});

describe("OpenCode configuration", () => {
  it("adds a remote server whose headers read from environment variables", () => {
    const { config, envVars } = generateOpenCodeConfig("https://x/mcp", "My Server", {
      Authorization: "Bearer s3cret",
      "X-Api-Key": "k3y",
    });
    expect(JSON.parse(config)).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: {
        servers: {
          my_server: {
            type: "remote",
            url: "https://x/mcp",
            headers: {
              Authorization: "{env:AUTHORIZATION}",
              "X-Api-Key": "{env:X_API_KEY}",
            },
          },
        },
      },
    });
    expect(config).not.toContain("s3cret");
    expect(config).not.toContain("k3y");
    expect(envVars).toEqual([
      { name: "AUTHORIZATION", header: "Authorization" },
      { name: "X_API_KEY", header: "X-Api-Key" },
    ]);
  });

  it("omits headers when the server has none", () => {
    const { config, envVars } = generateOpenCodeConfig("https://x/mcp", "plain", {});
    expect(JSON.parse(config).mcp.servers.plain).toEqual({ type: "remote", url: "https://x/mcp" });
    expect(envVars).toEqual([]);
  });
});
