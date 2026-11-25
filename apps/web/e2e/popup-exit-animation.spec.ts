import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Presses Escape on the open popup with `role` and returns the motion wrapper's opacity at the moment
// the popup is removed or hidden: 0 once the exit animation has played, ~0.5-1 if it was cut short.
// Motion animates opacity via WAAPI, so only the computed style shows mid-animation values; the inline
// style (motion's committed final value) is the fallback once the wrapper is detached.
async function closeAndReadExitOpacity(page: Page, role: "listbox" | "menu") {
  await page.evaluate((popupRole) => {
    const popup = [...document.querySelectorAll<HTMLElement>(`[role="${popupRole}"]`)]
      .find((node) => node.checkVisibility());
    let wrapper = popup?.parentElement ?? null;
    while (wrapper && wrapper.style.opacity === "") wrapper = wrapper.parentElement;
    if (!popup || !wrapper) throw new Error(`No visible ${popupRole} inside an animated wrapper`);
    const state = window as typeof window & { __exitOpacity?: Promise<number> };
    state.__exitOpacity = new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        if (popup.isConnected && popup.checkVisibility()) return;
        observer.disconnect();
        resolve(Number(wrapper.isConnected ? getComputedStyle(wrapper).opacity : wrapper.style.opacity));
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    });
  }, role);
  await page.keyboard.press("Escape");
  return page.evaluate(() => (window as typeof window & { __exitOpacity?: Promise<number> }).__exitOpacity);
}

test("select and dropdown popups finish their exit animation before unmounting", async ({ page }) => {
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
        serverInfo: { name: "exit-fixture", version: "1.0.0" },
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

  try {
    await page.route("https://**", (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?server=${encodeURIComponent(`http://127.0.0.1:${port}/mcp`)}&tab=protocol`);
    const tabs = page.getByRole("list", { name: "Inspector tabs" });
    await expect(tabs.getByRole("button", { name: "Protocol", exact: true })).toBeVisible({ timeout: 20_000 });
    await tabs.getByRole("button", { name: "Protocol", exact: true }).click();

    const direction = page.getByTestId("inspector-features").getByRole("combobox", { name: "Direction", exact: true });
    await direction.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect.poll(() => page.getByRole("listbox").evaluate((popup) => {
      let node: HTMLElement | null = popup as HTMLElement;
      while (node && node.style.opacity === "") node = node.parentElement;
      return Number(node?.style.opacity ?? 0);
    })).toBe(1);
    expect(await closeAndReadExitOpacity(page, "listbox")).toBeLessThan(0.3);

    await page.getByRole("banner").getByRole("button", { name: "Add to Client" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect.poll(() => page.getByRole("menu").evaluate((popup) => {
      let node: HTMLElement | null = popup as HTMLElement;
      while (node && node.style.opacity === "") node = node.parentElement;
      return Number(node?.style.opacity ?? 0);
    })).toBe(1);
    expect(await closeAndReadExitOpacity(page, "menu")).toBeLessThan(0.3);
  } finally {
    server.close();
  }
});
