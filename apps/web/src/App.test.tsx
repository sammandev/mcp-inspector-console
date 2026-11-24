// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:3000"}
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App, destinations } from "./App.js";

const stored = new Map<string, string>();
const storage: Storage = {
  get length() { return stored.size; },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => void stored.delete(key),
  setItem: (key, value) => void stored.set(key, String(value)),
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

describe("combined inspector shell", () => {
  beforeEach(() => {
    storage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => cleanup());

  it("renders one connection selector and navigates destinations", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByRole("combobox", { name: "Connection selector" })).toHaveLength(1);
    const desktop = screen.getByRole("navigation", { name: "Desktop navigation" });
    for (const destination of destinations) {
      expect(within(desktop).getByRole("button", { name: new RegExp(destination.label) })).toBeTruthy();
    }

    await user.click(within(desktop).getByRole("button", { name: /^Tools/ }));
    expect(screen.getByRole("heading", { name: "Tools" })).toBeTruthy();
    expect(screen.getByText("Discover and invoke server-provided tools.")).toBeTruthy();
  });

  it("communicates the offline scaffold and Phase 0 state", () => {
    render(<App />);

    expect(screen.getAllByText("Offline scaffold").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Phase 0").length).toBeGreaterThan(0);
    expect(screen.getByText("No MCP connection is opened.", { exact: false })).toBeTruthy();
  });

  it("uses the ThemeProvider class and storage contract in both directions", async () => {
    localStorage.setItem("combined-inspector-theme", "dark");
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    await user.click(toggle);
    await waitFor(() => expect(localStorage.getItem("combined-inspector-theme")).toBe("light"));
    expect(document.documentElement.classList.contains("light")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    await waitFor(() => expect(localStorage.getItem("combined-inspector-theme")).toBe("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("opens a modal drawer, traps focus, closes on Escape, and restores focus", async () => {
    render(<App />);
    const opener = screen.getByRole("button", { name: "Open navigation" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "Navigate" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = within(dialog).getByRole("button", { name: "Close navigation" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).not.toBe(opener);
    fireEvent.keyDown(document.activeElement ?? close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
