import { expect, test } from "@playwright/test";

const destinations = [
  "Connections",
  "Chat",
  "Tools",
  "Prompts",
  "Resources",
  "Skills",
  "Apps",
  "Protocol",
  "Network",
  "Auth",
  "Tasks",
  "Roots",
  "Load",
  "Settings",
];

test("desktop shell renders the complete Phase 0 scaffold", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.getByTestId("connection-selector")).toHaveCount(1);
  await expect(page.getByTestId("desktop-navigation")).toBeVisible();
  for (const destination of destinations) {
    await expect(page.getByTestId("desktop-navigation").getByText(destination, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".sidebar-footer").getByText("Offline scaffold", { exact: true })).toBeVisible();
  await expect(page.locator(".phase-badge")).toHaveText("Phase 0");
});

test("mobile navigation is reachable and theme toggle preserves mcp-use tokens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByTestId("desktop-navigation")).toBeHidden();
  await expect(page.getByTestId("mobile-navigation")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog", { name: "Inspector navigation" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close navigation" }).click();
  await expect(dialog).toBeHidden();

  const primary = page.getByTestId("primary-control");
  const lightShadow = await primary.evaluate((element) => getComputedStyle(element).boxShadow);
  await page.getByRole("button", { name: "Toggle dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(primary).toHaveCSS("background-color", /rgb|oklch/);
  expect(await primary.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  expect(lightShadow).not.toBe("");
});
