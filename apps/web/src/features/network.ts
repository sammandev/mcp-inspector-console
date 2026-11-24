import { redact } from "./model.js";

export interface NetworkEntry {
  id: number;
  timestamp: string;
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  requestHeaders: unknown;
  responseHeaders?: unknown;
  error?: string;
}
let entries: NetworkEntry[] = [];
let nextId = 0;
let defaultLimit = 256;
const serverLimits = new Map<string, number>();
const listeners = new Set<() => void>();
function groupKeyForUrl(url: string) {
  return [...serverLimits.keys()]
    .filter((serverUrl) => url.includes(serverUrl))
    .sort((left, right) => right.length - left.length)[0] ?? url;
}
function retainLatest(
  current: NetworkEntry[],
  maxEntries: number,
  belongsToGroup: (entry: NetworkEntry) => boolean,
) {
  const group = current.filter(belongsToGroup);
  const expiredIds = new Set(group.slice(0, Math.max(0, group.length - maxEntries)).map(({ id }) => id));
  return current.filter(({ id }) => !expiredIds.has(id));
}
export const networkStore = {
  snapshot: () => entries,
  limit: (serverUrl?: string) => serverUrl ? serverLimits.get(serverUrl) ?? defaultLimit : defaultLimit,
  setLimit: (value: number, serverUrl?: string) => {
    if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new Error("The network log size must be between 1 and 10000");
    if (serverUrl) {
      serverLimits.set(serverUrl, value);
      entries = retainLatest(
        entries,
        value,
        (entry) => groupKeyForUrl(entry.url) === serverUrl,
      );
    } else {
      defaultLimit = value;
      const defaultGroups = new Set(entries
        .map((entry) => groupKeyForUrl(entry.url))
        .filter((group) => !serverLimits.has(group)));
      for (const group of defaultGroups) {
        entries = retainLatest(entries, value, (entry) => groupKeyForUrl(entry.url) === group);
      }
    }
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  clear: (serverUrl?: string) => {
    entries = serverUrl
      ? entries.filter((entry) => groupKeyForUrl(entry.url) !== serverUrl)
      : [];
    listeners.forEach((listener) => listener());
  },
};
function publish(entry: NetworkEntry) {
  const serverUrl = groupKeyForUrl(entry.url);
  const maxEntries = serverUrl ? serverLimits.get(serverUrl) ?? defaultLimit : defaultLimit;
  const next = [...entries, entry];
  entries = retainLatest(
    next,
    maxEntries,
    (candidate) => groupKeyForUrl(candidate.url) === serverUrl,
  );
  listeners.forEach((listener) => listener());
}
export const recordingFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const url = headers.get("X-Target-URL") ?? (input instanceof Request ? input.url : String(input));
  const start = performance.now();
  const entry: NetworkEntry = {
    id: ++nextId, timestamp: new Date().toISOString(), url,
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    durationMs: 0, requestHeaders: redact(Object.fromEntries(headers)),
  };
  try {
    const response = await globalThis.fetch(input, init);
    publish({ ...entry, status: response.status, durationMs: performance.now() - start,
      responseHeaders: redact(Object.fromEntries(response.headers)) });
    return response;
  } catch (error) {
    publish({ ...entry, durationMs: performance.now() - start,
      error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
