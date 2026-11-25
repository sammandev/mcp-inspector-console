import { describe, expect, it } from "vitest";
import { clampRpcPanelWidth, readRpcPanelWidth, RPC_PANEL_DEFAULT_WIDTH, RPC_PANEL_MIN_WIDTH } from "./rpcPanelWidth.js";

describe("clampRpcPanelWidth", () => {
  it("keeps the panel between the minimum and 60% of the viewport", () => {
    expect(clampRpcPanelWidth(100, 1600)).toBe(RPC_PANEL_MIN_WIDTH);
    expect(clampRpcPanelWidth(500.4, 1600)).toBe(500);
    expect(clampRpcPanelWidth(2000, 1600)).toBe(960);
  });

  it("never drops below the minimum on narrow viewports", () => {
    expect(clampRpcPanelWidth(600, 300)).toBe(RPC_PANEL_MIN_WIDTH);
  });
});

describe("readRpcPanelWidth", () => {
  it("falls back to the default for missing or invalid stored values", () => {
    expect(readRpcPanelWidth(null, 1600)).toBe(RPC_PANEL_DEFAULT_WIDTH);
    expect(readRpcPanelWidth("wide", 1600)).toBe(RPC_PANEL_DEFAULT_WIDTH);
    expect(readRpcPanelWidth("420", 1600)).toBe(420);
    expect(readRpcPanelWidth("5000", 1600)).toBe(960);
  });
});
