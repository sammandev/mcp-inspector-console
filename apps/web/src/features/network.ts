import { redact } from "./model.js";

export const MAX_CAPTURED_BODY_CHARS = 64 * 1024;

export interface NetworkStreamState {
  events: number;
  closedAt?: string;
}

export interface NetworkEntry {
  id: number;
  timestamp: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  durationMs: number;
  requestHeaders: unknown;
  requestBody?: string;
  responseHeaders?: unknown;
  responseBody?: string;
  responseBodyTruncated?: boolean;
  stream?: NetworkStreamState;
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
      ? entries.filter((entry) => !belongsToServer(entry, serverUrl))
      : [];
    listeners.forEach((listener) => listener());
  },
};

export function belongsToServer(entry: NetworkEntry, serverUrl: string) {
  return entry.url.includes(serverUrl);
}

export function networkEntriesFor(all: readonly NetworkEntry[], serverUrls: readonly string[]) {
  return serverUrls.length ? all.filter((entry) => serverUrls.some((url) => belongsToServer(entry, url))) : [...all];
}
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
function update(id: number, patch: Partial<NetworkEntry>) {
  if (!entries.some((entry) => entry.id === id)) return;
  entries = entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry);
  listeners.forEach((listener) => listener());
}

function redactJsonText(text: string, pretty: boolean): string | undefined {
  try {
    return JSON.stringify(redact(JSON.parse(text)), null, pretty ? 2 : undefined);
  } catch {
    return undefined;
  }
}

export function redactBody(text: string, contentType = ""): string {
  if (!text) return text;
  const json = redactJsonText(text, true);
  if (json !== undefined) return json;
  if (contentType.includes("text/event-stream") || /^(data|event|id):/m.test(text)) {
    return text.split("\n").map((line) => {
      if (!line.startsWith("data:")) return line;
      const data = line.slice(5).trim();
      return `data: ${redactJsonText(data, false) ?? String(redact(data))}`;
    }).join("\n");
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    return new URLSearchParams(Object.entries(redact(Object.fromEntries(params)) as Record<string, string>)).toString();
  }
  return String(redact(text));
}

function capText(text: string) {
  return text.length > MAX_CAPTURED_BODY_CHARS
    ? { text: text.slice(0, MAX_CAPTURED_BODY_CHARS), truncated: true }
    : { text, truncated: false };
}

async function readRequestBody(input: RequestInfo | URL, init: RequestInit | undefined, contentType: string) {
  const body = init?.body ?? (input instanceof Request && init?.body === undefined ? await input.clone().text().catch(() => "") : undefined);
  if (body === undefined || body === null || body === "") return undefined;
  let text: string;
  if (typeof body === "string") text = body;
  else if (body instanceof URLSearchParams) text = body.toString();
  else if (body instanceof Blob) text = `[binary body: ${body.size} bytes]`;
  else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) text = `[binary body: ${body.byteLength} bytes]`;
  else if (body instanceof FormData) text = "[form data body]";
  else text = "[streamed body]";
  const capped = capText(text);
  return redactBody(capped.text, contentType) + (capped.truncated ? "\n… [truncated]" : "");
}

/**
 * Wraps the response body so the log sees each chunk as the caller reads it.
 * Nothing is read ahead of the caller, and cancelling the returned body
 * cancels the network stream, so long-lived SSE streams stay unbuffered.
 */
function observeResponse(id: number, response: Response, method: string, start: number): Response {
  const contentType = response.headers.get("content-type") ?? "";
  const isStream = contentType.includes("text/event-stream");
  if (!response.body) {
    update(id, { responseBody: "" });
    return response;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;
  let events = 0;
  let pending = "";
  let finished = false;
  const snapshotBody = () => redactBody(text, contentType);
  const finish = (error?: unknown) => {
    if (finished) return;
    finished = true;
    if (!truncated) text += decoder.decode();
    const capped = capText(text);
    text = capped.text;
    truncated ||= capped.truncated;
    update(id, {
      responseBody: snapshotBody(),
      responseBodyTruncated: truncated || undefined,
      ...(isStream ? { stream: { events, closedAt: new Date().toISOString() } } : {}),
      ...(isStream && method === "GET" ? {} : { durationMs: performance.now() - start }),
      ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
    });
  };
  const observed = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish();
          controller.close();
          return;
        }
        if (!truncated) {
          const chunk = decoder.decode(value, { stream: true });
          text += chunk;
          if (isStream) {
            pending += chunk;
            const parts = pending.split(/\r?\n\r?\n/);
            pending = parts.pop() ?? "";
            events += parts.filter((part) => part.trim()).length;
          }
          if (text.length > MAX_CAPTURED_BODY_CHARS) {
            text = text.slice(0, MAX_CAPTURED_BODY_CHARS);
            truncated = true;
          }
        } else if (isStream) {
          events += decoder.decode(value, { stream: true }).split(/\r?\n\r?\n/).length - 1;
        }
        if (isStream) update(id, { responseBody: snapshotBody(), stream: { events } });
        controller.enqueue(value);
      } catch (error) {
        finish(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      finish();
      await reader.cancel(reason);
    },
  });
  const wrapped = new Response(observed, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  for (const key of ["url", "redirected", "type"] as const) {
    Object.defineProperty(wrapped, key, { value: response[key] });
  }
  return wrapped;
}

export const recordingFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const url = headers.get("X-Target-URL") ?? (input instanceof Request ? input.url : String(input));
  const start = performance.now();
  const entry: NetworkEntry = {
    id: ++nextId, timestamp: new Date().toISOString(), url,
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    durationMs: 0, requestHeaders: redact(Object.fromEntries(headers)),
    requestBody: await readRequestBody(input, init, headers.get("content-type") ?? ""),
  };
  try {
    const response = await globalThis.fetch(input, init);
    publish({ ...entry, status: response.status, statusText: response.statusText || undefined,
      durationMs: performance.now() - start,
      responseHeaders: redact(Object.fromEntries(response.headers)) });
    return observeResponse(entry.id, response, entry.method, start);
  } catch (error) {
    publish({ ...entry, durationMs: performance.now() - start,
      error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
};
