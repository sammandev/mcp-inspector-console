import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const mobile of [false, true]) {
    test(`anonymous OpenAI Compatible Chat works in ${theme} mode ${mobile ? "on mobile" : "on desktop"}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
      const server = new URL("/mock-mcp", baseURL).href;
      await page.route("**/mock-mcp", async route => {
        if (route.request().method() !== "POST") return route.fulfill({ status: 405 });
        const message = route.request().postDataJSON() as { id?: number; method: string };
        if (message.id === undefined) return route.fulfill({ status: 202 });
        const results: Record<string, unknown> = {
          initialize: { protocolVersion: "2025-03-26", capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: "chat-fixture", version: "1.0.0" } },
          "tools/list": { tools: [] }, "prompts/list": { prompts: [] },
          "resources/list": { resources: [] }, "resources/templates/list": { resourceTemplates: [] },
        };
        await route.fulfill({ json: { jsonrpc: "2.0", id: message.id, result: results[message.method] ?? {} } });
      });
      const models: string[] = [];
      await page.route("**/mock-provider/**", async route => {
        if (route.request().url().endsWith("/models")) return route.fulfill({ json: { data: [{ id: "fixture-model" }] } });
        models.push((route.request().postDataJSON() as { model: string }).model);
        const chunk = { id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model",
          choices: [{ index: 0, delta: { role: "assistant", content: "Compatible response fixture" }, finish_reason: null }] };
        const done = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
        await route.fulfill({ contentType: "text/event-stream",
          headers: { "Access-Control-Allow-Origin": new URL(baseURL!).origin, "Access-Control-Allow-Headers": "*" },
          body: `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n` });
      });
      await page.goto(`/mcp/inspector?server=${encodeURIComponent(server)}&tab=chat&theme=${theme}`);
      await page.getByTestId("chat-configure-api-key-button").click();
      const dialog = page.getByRole("dialog", { name: "LLM Provider Configuration" });
      await dialog.getByRole("combobox").click();
      await expect(page.getByRole("option")).toHaveText(["OpenAI Compatible"]);
      await page.getByRole("option", { name: "OpenAI Compatible", exact: true }).click();
      await dialog.getByTestId("chat-config-base-url-input").fill(new URL("/mock-provider/v1", baseURL).href);
      await dialog.getByTestId("chat-config-api-key-input").fill("fixture-provider-key");
      await dialog.getByTestId("chat-config-model-select").click();
      await page.getByRole("option", { name: "fixture-model", exact: true }).click();
      await expect(dialog.getByRole("img", { name: "OpenAI", exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Save Configuration", exact: true }).click();
      await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
      await page.getByRole("textbox", { name: "Ask a question or request an action..." }).fill("Reply with the fixture response.");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByText("Compatible response fixture", { exact: true }).first()).toBeVisible();
      expect(models[0]).toBe("fixture-model");
      await page.reload();
      await page.getByRole("button", { name: "fixture-model", exact: true }).click();
      await expect(dialog.getByRole("combobox").first()).toContainText("OpenAI Compatible");
      await expect(dialog.getByTestId("chat-config-base-url-input")).toHaveValue(new URL("/mock-provider/v1", baseURL).href);
    });
  }
}
