import { expect, test, type Page } from "@playwright/test";

const destinations = [
  "Connections", "Chat", "Tools", "Prompts", "Resources", "Skills", "Apps",
  "Protocol", "Network", "Auth", "Tasks", "Roots", "Load", "Settings",
];

function guardNetwork(page: Page) {
  const external: string[] = [];
  void page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol !== "data:" && url.protocol !== "blob:" && url.origin !== "http://127.0.0.1:4273") {
      external.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return external;
}

test("desktop destinations select real placeholder content without external network", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const external = guardNetwork(page);
  await page.goto("/");

  await expect(page.getByTestId("connection-selector")).toHaveCount(1);
  const nav = page.getByTestId("desktop-navigation");
  await expect(nav).toBeVisible();
  for (const destination of destinations) {
    await expect(nav.getByRole("button", { name: new RegExp(`^${destination}`) })).toBeVisible();
  }
  for (const destination of destinations) {
    await nav.getByRole("button", { name: new RegExp(`^${destination}`) }).click();
    await expect(page.getByRole("heading", { name: destination, exact: true })).toBeVisible();
  }
  await expect(page.locator(".sidebar-footer")).toContainText("Offline scaffold");
  await expect(page.locator(".phase-badge")).toHaveText("Phase 0");
  expect(external).toEqual([]);
});

test("mobile navigation enumerates destinations and is an accessible modal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const external = guardNetwork(page);
  await page.goto("/");

  await test.step("open modal at mobile breakpoint", async () => {
    await expect(page.getByTestId("desktop-navigation")).toBeHidden();
    await expect(page.getByTestId("mobile-status")).toBeVisible();
  });
  const opener = page.getByRole("button", { name: "Open navigation" });
  await test.step("focus modal close control", async () => {
    await opener.click();
    await expect(page.getByRole("dialog", { name: "Navigate" })).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
  });
  const dialog = page.getByRole("dialog", { name: "Navigate" });
  const close = dialog.getByRole("button", { name: "Close navigation" });
  const mobileNav = page.getByTestId("mobile-navigation-list");
  await test.step("enumerate mobile destinations", async () => {
    await expect(mobileNav.getByRole("button")).toHaveCount(destinations.length);
    expect(await mobileNav.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent?.replace(/^\d+/, "").replace(/Published mcp-use surface$/, "").trim()))).toEqual(destinations);
  });

  await test.step("trap focus and make background inert", async () => {
    await expect(page.locator("body > [data-base-ui-inert]")).toHaveCount(1);
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
  });
  await test.step("close with Escape and restore opener focus", async () => {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator("body > [data-base-ui-inert]")).toHaveCount(0);
  });
  await test.step("select a mobile destination", async () => {
    await opener.click();
    await page.getByTestId("mobile-navigation-list").getByRole("button", { name: /^Apps/ }).click();
    await expect(page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
  });
  expect(external).toEqual([]);
});

test("gateway proxy enforces browser origin while allowing local tooling", async ({ request, page }) => {
  const sameOrigin = await page.goto("/");
  expect(sameOrigin?.ok()).toBe(true);
  const allowed = await page.evaluate(async () => {
    const response = await fetch("/gateway/api/version");
    return { status: response.status, body: await response.json() };
  });
  expect(allowed.status).toBe(200);
  expect(allowed.body).toEqual({ version: "0.0.0" });

  const localTool = await request.get("/gateway/api/version", { headers: { Origin: undefined as never } });
  expect(localTool.status()).toBe(200);

  const crossOrigin = await request.get("/gateway/api/version", {
    headers: { Origin: "http://127.0.0.1:9999", "Sec-Fetch-Site": "cross-site" },
  });
  expect(crossOrigin.status()).toBe(403);
});

test("theme toggles through provider state and persists across reload with mcp-use tokens", async ({ page }) => {
  const external = guardNetwork(page);
  await page.goto("/");
  const root = page.locator("html");
  const primary = page.getByTestId("primary-control");

  const tokens = await primary.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      surface: style.getPropertyValue("--surface-3").trim(),
      surface8: style.getPropertyValue("--surface-8").trim(),
      shadow: style.getPropertyValue("--shadow-2").trim(),
      focus: style.getPropertyValue("--focus-ring").trim(),
    };
  });
  expect(tokens.surface).not.toBe("");
  expect(tokens.surface8).not.toBe("");
  expect(tokens.shadow).not.toBe("");
  expect(tokens.focus).not.toBe("");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(root).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("combined-inspector-theme"))).toBe("dark");
  await page.reload();
  await expect(root).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  const darkTokens = await primary.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      surface: style.getPropertyValue("--surface-3").trim(),
      shadow: style.getPropertyValue("--shadow-2").trim(),
    };
  });
  expect(darkTokens.surface).not.toBe(tokens.surface);
  expect(darkTokens.shadow).not.toBe(tokens.shadow);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(root).toHaveClass(/light/);
  expect(await page.evaluate(() => localStorage.getItem("combined-inspector-theme"))).toBe("light");
  expect(external).toEqual([]);
});
