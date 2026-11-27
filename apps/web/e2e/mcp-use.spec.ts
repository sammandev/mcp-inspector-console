import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function chooseOption(page: Page, scope: Page | Locator, label: string, option: string) {
  const combobox = scope.getByRole("combobox", { name: label, exact: true });
  // Base UI select popups animate out and stay mounted while hidden; settle before and after choosing.
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await combobox.click();
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: option, exact: true }).filter({ visible: true }).click();
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

for (const theme of ["light", "dark"] as const) {
  test(`additional panels and RPC states follow native styling in ${theme} mode`, async ({ page }) => {
    test.setTimeout(120_000);
    const server = createServer(async (request, response) => {
      if (request.method !== "POST") {
        response.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number; method: string };
      if (message.id === undefined) {
        response.writeHead(202).end();
        return;
      }
      const results: Record<string, unknown> = {
        initialize: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {}, prompts: {}, resources: {} },
          serverInfo: { name: "ui-fixture", version: "1.0.0" },
        },
        "tools/list": { tools: [] },
        "prompts/list": { prompts: [] },
        "resources/list": { resources: [] },
        "resources/templates/list": { resourceTemplates: [] },
        ping: {},
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(message.method in results
        ? { jsonrpc: "2.0", id: message.id, result: results[message.method] }
        : { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const background = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    // Largest RGB channel difference between the element's background and the surface behind it.
    const contrastWithSurface = (locator: Locator) => locator.evaluate((element) => {
      let parent = element.parentElement;
      let surface = "rgb(255, 255, 255)";
      while (parent) {
        const color = getComputedStyle(parent).backgroundColor;
        if (color !== "transparent" && !/rgba\(0, 0, 0, 0\)|\/ 0\)$/.test(color)) { surface = color; break; }
        parent = parent.parentElement;
      }
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const pixel = (fills: string[]) => {
        context.clearRect(0, 0, 1, 1);
        for (const fill of fills) { context.fillStyle = fill; context.fillRect(0, 0, 1, 1); }
        return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const base = pixel([surface]);
      const over = pixel([surface, getComputedStyle(element).backgroundColor]);
      return Math.max(...base.map((value, index) => Math.abs(value - over[index])));
    });
    try {
      await page.route("https://**", (route) => route.abort());
      await page.setViewportSize({ width: 1280, height: 520 });
      await page.goto(`/?theme=${theme}&server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=protocol`);
      const tabs = page.getByRole("list", { name: "Inspector tabs" });
      await expect(tabs.getByRole("button", { name: "Protocol", exact: true })).toBeVisible({ timeout: 20_000 });
      await tabs.getByRole("button", { name: "Server Metadata", exact: true }).click();
      await expect(page).toHaveTitle("Inspector | Server Metadata");
      const metadataTitle = page.getByTestId("server-info-modal-title");
      await expect(metadataTitle).toBeVisible();
      const metadataHeader = metadataTitle.locator("xpath=../..");
      const nativeHeader = await metadataHeader.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        gap: getComputedStyle(element).columnGap,
        titleGap: getComputedStyle(element.querySelector("h2")!).columnGap,
      }));
      for (const [name, id] of [
        ["Protocol", "inspector-features"], ["Auth", "inspector-auth"],
        ["Client", "inspector-client"], ["Diagnostics", "inspector-diagnostics"],
      ]) {
        const menu = tabs.getByRole("button", { name, exact: true });
        await menu.click();
        await expect(page).toHaveTitle(`Inspector | ${name}`);
        const panel = page.getByTestId(id);
        const header = panel.locator("header");
        const heading = header.getByRole("heading", { name, exact: true });
        await expect(heading).toBeVisible();
        expect.soft(await heading.evaluate((element) => getComputedStyle(element).fontSize)).toBe("15px");
        expect.soft(await heading.locator("svg").count()).toBe(1);
        if (await heading.locator("svg").count()) {
          expect.soft(await heading.locator("svg").evaluate((element) => element.innerHTML))
            .toBe(await menu.locator("svg").evaluate((element) => element.innerHTML));
        }
        const headerStyle = await header.evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          gap: getComputedStyle(element).columnGap,
          titleGap: getComputedStyle(element.querySelector("h2")!).columnGap,
        }));
        expect.soft(headerStyle.gap).toBe(nativeHeader.gap);
        expect.soft(headerStyle.titleGap).toBe(nativeHeader.titleGap);
        expect.soft(Math.abs(headerStyle.height - nativeHeader.height)).toBeLessThanOrEqual(1);
        const borderAtTop = await header.evaluate((element) => getComputedStyle(element).borderBottomColor);
        expect.soft(borderAtTop).toBe("rgba(0, 0, 0, 0)");
        const headerTop = (await header.boundingBox())!.y;
        await panel.evaluate((element) => { element.scrollTop = 100; });
        await page.waitForTimeout(250);
        expect.soft(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        expect.soft(await header.evaluate((element) => getComputedStyle(element).borderBottomColor)).not.toBe(borderAtTop);
        expect.soft((await header.boundingBox())!.y).toBeCloseTo(headerTop, 0);
        const cards = panel.locator("section[aria-labelledby]");
        expect.soft(await cards.count()).toBeGreaterThanOrEqual(2);
        for (const card of await cards.all()) {
          const style = await card.evaluate((element) => {
            const css = getComputedStyle(element);
            return { border: css.borderTopWidth, radius: css.borderRadius, padding: css.paddingTop };
          });
          expect.soft(style).toEqual({ border: "1px", radius: "14px", padding: "16px" });
        }
      }
      await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
      const protocol = page.getByTestId("inspector-features");
      await protocol.getByRole("button", { name: "Send request", exact: true }).click();
      await expect(protocol.getByTestId("inspector-result")).toHaveText("{}");
      await page.getByRole("banner").getByRole("switch", { name: "RPC Panel" }).click();
      const rpc = page.getByRole("complementary", { name: "RPC Panel" });
      const protocolTab = rpc.getByRole("tab", { name: "Protocol", exact: true });
      const networkTab = rpc.getByRole("tab", { name: "Network", exact: true });
      expect.soft(await background(protocolTab)).not.toBe(await background(networkTab));
      const sidebarAccent = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--sidebar-accent)";
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      await expect.poll(() => background(protocolTab)).toBe(sidebarAccent);
      expect.soft(await protocolTab.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
      await expect.poll(() => contrastWithSurface(protocolTab)).toBeGreaterThanOrEqual(8);
      const mcpFilter = rpc.getByRole("checkbox", { name: "MCP", exact: true });
      await expect.poll(() => contrastWithSurface(mcpFilter)).toBeGreaterThanOrEqual(8);
      const checkedBackground = await background(mcpFilter);
      await mcpFilter.click();
      await expect(mcpFilter).toHaveAttribute("aria-checked", "false");
      expect.soft(await background(mcpFilter)).not.toBe(checkedBackground);
      await mcpFilter.click();
      const row = rpc.getByTestId("rpc-message-ping").first().getByRole("button").first();
      const collapsed = await background(row);
      await row.click();
      await expect(row).toHaveAttribute("aria-expanded", "true");
      await page.mouse.move(0, 0);
      expect.soft(await background(row)).not.toBe(collapsed);
      await expect.poll(() => contrastWithSurface(row)).toBeGreaterThanOrEqual(8);
      await row.click();
      await expect(row).toHaveAttribute("aria-expanded", "false");
      await networkTab.click();
      expect.soft(await background(networkTab)).not.toBe(await background(protocolTab));
      await expect.poll(() => background(networkTab)).toBe(sidebarAccent);
      await expect.poll(() => contrastWithSurface(networkTab)).toBeGreaterThanOrEqual(8);
      const networkRow = rpc.getByTestId("network-entry").first().getByRole("button").first();
      const networkCollapsed = await background(networkRow);
      await networkRow.click();
      await page.mouse.move(0, 0);
      expect.soft(await background(networkRow)).not.toBe(networkCollapsed);
      await expect.poll(() => contrastWithSurface(networkRow)).toBeGreaterThanOrEqual(8);
      await expect(rpc.getByTestId("network-entry-details").first()).toBeVisible();
      await networkRow.click();
      await page.keyboard.press("Tab");
      await networkRow.focus();
      expect(await networkRow.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
      await page.getByRole("banner").getByRole("switch", { name: "RPC Panel" }).click();
      await page.keyboard.press("Control+k");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect.soft(dialog.getByText("MCP Use Website", { exact: true })).toHaveCount(0);
      await expect.soft(dialog.getByText("Join Discord Community", { exact: true })).toHaveCount(0);
      await expect(dialog.getByText("MCP Official Documentation", { exact: true })).toBeVisible();
      await expect(dialog.getByText("How to Create an MCP Server", { exact: true })).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      const forcedToggle = page.getByRole("banner").getByRole("button", { name: /Switch to (light|dark) theme/ });
      await expect(forcedToggle).toBeDisabled();
      await expect(forcedToggle).toHaveAttribute("title", "Theme set by URL");
      await page.getByRole("banner").getByRole("button", { name: "Search commands" }).click();
      await expect(page.getByTestId("command-palette-dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.getByRole("banner").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.setViewportSize({ width: 1280, height: 520 });
      for (const [name, id] of [
        ["Protocol", "inspector-features"], ["Auth", "inspector-auth"],
        ["Client", "inspector-client"], ["Diagnostics", "inspector-diagnostics"],
      ]) {
        await tabs.getByRole("button", { name, exact: true }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        const panel = page.getByTestId(id);
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
        await page.setViewportSize({ width: 1280, height: 520 });
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}

test("the default entry opens the published mcp-use inspector in dark mode", async ({ page }) => {
  await page.route("https://**", (route) => route.abort());
  await page.goto("/?theme=dark");

  await expect(page).toHaveURL(/\/mcp\/inspector\?theme=dark$/);
  await expect(page).toHaveTitle("Inspector | Servers");
  const heading = page.getByRole("heading", { name: "MCP Inspector", exact: true });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Connected Servers", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => (
    window as Window & { __MCP_USE_ANONYMIZED_TELEMETRY__?: boolean }
  ).__MCP_USE_ANONYMIZED_TELEMETRY__)).toBe(false);
  expect(await heading.evaluate((element) => getComputedStyle(element).fontFamily.toLowerCase()))
    .toContain("ubuntu");

  const contrast = await heading.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(document.body).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test("the inspector does not auto-connect to an unrelated server", async ({ request }) => {
  const response = await request.get("/mcp/inspector/config.json");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ autoConnectUrl: null });
});

test("the inspector proxy rejects untrusted origins and oversized requests", async ({ page, request }) => {
  const crossOrigin = await request.post("/mcp/inspector/api/proxy", {
    headers: {
      Origin: "http://127.0.0.1:9999",
      "Sec-Fetch-Site": "cross-site",
    },
  });
  expect(crossOrigin.status()).toBe(403);

  const noBrowserOrigin = await request.post("/mcp/inspector/api/proxy");
  expect(noBrowserOrigin.status()).toBe(403);

  await page.goto("/mcp/inspector");
  const statuses = await page.evaluate(async () => {
    const request = (body: string) => fetch("/mcp/inspector/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const invalidTarget = await request("{}");
    const oversized = await request("x".repeat(1024 * 1024 + 1));
    return [invalidTarget.status, oversized.status];
  });
  expect(statuses).toEqual([400, 413]);

  const chunkedStatus = await new Promise<number>((resolve, reject) => {
    const request = httpRequest("http://127.0.0.1:4273/mcp/inspector/api/proxy", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4273", "Transfer-Encoding": "chunked" },
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
    request.write(Buffer.alloc(600_000));
    request.end(Buffer.alloc(600_000));
  });
  expect(chunkedStatus).toBe(413);
});

test("the proxy forwards the server credential and closes an event stream on disconnect", async ({ page }) => {
  let authorization: string | undefined;
  let upstreamClosed = false;
  const server = createServer((request, response) => {
    authorization = request.headers.authorization;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write("data: hello\n\n");
    response.on("close", () => { upstreamClosed = true; });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.goto("/mcp/inspector");
    const firstChunk = await page.evaluate(async (target) => {
      const controller = new AbortController();
      const response = await fetch("/mcp/inspector/api/proxy", {
        headers: { "X-Target-URL": target, Authorization: "Bearer server-credential" },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Unexpected proxy response: ${response.status}`);
      const reader = response.body.getReader();
      const chunk = await reader.read();
      controller.abort();
      return new TextDecoder().decode(chunk.value);
    }, `http://127.0.0.1:${port}/events`);

    expect(firstChunk).toContain("data: hello");
    expect(authorization).toBe("Bearer server-credential");
    await expect.poll(() => upstreamClosed).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("the published interface connects to an MCP server and uses its tools, prompts, and resources", async ({ page }) => {
  test.setTimeout(60_000);
  const methods: string[] = [];
  let failHandshakes = false;
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as {
      id?: number | string;
      method: string;
      params?: { arguments?: { name?: string }; uri?: string };
    };
    methods.push(message.method);
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    if (["initialize", "server/discover"].includes(message.method) && failHandshakes) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: "fixture reconnect failure" },
      }));
      return;
    }

    const results: Record<string, unknown> = {
      initialize: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, prompts: {}, resources: { subscribe: true }, completions: {}, logging: {} },
        serverInfo: { name: "test-server", version: "1.0.0" },
      },
      "tools/list": {
        tools: [{
          name: "say-hello",
          description: "Return a greeting",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        }],
      },
      "tools/call": {
        content: [{ type: "text", text: `Hello, ${message.params?.arguments?.name}!` }],
      },
      "prompts/list": { prompts: [{ name: "greet", description: "A greeting prompt" }] },
      "prompts/get": {
        messages: [{ role: "user", content: { type: "text", text: "Hello from the prompt" } }],
      },
      "resources/list": {
        resources: [
          { name: "example", uri: "resource://example", mimeType: "text/plain" },
          { name: "mini-app", uri: "ui://mini/app.html", mimeType: "text/html;profile=mcp-app" },
        ],
      },
      "resources/templates/list": { resourceTemplates: [] },
      "completion/complete": { completion: { values: ["Ada", "Alan"], total: 2, hasMore: false } },
      "tasks/list": { tasks: [{ taskId: "audit-task", status: "working", createdAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(), ttl: 60000 }] },
      "resources/subscribe": {},
      "resources/unsubscribe": {},
      "logging/setLevel": {},
      ping: {},
      "resources/read": message.params?.uri === "ui://mini/app.html"
        ? { contents: [{
          uri: "ui://mini/app.html",
          mimeType: "text/html;profile=mcp-app",
          text: "<html><body>Sandboxed UI works</body></html>",
        }] }
        : { contents: [{ uri: "resource://example", mimeType: "text/plain", text: "Example resource" }] },
    };
    const result = results[message.method];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=tools`);

    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await expect(tabs.getByRole("button", { name: "Tools", exact: true })).toBeVisible({ timeout: 20_000 });
    for (const name of ["Server Metadata", "Chat", "Tools", "Prompts", "Resources", "Elicitation", "Notifications", "Connection Settings", "Protocol", "Auth", "Client", "Diagnostics"]) {
      await expect(tabs.getByRole("button", { name, exact: true })).toBeVisible();
    }

    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    const protocol = page.getByTestId("inspector-features");
    await expect(protocol.getByRole("heading", { name: "Network", exact: true })).toBeVisible();
    await expect(protocol.getByRole("heading", { name: "Console", exact: true })).toBeVisible();
    await protocol.getByLabel("Request parameters").fill('{"method":"ping","params":{}}');
    await protocol.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(protocol.getByTestId("inspector-result")).toHaveText("{}");

    await tabs.getByRole("button", { name: "Client", exact: true }).click();
    const client = page.getByTestId("inspector-client");
    await expect(client.getByRole("heading", { name: "Roots", exact: true })).toBeVisible();
    await client.getByLabel("Root directories").fill('[{"uri":"file:///C:/audit","name":"audit"}]');
    await client.getByRole("button", { name: "Set roots", exact: true }).click();
    await expect(client.getByTestId("inspector-result")).toContainText("file:///C:/audit");
    await client.getByRole("button", { name: "List tasks", exact: true }).click();
    await expect(client.getByTestId("inspector-result")).toContainText("audit-task");
    await expect(client.getByTestId("inspector-result").locator('button[aria-expanded="true"]').first()).toBeVisible();

    await tabs.getByRole("button", { name: "Server Metadata", exact: true }).click();
    await expect(page.getByTestId("server-info-modal")).toContainText("test-server");
    await expect(page.getByTestId("server-info-diagnostics")).toContainText("Connection diagnostics");
    await expect(page.getByTestId("server-info-diagnostics")).toContainText("ready");
    await tabs.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await tabs.getByRole("button", { name: "Elicitation", exact: true }).click();
    await expect(page.getByText("No elicitation requests")).toBeVisible();
    await tabs.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(page.getByText("No notifications yet")).toBeVisible();
    await tabs.getByRole("button", { name: "Connection Settings", exact: true }).click();
    await expect(page.getByTestId("connection-form-url-input"))
      .toHaveValue(`http://127.0.0.1:${port}/mcp`);
    await expect(page.getByLabel("Connection timeout (ms)")).toHaveValue("30000");
    await expect(page.getByLabel("Network log size")).toHaveValue("256");
    await page.getByTestId("connection-settings-protocol-mode-select").click();
    await page.getByRole("option", { name: "Legacy (2025-11-25)" }).click();
    await page.getByLabel("Connection timeout (ms)").fill("40000");
    await page.getByLabel("Network log size").fill("50");
    const handshakeStart = methods.length;
    await page.getByTestId("connection-form-save-button").click();
    await expect(page.getByText("Connection settings updated", { exact: true })).toBeVisible();
    await expect.poll(() => methods.slice(handshakeStart)).toContain("initialize");
    expect(methods.slice(handshakeStart)).not.toContain("server/discover");
    await expect(page.locator('[data-testid="server-tile-copy-config"]')).toBeVisible();
    await expect(page.locator('[data-testid="server-tile-reconnect"]')).toBeVisible();
    await expect(page.locator('[data-testid="server-tile-remove"]')).toBeVisible();
    await page.locator('[data-testid="server-tile-settings"]').click();
    await expect(tabs.getByRole("button", { name: "Connection Settings", exact: true })).toBeVisible();
    await expect(page.getByLabel("Connection timeout (ms)")).toHaveValue("40000");
    await expect(page.getByLabel("Network log size")).toHaveValue("50");

    await tabs.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByTestId("tool-item-say-hello").click();
    await page.getByTestId("tool-param-name").fill("Ada");
    await page.getByTestId("tool-execution-execute-button").click();
    await expect(page.getByText("Hello, Ada!", { exact: true })).toBeVisible();

    await expect(page.getByText(/manufact/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Deploy", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /discord|github/i })).toHaveCount(0);

    const toolCallsBeforeLoad = methods.filter((method) => method === "tools/call").length;
    await page.getByTestId("tool-execution-load-test-button").click();
    const loadTest = page.getByTestId("load-test-panel");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(loadTest).toBeVisible();
    await expect(loadTest.getByRole("tab", { name: "Tool: say-hello" })).toHaveAttribute("aria-selected", "true");
    await loadTest.getByLabel(/^Requests/).fill("5");
    await loadTest.getByLabel(/^Concurrency/).fill("2");
    await loadTest.getByRole("button", { name: "Start", exact: true }).click();
    const loadSummary = loadTest.getByTestId("load-test-summary");
    await expect(loadSummary).toBeVisible({ timeout: 15_000 });
    await expect(loadSummary.locator("dt", { hasText: /^Requests$/ }).locator("+ dd")).toHaveText("5");
    await expect(loadSummary.locator("dt", { hasText: /^OK$/ }).locator("+ dd")).toHaveText("5");
    expect(methods.filter((method) => method === "tools/call").length - toolCallsBeforeLoad).toBe(5);
    const loadDownloadPromise = page.waitForEvent("download");
    await loadTest.getByRole("button", { name: "Export JSON", exact: true }).click();
    const loadExport = JSON.parse(await readFile(await (await loadDownloadPromise).path(), "utf8"));
    expect(loadExport.target).toEqual({ tool: "say-hello", arguments: { name: "Ada" } });
    expect(loadExport.summary).toEqual(expect.objectContaining({ requests: 5, ok: 5 }));
    await page.getByTestId("tool-execution-execute-button").click();
    await expect(loadTest).toBeHidden();
    await expect(page.getByText("Hello, Ada!", { exact: true })).toBeVisible();
    await page.getByTestId("tool-execution-load-test-button").click();
    await expect(loadSummary).toBeVisible();
    await loadTest.getByRole("button", { name: "Close load test", exact: true }).click();
    await expect(loadTest).toHaveCount(0);
    await expect(page.getByText("Hello, Ada!", { exact: true })).toBeVisible();

    await expect(page.getByTestId("inspector-sidebar-footer")).toHaveCount(0);
    const banner = page.getByRole("banner");
    const headerActions = await banner.evaluate((element) => [...element.querySelectorAll("button, [role=switch]")]
      .filter((node) => (node as HTMLElement).offsetParent)
      .map((node) => node.getAttribute("aria-label") ?? node.textContent?.trim() ?? ""));
    expect(headerActions.indexOf("Switch to light theme")).toBeGreaterThan(headerActions.indexOf("RPC Panel"));
    const searchCommands = banner.getByRole("button", { name: "Search commands" });
    await searchCommands.click();
    await expect(page.getByTestId("command-palette-dialog")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("OpenCode");
    await expect(page.getByTestId("command-palette-item-open-in-opencode")).toBeVisible();
    await expect(page.getByTestId("command-palette-item-open-in-opencode").getByRole("img", { name: "OpenCode" }))
      .toHaveAttribute("src", "https://cdn.simpleicons.org/opencode");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("command-palette-item-open-in-opencode").click();
    await expect(page.getByTestId("command-palette-dialog")).toBeHidden();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/^opencode mcp add "[^"]+" --url '/);
    await searchCommands.click();
    await expect(page.getByTestId("command-palette-dialog")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("load testing");
    await page.getByTestId("command-palette-item-feature-diagnostics-load-title").click();
    await expect(page).toHaveURL(/tab=diagnostics/);
    await expect(page.getByRole("region", { name: "Load testing" })).toBeInViewport();
    await searchCommands.click();
    await page.getByTestId("command-palette-input").fill("Auth");
    await page.getByTestId("command-palette-item-menu-auth").click();
    await expect(page).toHaveURL(/tab=auth/);
    await expect(page.getByRole("heading", { level: 2, name: "Auth" })).toBeVisible();
    await searchCommands.click();
    await expect(page.getByTestId("command-palette-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette-dialog")).toBeHidden();
    await searchCommands.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("command-palette-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await banner.getByRole("button", { name: "Add to Client" }).click();
    await page.getByRole("menuitem", { name: "OpenCode" }).click();
    const openCodeDialog = page.getByRole("dialog", { name: "Add to OpenCode" });
    await expect(openCodeDialog).toContainText("opencode mcp add");
    await expect(openCodeDialog).toContainText('"type": "remote"');
    await expect(openCodeDialog).toContainText("opencode.json");
    await page.keyboard.press("Escape");
    const rpcSwitch = page.getByRole("banner").getByRole("switch", { name: "RPC Panel" });
    await rpcSwitch.click();
    const rpcPanel = page.getByRole("complementary", { name: "RPC Panel" });
    const rpcResize = page.getByRole("separator", { name: "Resize RPC Panel" });
    await expect(rpcResize).toBeVisible();
    const rpcWidthBefore = Number(await rpcResize.getAttribute("aria-valuenow"));
    await expect.poll(async () => Math.round((await rpcPanel.boundingBox())?.width ?? 0)).toBe(rpcWidthBefore);
    await expect
      .poll(async () => {
        const first = (await rpcResize.boundingBox())?.x;
        await page.waitForTimeout(100);
        return first === (await rpcResize.boundingBox())?.x;
      })
      .toBe(true);
    const grip = await rpcResize.boundingBox();
    if (!grip) throw new Error("RPC Panel resize handle has no box");
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 120, grip.y + grip.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(rpcResize).toHaveAttribute("aria-valuenow", String(rpcWidthBefore + 120));
    await expect.poll(async () => Math.round((await rpcPanel.boundingBox())?.width ?? 0)).toBe(rpcWidthBefore + 120);
    await rpcResize.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rpcResize).toHaveAttribute("aria-valuenow", String(rpcWidthBefore + 104));
    await rpcPanel.getByRole("tab", { name: "Network", exact: true }).click();
    const toolRequest = rpcPanel.getByTestId("network-entry").filter({ hasText: "tools/call" }).last();
    await expect(toolRequest).toContainText("200");
    await toolRequest.getByRole("button").first().click();
    await expect(toolRequest.getByTestId("network-entry-details")).toContainText("Hello, Ada!");
    await rpcPanel.getByRole("tab", { name: "Protocol", exact: true }).click();
    await rpcSwitch.click();
    await expect(rpcResize).toHaveCount(0);

    await tabs.getByRole("button", { name: "Prompts", exact: true }).click();
    await page.getByTestId("prompt-item-greet").click();
    await expect(page.getByText("No arguments required", { exact: true })).toBeVisible();
    await page.getByTestId("prompt-execute-button").click();
    await expect(page.getByText("Hello from the prompt", { exact: true })).toBeVisible();

    const completionRequestsBeforeResourceTab = methods.filter((method) => method === "completion/complete").length;
    await tabs.getByRole("button", { name: "Resources", exact: true }).click();
    await expect(page.getByText("No resource templates available", { exact: true })).toBeVisible();
    expect(methods.filter((method) => method === "completion/complete")).toHaveLength(completionRequestsBeforeResourceTab);
    await page.getByTestId("resource-item-example").click();
    await expect(page.getByTestId("resource-result-json")).toContainText("Example resource");

    const sandboxResponse = page.waitForResponse((response) =>
      response.url().startsWith("http://localhost:4273/mcp/inspector/sandbox?"),
    );
    await page.getByTestId("resource-item-mini-app").click();
    await expect(page.getByTestId("resource-widget-preview")).toBeVisible();
    expect((await sandboxResponse).status()).toBe(200);
    await expect(
      page.frameLocator('[data-testid="mcp-app-frame"] iframe').frameLocator("iframe")
        .getByText("Sandboxed UI works"),
    ).toBeVisible();

    await page.goto(
      `http://localhost:4273/mcp/inspector?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=resources`,
    );
    const alternateSandboxResponse = page.waitForResponse((response) =>
      response.url().startsWith("http://127.0.0.1:4273/mcp/inspector/sandbox?"),
    );
    await page.getByTestId("resource-item-mini-app").click();
    expect((await alternateSandboxResponse).status()).toBe(200);
    await expect(
      page.frameLocator('[data-testid="mcp-app-frame"] iframe').frameLocator("iframe")
        .getByText("Sandboxed UI works"),
    ).toBeVisible();

    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("banner").getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.getByRole("banner").getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.evaluate(() => localStorage.setItem("theme", "system"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("banner").getByRole("button", { name: "Switch to light theme" })).toBeEnabled();
    await page.evaluate(() => localStorage.setItem("theme", "sepia"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.setViewportSize({ width: 390, height: 844 });
    const shortcuts = page.getByRole("navigation", { name: "Inspector shortcuts" });
    await expect(shortcuts).toBeVisible();
    await shortcuts.getByRole("button", { name: "RPC logs" }).click();
    await expect(page.getByRole("dialog", { name: "RPC logs" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1280, height: 800 });
    await tabs.getByRole("button", { name: "Connection Settings", exact: true }).click();
    await page.getByTestId("connection-settings-protocol-mode-select").click();
    await page.getByRole("option", { name: "Auto", exact: true }).click();
    await page.getByLabel("Connection timeout (ms)").fill("50000");
    const failedHandshakeStart = methods.length;
    failHandshakes = true;
    await page.getByTestId("connection-form-save-button").click();
    await expect.poll(() => methods.slice(failedHandshakeStart)).toContain("server/discover");
    await expect.poll(() => methods.slice(failedHandshakeStart)).toContain("initialize");
    await expect(page.locator('[data-testid="server-tile-status-failed"]')).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("fixture reconnect failure");

    expect(methods).toEqual(expect.arrayContaining([
      "initialize", "tools/list", "tools/call", "prompts/list", "prompts/get",
      "resources/list", "resources/read",
      "tasks/list", "ping",
    ]));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Official Inspector workflows run against the selected mcp-use connection", async ({ page }) => {
  test.setTimeout(90_000);
  const methods: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/.well-known/oauth-protected-resource") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ resource: "http://127.0.0.1/mcp", authorization_servers: ["http://127.0.0.1/auth"] }));
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number | string; method: string };
    methods.push(message.method);
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const results: Record<string, unknown> = {
      initialize: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {}, resources: { subscribe: true }, logging: {} },
        serverInfo: { name: "workflow-server", version: "1.0.0" },
      },
      "tools/list": { tools: [{
        name: "audit-script",
        inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      }] },
      "resources/list": { resources: [{ name: "report", uri: "resource://report", mimeType: "text/plain" }] },
      "resources/templates/list": { resourceTemplates: [] },
      "prompts/list": { prompts: [] },
      "resources/subscribe": {},
      "resources/unsubscribe": {},
      "logging/setLevel": {},
      "tasks/list": { tasks: [{ taskId: "audit-task", status: "working" }] },
      ping: {},
    };
    const result = results[message.method];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const serverUrl = `http://127.0.0.1:${port}/mcp?api_key=fixture-secret`;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(serverUrl)}&tab=tools`);
    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await expect(page.getByTestId("tool-item-audit-script")).toBeVisible({ timeout: 20_000 });
    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    const inspector = page.getByTestId("inspector-features");
    const result = inspector.getByTestId("inspector-result");

    await tabs.getByRole("button", { name: "Client", exact: true }).click();
    const client = page.getByTestId("inspector-client");
    await client.getByLabel("Root directories").fill('[{"uri":"file:///C:/audit","name":"audit"}]');
    await client.getByRole("button", { name: "Set roots", exact: true }).click();
    await expect.poll(() => methods).toContain("notifications/roots/list_changed");
    await expect(client.getByTestId("inspector-result")).toContainText("file:///C:/audit");
    await client.getByRole("button", { name: "List tasks", exact: true }).click();
    await expect(client.getByTestId("inspector-result")).toContainText("audit-task");

    await tabs.getByRole("button", { name: "Diagnostics", exact: true }).click();
    const diagnostics = page.getByTestId("inspector-diagnostics");
    await diagnostics.getByLabel("Request count").fill("6");
    await diagnostics.getByLabel("Concurrency").fill("2");
    await diagnostics.getByRole("button", { name: "Start load test", exact: true }).click();
    await expect(diagnostics.getByRole("alert")).toContainText("Confirm that repeated requests are safe");
    const pingsBefore = methods.filter((method) => method === "ping").length;
    await diagnostics.getByLabel("I understand this repeats requests").check();
    await diagnostics.getByRole("button", { name: "Start load test", exact: true }).click();
    await expect(diagnostics.getByTestId("inspector-result")).toContainText('"succeeded": 6');
    expect(methods.filter((method) => method === "ping").length - pingsBefore).toBe(6);

    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    const network = inspector.getByTestId("network-traffic");
    const pingRequest = network.getByTestId("network-entry").filter({ hasText: "ping" }).first();
    await expect(pingRequest).toContainText("200");
    await expect(pingRequest).toContainText(`127.0.0.1:${port}/mcp`);
    await pingRequest.getByRole("button").first().click();
    const pingDetails = pingRequest.getByTestId("network-entry-details");
    await expect(pingDetails).toContainText("Request headers");
    await expect(pingDetails).toContainText("mcp-protocol-version");
    await expect(pingDetails).toContainText("Response body");
    await expect(pingDetails).toContainText('"method": "ping"');
    await expect(network).not.toContainText("fixture-secret");
    const networkDownloadPromise = page.waitForEvent("download");
    await inspector.getByRole("button", { name: "Export network", exact: true }).click();
    const networkExport = await readFile(await (await networkDownloadPromise).path(), "utf8");
    expect(networkExport).toContain("requestHeaders");
    expect(networkExport).not.toContain("fixture-secret");

    await tabs.getByRole("button", { name: "Auth", exact: true }).click();
    const auth = page.getByTestId("inspector-auth");
    await auth.getByRole("button", { name: "Discover protected resource", exact: true }).click();
    await expect(auth.getByTestId("inspector-result")).toContainText("authorization_servers");

    await tabs.getByRole("button", { name: "Diagnostics", exact: true }).click();
    await expect(diagnostics.getByText(/pnpm inspect --url/).first()).toBeVisible();
    await expect(diagnostics).not.toContainText("fixture-secret");

    const configurationDownloadPromise = page.waitForEvent("download");
    await diagnostics.getByRole("button", { name: "Export configuration", exact: true }).click();
    const configurationExport = await readFile(await (await configurationDownloadPromise).path(), "utf8");
    expect(configurationExport).not.toContain("fixture-secret");
    expect(configurationExport).toContain("api_key=");

    const downloadPromise = page.waitForEvent("download");
    await diagnostics.getByRole("button", { name: "Export diagnostics", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("inspector-diagnostics.json");
    const exported = await readFile(await download.path(), "utf8");
    expect(exported).toContain("workflow-server");
    expect(exported).toContain("notifications/roots/list_changed");
    expect(exported).not.toContain("fixture-secret");

    const fixture = fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url));
    await diagnostics.getByLabel("Server configuration").fill(JSON.stringify({
      mcpServers: { "local-audit": { command: process.execPath, args: [fixture] } },
    }));
    await diagnostics.getByRole("button", { name: "Import profiles", exact: true }).click();
    await expect(diagnostics.getByTestId("inspector-result")).toContainText("localProcessesAwaitExplicitLaunch");
    await diagnostics.getByRole("button", { name: "Launch local server: local-audit", exact: true }).click();
    await expect(diagnostics.getByTestId("inspector-result")).toContainText("/mcp/inspector/api/local/");

    await diagnostics.getByRole("button", { name: "Refresh sessions", exact: true }).click();
    await expect(diagnostics.getByTestId("inspector-result")).toContainText('"closed": false');

    await expect(async () => {
      await diagnostics.getByRole("button", { name: "Read stderr: local-audit", exact: true }).click();
      await expect(diagnostics.getByTestId("inspector-result")).toContainText("method:tools/list", { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(diagnostics.getByTestId("inspector-result")).toContainText("stdio fixture ready");
    await expect(diagnostics.getByTestId("inspector-result")).toContainText("method:initialize");
    await diagnostics.getByRole("button", { name: "Stop process: local-audit", exact: true }).click();
    await expect(diagnostics.getByTestId("inspector-result")).toContainText('"stopped"');
    await expect(diagnostics.getByRole("button", { name: "Read stderr: local-audit", exact: true })).toHaveCount(0);
    await diagnostics.getByRole("button", { name: "Refresh sessions", exact: true }).click();
    await expect(diagnostics.getByTestId("inspector-result")).toContainText('"localProcesses": []');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Official Inspector analysis, history and connection workflows use the selected connection", async ({ page }) => {
  test.setTimeout(90_000);
  const methods: string[] = [];
  const revokedTokens: string[] = [];
  let calls = 0;
  let origin = "";
  const json = (response: import("node:http").ServerResponse, body: unknown) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/auth/revoke") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      const token = form.get("token");
      if (token) revokedTokens.push(token);
      response.writeHead(200).end();
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/.well-known/oauth-protected-resource")) {
      json(response, { resource: `${origin}/mcp`, authorization_servers: [`${origin}/auth`] });
      return;
    }
    if (request.method === "GET" && request.url === "/.well-known/oauth-authorization-server/auth") {
      json(response, { issuer: `${origin}/auth`, authorization_endpoint: `${origin}/auth/authorize`, token_endpoint: `${origin}/auth/token`, revocation_endpoint: `${origin}/auth/revoke` });
      return;
    }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number | string; method: string; params?: Record<string, unknown> };
    methods.push(message.method);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    if (message.method === "tools/call") {
      calls++;
      const result = { content: [{ type: "text", text: "scanned" }], structuredContent: { findings: calls, path: (message.params?.arguments as { path?: string })?.path } };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "warning", logger: "audit", data: "fixture log line" } })}\n\n`);
      response.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n\n`);
      return;
    }
    const results: Record<string, unknown> = {
      initialize: { protocolVersion: "2025-03-26", capabilities: { tools: {}, logging: {} }, serverInfo: { name: "analysis-server", version: "2.0.0" }, instructions: "Audit scripts safely" },
      "tools/list": { tools: [{
        name: "audit-script",
        inputSchema: { type: "object", properties: { path: { type: ["string", "null"], description: "Script path" } } },
        outputSchema: { type: "object", properties: { findings: { type: "number" }, path: { type: "string" } }, required: ["findings"] },
      }] },
      "resources/list": { resources: [], nextCursor: "next-page" },
      "resources/templates/list": { resourceTemplates: [] }, "prompts/list": { prompts: [] },
      "logging/setLevel": {}, ping: {},
    };
    const result = message.method === "resources/list" && message.params?.cursor === "next-page"
      ? { resources: [{ uri: "resource://page-2" }] }
      : results[message.method];
    json(response, result === undefined ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } } : { jsonrpc: "2.0", id: message.id, result });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  const serverUrl = `${origin}/mcp`;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(({ serverUrl, issuer }: { serverUrl: string; issuer: string }) => {
      let hash = 0;
      for (let index = 0; index < serverUrl.length; index++) {
        hash = (hash << 5) - hash + serverUrl.charCodeAt(index);
        hash |= 0;
      }
      localStorage.setItem(`mcp:auth_${Math.abs(hash).toString(16)}_tokens`, JSON.stringify({
        issuer,
        access_token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdWRpdCJ9.signature",
        refresh_token: "refresh-token-secret",
        token_type: "Bearer",
        expires_at: Date.now() + 60_000,
      }));
    }, { serverUrl, issuer: `${origin}/auth` });
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(serverUrl)}&tab=tools`);
    await expect(page.getByTestId("tool-item-audit-script")).toBeVisible({ timeout: 20_000 });
    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    const inspector = page.getByTestId("inspector-features");
    await expect(inspector.getByRole("navigation", { name: "Inspector features" })).toHaveCount(0);
    await expect(inspector.getByLabel("Request parameters")).toBeVisible();
    await tabs.getByRole("button", { name: "Auth", exact: true }).click();
    await expect(page.getByRole("button", { name: "Discover authorization server", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show tokens", exact: true })).toBeVisible();
    await tabs.getByRole("button", { name: "Client", exact: true }).click();
    await expect(page.getByLabel("Root directories")).toBeVisible();
    await expect(page.getByRole("button", { name: "List tasks", exact: true })).toBeVisible();
    const client = page.getByTestId("inspector-client");
    await client.getByLabel("Task id").fill("not-supported");
    await client.getByRole("button", { name: "Get task", exact: true }).click();
    await expect(client.getByRole("alert")).toContainText("Method not found");
    await tabs.getByRole("button", { name: "Diagnostics", exact: true }).click();
    await expect(page.getByRole("button", { name: "Refresh sessions", exact: true })).toBeVisible();
    await expect(page.getByLabel("Server configuration")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start load test", exact: true })).toBeVisible();
    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    await tabs.getByRole("button", { name: "Server Metadata", exact: true }).click();
    const metadata = page.getByTestId("server-info-modal");
    await expect(metadata).toContainText("analysis-server");
    await expect(metadata).toContainText("2025-03-26");
    await expect(metadata).toContainText("Audit scripts safely");
    await expect(page.getByTestId("server-info-diagnostics")).toContainText("ready");
    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();

    await tabs.getByRole("button", { name: "Notifications", exact: true }).click();
    await chooseOption(page, page, "Active log level", "debug");
    await page.getByRole("button", { name: "Set log level", exact: true }).click();
    await expect.poll(() => methods).toContain("logging/setLevel");

    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    await inspector.getByRole("button", { name: "Send request", exact: true }).click();
    await expect.poll(() => methods).toContain("ping");
    await expect(inspector.getByTestId("inspector-result")).toBeVisible();
    await expect(inspector.getByRole("listitem").filter({ hasText: /ping.*ok.*ms/ }).first()).toBeVisible();
    const pingCount = methods.filter((method) => method === "ping").length;
    await inspector.getByLabel("Request parameters").fill('[{"method":"ping","params":{}},{"method":"ping","params":{}}]');
    await inspector.getByRole("button", { name: "Send request", exact: true }).click();
    await expect.poll(() => methods.filter((method) => method === "ping").length).toBe(pingCount + 2);
    await inspector.getByLabel("Request parameters").fill('{"method":"resources/list","params":{}}');
    await inspector.getByRole("button", { name: "Send request", exact: true }).click();
    await inspector.getByRole("button", { name: "Fetch next page", exact: true }).click();
    const protocolTraffic = inspector.getByTestId("protocol-traffic");
    const resourcesLists = protocolTraffic.getByRole("listitem").filter({ hasText: /resources\/list\s*ok/ });
    await expect(resourcesLists).toHaveCount(2);
    await resourcesLists.last().getByRole("button").first().click();
    await expect(protocolTraffic).toContainText("resource://page-2");
    await inspector.getByLabel("Method filter").fill("resources/list");
    await chooseOption(page, inspector, "Direction", "Received");
    await expect(protocolTraffic).toContainText("resource://page-2");
    await expect(protocolTraffic.getByRole("listitem").filter({ hasText: "ping" })).toHaveCount(0);
    const protocolDownloadPromise = page.waitForEvent("download");
    await inspector.getByRole("button", { name: "Export protocol", exact: true }).click();
    expect((await protocolDownloadPromise).suggestedFilename()).toBe("protocol.json");

    await tabs.getByRole("button", { name: "Auth", exact: true }).click();
    const auth = page.getByTestId("inspector-auth");
    await auth.getByRole("button", { name: "Discover authorization server", exact: true }).click();
    await expect(auth.getByTestId("inspector-result")).toContainText("revocation_endpoint");
    await auth.getByRole("button", { name: "Show tokens", exact: true }).click();
    await expect(auth.getByTestId("inspector-result")).toContainText("eyJh…ture");
    await expect(auth.getByTestId("inspector-result")).toContainText("refr…cret");
    await expect(auth.getByTestId("inspector-result")).not.toContainText("refresh-token-secret");
    await expect(auth.getByTestId("inspector-result")).not.toContainText("eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdWRpdCJ9.signature");
    await auth.getByRole("button", { name: "Revoke tokens", exact: true }).click();
    await expect(auth.getByTestId("inspector-result")).toContainText("access_token");
    await expect(auth.getByTestId("inspector-result")).toContainText("refresh_token");
    expect(revokedTokens).toEqual(expect.arrayContaining([
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdWRpdCJ9.signature",
      "refresh-token-secret",
    ]));

    await tabs.getByRole("button", { name: "Diagnostics", exact: true }).click();
    const diagnostics = page.getByTestId("inspector-diagnostics");
    await chooseOption(page, diagnostics, "Export format", "VS Code (servers)");
    const downloadPromise = page.waitForEvent("download");
    await diagnostics.getByRole("button", { name: "Export connected servers", exact: true }).click();
    const download = await downloadPromise;
    expect(Object.values(JSON.parse(await readFile(await download.path(), "utf8")).servers)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "http", url: serverUrl }),
    ]));

  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("cancels inspector action on page switch and preserves legacy navigation", async ({ page }) => {
  const methods: string[] = [];
  const json = (response: import("node:http").ServerResponse, body: unknown) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number | string; method: string };
    methods.push(message.method);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    if (message.method === "ping") {
      setTimeout(() => {
        if (!response.destroyed) json(response, { jsonrpc: "2.0", id: message.id, result: { pong: true } });
      }, 800);
      return;
    }
    const results: Record<string, unknown> = {
      initialize: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "navigation-server", version: "1.0.0" } },
      "tools/list": { tools: [{ name: "ping-tool", inputSchema: { type: "object", properties: {} } }] },
      "prompts/list": { prompts: [] },
      "resources/list": { resources: [] },
      "resources/templates/list": { resourceTemplates: [] },
    };
    if (results[message.method] === undefined) {
      json(response, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
      return;
    }
    json(response, { jsonrpc: "2.0", id: message.id, result: results[message.method] });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=inspector`);
    await expect.poll(() => methods).toContain("initialize");
    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await expect(tabs.getByRole("button", { name: "Protocol", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Auth", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Client", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Diagnostics", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Inspector", exact: true })).toHaveCount(0);
    await expect(tabs.getByRole("button", { name: "Protocol", exact: true })).toHaveAttribute("data-active", "true");
    const protocol = page.getByTestId("inspector-features");
    await protocol.getByLabel("Request parameters").fill('{"method":"ping","params":{}}');
    await protocol.getByRole("button", { name: "Send request", exact: true }).click();
    await expect.poll(() => methods).toContain("ping");
    await tabs.getByRole("button", { name: "Auth", exact: true }).click();
    await expect(page).toHaveURL(/tab=auth/);
    await expect(page.getByRole("heading", { name: "Auth", exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    await expect(protocol.getByTestId("inspector-result")).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("native Tools keeps run history and conformance beside tool execution", async ({ page }) => {
  test.setTimeout(60_000);
  const methods: string[] = [];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const json = (response: import("node:http").ServerResponse, body: unknown) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as {
      id?: number | string;
      method: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    methods.push(message.method);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    if (message.method === "tools/call") {
      const name = message.params?.name ?? "";
      const args = message.params?.arguments ?? {};
      calls.push({ name, args });
      const result = name === "plain-tool"
        ? { content: [{ type: "text", text: "plain output" }] }
        : { content: [{ type: "text", text: "audit complete" }], structuredContent: { findings: calls.length, path: args.path } };
      json(response, { jsonrpc: "2.0", id: message.id, result });
      return;
    }
    const results: Record<string, unknown> = {
      initialize: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "tool-conformance-server", version: "1.0.0" } },
      "tools/list": { tools: [
        {
          name: "audit-script",
          inputSchema: { type: "object", properties: { path: { type: "string", nullable: true, description: "Script path" } }, required: ["path"] },
          outputSchema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            anyOf: [{ $ref: "#/$defs/AuditResult" }, { $ref: "#/$defs/Error" }],
            $defs: {
              AuditResult: { type: "object", properties: { findings: { type: "integer" }, path: { type: "string" } }, required: ["findings", "path"] },
              Error: { type: "object", properties: { error: { type: "object" } }, required: ["error"] },
            },
          },
        },
        { name: "app-tool", inputSchema: { type: "object", properties: {} }, _meta: { ui: { resourceUri: "ui://audit/app" } } },
        { name: "invalid-app", inputSchema: { type: "object", properties: {} }, _meta: { ui: { resourceUri: " " } } },
        { name: "plain-tool", inputSchema: { type: "object", properties: { label: { type: "string" } } } },
      ] },
      "prompts/list": { prompts: [] },
      "resources/list": { resources: [] },
      "resources/templates/list": { resourceTemplates: [] },
    };
    const result = results[message.method];
    json(response, result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: message.id, result });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=tools`);
    await expect(page.getByTestId("tool-item-audit-script")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("tool-item-app-tool").click();
    const conformance = page.getByRole("region", { name: "Tool conformance" });
    await expect(conformance).toBeVisible();
    await conformance.getByRole("button", { name: "Inspect app metadata", exact: true }).click();
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText("ui://audit/app");
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText('"pass"');

    await page.getByTestId("tool-item-audit-script").click();
    await conformance.getByRole("button", { name: "Lint tool schemas", exact: true }).click();
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText("nullable is an OpenAPI keyword");
    await page.getByTestId("tool-param-path").fill("first.ps1");
    await page.getByTestId("tool-execution-execute-button").click();
    await expect.poll(() => calls.length).toBe(1);
    await expect(page.getByTestId("tool-output-validation")).toContainText("Valid");

    await page.getByTestId("tool-param-path").fill("second.ps1");
    await page.getByTestId("tool-execution-execute-button").click();
    await expect.poll(() => calls.length).toBe(2);
    await expect(page.getByRole("combobox", { name: "Tool run history" })).toBeVisible();
    await conformance.getByRole("button", { name: "Diff last two runs", exact: true }).click();
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText("structuredContent.findings");
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText("first.ps1");
    await conformance.getByRole("button", { name: "Edit run 1", exact: true }).click();
    await expect(page.getByTestId("tool-param-path")).toHaveValue("first.ps1");
    await conformance.getByRole("button", { name: "Replay run 1", exact: true }).click();
    await expect.poll(() => calls.length).toBe(3);
    expect(calls[2]).toEqual({ name: "audit-script", args: { path: "first.ps1" } });

    await page.getByTestId("tool-item-plain-tool").click();
    await page.getByTestId("tool-param-label").fill("sample");
    await page.getByTestId("tool-execution-execute-button").click();
    await expect.poll(() => calls.length).toBe(4);
    await expect(page.getByTestId("tool-output-validation")).toContainText("Unavailable");
    await expect(page.getByText("plain output", { exact: true })).toBeVisible();
    await conformance.getByRole("button", { name: "Inspect app metadata", exact: true }).click();
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText('"not-advertised"');
    await page.getByTestId("tool-item-invalid-app").click();
    await conformance.getByRole("button", { name: "Inspect app metadata", exact: true }).click();
    await expect(conformance.getByTestId("tool-conformance-result")).toContainText('"fail"');
    expect(methods.filter((method) => method === "tools/call")).toHaveLength(4);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("native prompt and resource workflows complete arguments and subscribe to the selected resource", async ({ page }) => {
  test.setTimeout(60_000);
  const requests: { method: string; params?: Record<string, unknown> }[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as {
      id?: number | string;
      method: string;
      params?: Record<string, unknown>;
    };
    requests.push({ method: message.method, params: message.params });
    if (message.id === undefined) { response.writeHead(202).end(); return; }

    const results: Record<string, unknown> = {
      initialize: {
        protocolVersion: "2025-03-26",
        capabilities: { prompts: {}, resources: { subscribe: true }, completions: {} },
        serverInfo: { name: "content-workflow-server", version: "1.0.0" },
      },
      "prompts/list": {
        prompts: [{
          name: "greet",
          arguments: [{ name: "name", required: true }],
        }],
      },
      "resources/list": {
        resources: [{ name: "selected-resource", uri: "resource://selected", mimeType: "text/plain" }],
      },
      "resources/templates/list": {
        resourceTemplates: [{
          name: "user-template",
          uriTemplate: "resource://users/{userId}",
          description: "A user resource",
        }],
      },
      "completion/complete": {
        completion: {
          values: (message.params?.argument as { name?: string } | undefined)?.name === "userId"
            ? ["user-42", "user-99"]
            : ["Ada", "Alan"],
          total: 2,
          hasMore: false,
        },
      },
      "prompts/get": { messages: [{ role: "user", content: { type: "text", text: "Hello" } }] },
      "resources/read": { contents: [{ uri: "resource://selected", mimeType: "text/plain", text: "selected resource" }] },
      "resources/subscribe": {},
      "resources/unsubscribe": {},
    };
    const result = results[message.method];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=prompts`);
    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await expect(page.getByTestId("prompt-item-greet")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("prompt-item-greet").click();
    await page.getByTestId("prompt-param-name").fill("Al");
    await page.getByRole("button", { name: "Complete name", exact: true }).click();
    await page.getByRole("button", { name: "Use Alan", exact: true }).click();
    await expect(page.getByTestId("prompt-param-name")).toHaveValue("Alan");

    await tabs.getByRole("button", { name: "Resources", exact: true }).click();
    await expect(page.getByTestId("resource-template-item-user-template")).toBeVisible();
    await page.getByTestId("resource-template-item-user-template").click();
    await page.getByTestId("resource-template-param-userId").fill("user-");
    await page.getByRole("button", { name: "Complete userId", exact: true }).click();
    await page.getByRole("button", { name: "Use user-42", exact: true }).click();
    await expect(page.getByTestId("resource-template-param-userId")).toHaveValue("user-42");

    await page.getByTestId("resource-item-selected-resource").click();
    await page.getByRole("button", { name: "Subscribe to resource", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unsubscribe from resource", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Unsubscribe from resource", exact: true }).click();

    expect(requests.filter(({ method }) => method === "completion/complete").map(({ params }) => params)).toEqual([
      { ref: { type: "ref/prompt", name: "greet" }, argument: { name: "name", value: "Al" } },
      { ref: { type: "ref/resource", uri: "resource://users/{userId}" }, argument: { name: "userId", value: "user-" } },
    ]);
    await expect.poll(() => requests.filter(({ method }) =>
      method === "resources/subscribe" || method === "resources/unsubscribe",
    )).toEqual([
      { method: "resources/subscribe", params: { uri: "resource://selected" } },
      { method: "resources/unsubscribe", params: { uri: "resource://selected" } },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("native Skills verifies resources and Notifications filters logs without hiding other events", async ({ page }) => {
  test.setTimeout(60_000);
  const methods: string[] = [];
  const requests: { method: string; params?: Record<string, unknown> }[] = [];
  const skillText = "---\nname: audit\ndescription: Audits scripts.\n---\n# Audit\n";
  const skill = {
    uri: "skill://audit/SKILL.md",
    frontmatter: { name: "audit", description: "Audits scripts." },
    resources: [{
      uri: "skill://audit/SKILL.md",
      digest: `sha256:${createHash("sha256").update(skillText).digest("hex")}`,
    }],
  };
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as {
      id?: number | string;
      method: string;
      params?: Record<string, unknown>;
    };
    methods.push(message.method);
    requests.push({ method: message.method, params: message.params });
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    if (message.method === "tools/call") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/message",
        params: { level: "warning", logger: "audit", data: "fixture log line" },
      })}\n\n`);
      response.write(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: "fixture", progress: 1, total: 1 },
      })}\n\n`);
      response.end(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "text", text: "audited" }] },
      })}\n\n`);
      return;
    }

    const results: Record<string, unknown> = {
      initialize: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
          logging: {},
          extensions: { "io.modelcontextprotocol/skills": {} },
        },
        serverInfo: { name: "native-events-server", version: "1.0.0" },
      },
      "tools/list": {
        tools: [{ name: "audit", inputSchema: { type: "object", properties: {} } }],
      },
      "prompts/list": { prompts: [] },
      "resources/list": { resources: [] },
      "resources/templates/list": { resourceTemplates: [] },
      "skills/list": { skills: [skill] },
      "skills/get": { skill },
      "resources/read": {
        contents: [{ uri: skill.uri, mimeType: "text/markdown", text: skillText }],
      },
      "logging/setLevel": {},
    };
    const result = results[message.method];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=tools`);
    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await expect(page.getByTestId("tool-item-audit")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("tool-item-audit").click();
    await page.getByTestId("tool-execution-execute-button").click();

    await tabs.getByRole("button", { name: "Notifications", exact: true }).click();
    const notificationItems = page.locator('[id^="notification-"]');
    const logNotification = notificationItems.filter({ hasText: "notifications/message" });
    const progressNotification = notificationItems.filter({ hasText: "notifications/progress" });
    await expect(logNotification).toBeVisible();
    await expect(progressNotification).toBeVisible();
    await chooseOption(page, page, "Minimum log level", "error");
    await expect(logNotification).toHaveCount(0);
    await expect(progressNotification).toBeVisible();
    await page.getByLabel("Search logs").fill("no matching log");
    await expect(logNotification).toHaveCount(0);
    await expect(progressNotification).toBeVisible();

    await page.getByLabel("Search logs").fill("");
    await chooseOption(page, page, "Minimum log level", "debug");
    await chooseOption(page, page, "Active log level", "warning");
    await page.getByRole("button", { name: "Set log level", exact: true }).click();
    await expect.poll(() => requests.filter(({ method }) => method === "logging/setLevel"))
      .toEqual([{ method: "logging/setLevel", params: { level: "warning" } }]);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export logs", exact: true }).click();
    const download = await downloadPromise;
    const exportedLogs = await readFile(await download.path(), "utf8");
    expect(exportedLogs).toContain("fixture log line");
    expect(exportedLogs).not.toContain("notifications/progress");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(page.getByText("No notifications yet")).toBeVisible();

    await tabs.getByRole("button", { name: "Skills", exact: true }).click();
    await page.getByRole("button", { name: "audit", exact: true }).click();
    await page.getByRole("button", { name: "Validate all", exact: true }).click();
    await expect(page.getByText("1 files verified", { exact: true })).toBeVisible();
    expect(methods).toEqual(expect.arrayContaining(["skills/list", "skills/get", "resources/read"]));

    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();
    const inspectorFeatures = page.getByRole("navigation", { name: "Inspector features" });
    await expect(inspectorFeatures.getByRole("button", { name: "Logs", exact: true })).toHaveCount(0);
    await expect(inspectorFeatures.getByRole("button", { name: "Skills", exact: true })).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("an advertised empty Skills catalog stays visibly unavailable", async ({ page }) => {
  const methods: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number | string; method: string };
    methods.push(message.method);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    const results: Record<string, unknown> = {
      initialize: {
        protocolVersion: "2025-03-26",
        capabilities: { extensions: { "io.modelcontextprotocol/skills": {} } },
        serverInfo: { name: "empty-skills-server", version: "1.0.0" },
      },
      "tools/list": { tools: [] },
      "prompts/list": { prompts: [] },
      "resources/list": { resources: [] },
      "resources/templates/list": { resourceTemplates: [] },
      "skills/list": { skills: [] },
    };
    const result = results[message.method];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result === undefined
      ? { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await page.route("https://**", (route) => route.abort());
    await page.goto(`/mcp/inspector?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=tools`);
    const skillsTab = page.getByTestId("tab-skills").last();
    await expect(skillsTab).toBeVisible({ timeout: 20_000 });
    await expect(skillsTab).toHaveAttribute("aria-disabled", "true");
    await expect(skillsTab).toHaveAttribute("title", /empty catalog/);
    await expect.poll(() => methods).toContain("skills/list");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
