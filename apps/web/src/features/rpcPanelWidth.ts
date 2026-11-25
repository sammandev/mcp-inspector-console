export const RPC_PANEL_MIN_WIDTH = 250;
export const RPC_PANEL_DEFAULT_WIDTH = 320;
export const RPC_PANEL_WIDTH_STORAGE_KEY = "inspector-rpc-panel-width";
const RPC_PANEL_MAX_VIEWPORT_SHARE = 0.6;

export function clampRpcPanelWidth(width: number, viewportWidth: number) {
  const max = Math.max(RPC_PANEL_MIN_WIDTH, Math.floor(viewportWidth * RPC_PANEL_MAX_VIEWPORT_SHARE));
  return Math.round(Math.min(max, Math.max(RPC_PANEL_MIN_WIDTH, width)));
}

export function readRpcPanelWidth(stored: string | null, viewportWidth: number) {
  const parsed = stored === null ? Number.NaN : Number(stored);
  return clampRpcPanelWidth(Number.isFinite(parsed) ? parsed : RPC_PANEL_DEFAULT_WIDTH, viewportWidth);
}
