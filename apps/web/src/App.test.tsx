import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App, destinations } from "./App.js";

describe("combined inspector shell", () => {
  it("renders one connection selector and every Phase 0 destination", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup.match(/data-testid="connection-selector"/g)).toHaveLength(1);
    for (const destination of destinations) {
      expect(markup).toContain(destination.label);
    }
  });

  it("communicates the offline scaffold and Phase 0 state", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Offline scaffold");
    expect(markup).toContain("Phase 0");
    expect(markup).toContain("No MCP connection is opened");
  });

  it("exposes accessible desktop and mobile navigation controls", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Desktop navigation"');
    expect(markup).toContain('aria-label="Mobile navigation controls"');
    expect(markup).toContain('aria-label="Open navigation"');
    expect(markup).toContain('aria-label="Toggle dark theme"');
  });
});
