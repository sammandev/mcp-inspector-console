import type { RpcTrafficEntry } from "../../vendor/mcp-use/client/rpc-traffic-store.js";

export interface ProtocolExchange {
  id: string;
  kind: "request" | "notification" | "response";
  method: string;
  direction: RpcTrafficEntry["direction"];
  source: RpcTrafficEntry["source"];
  serverId: string;
  timestamp: string;
  status: "pending" | "ok" | "error";
  durationMs?: number;
  params?: unknown;
  response?: unknown;
  request: unknown;
  responseMessage?: unknown;
  repeatCount?: number;
}

type Message = { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: unknown };

const correlationKey = (entry: RpcTrafficEntry, direction: RpcTrafficEntry["direction"], id: string | number) =>
  JSON.stringify([entry.source, entry.serverId, entry.widgetId ?? null, direction, typeof id, id]);

/** Folds raw JSON-RPC traffic into request/response exchanges for the Protocol view. */
export function buildProtocolExchanges(entries: readonly RpcTrafficEntry[]): ProtocolExchange[] {
  const exchanges: ProtocolExchange[] = [];
  const pending = new Map<string, number>();
  for (const entry of entries) {
    const message = (entry.message ?? {}) as Message;
    const rpcId = typeof message.id === "string" || typeof message.id === "number" ? message.id : undefined;
    const base = {
      id: entry.id,
      direction: entry.direction,
      source: entry.source,
      serverId: entry.serverId,
      timestamp: entry.timestamp,
      request: entry.message,
      repeatCount: entry.repeatCount,
    };
    if (typeof message.method === "string") {
      const isRequest = rpcId !== undefined;
      exchanges.push({
        ...base,
        kind: isRequest ? "request" : "notification",
        method: message.method,
        status: isRequest ? "pending" : "ok",
        params: message.params,
      });
      if (isRequest) pending.set(correlationKey(entry, entry.direction, rpcId), exchanges.length - 1);
      continue;
    }
    const outcome = message.error !== undefined ? "error" : "ok";
    const requestDirection = entry.direction === "send" ? "receive" : "send";
    const index = rpcId === undefined ? undefined : pending.get(correlationKey(entry, requestDirection, rpcId));
    if (index === undefined) {
      exchanges.push({
        ...base,
        kind: "response",
        method: "response",
        status: outcome,
        response: message.error ?? message.result,
        responseMessage: entry.message,
      });
      continue;
    }
    pending.delete(correlationKey(entry, requestDirection, rpcId!));
    const request = exchanges[index];
    const durationMs = Date.parse(entry.timestamp) - Date.parse(request.timestamp);
    exchanges[index] = {
      ...request,
      status: outcome,
      durationMs: Number.isNaN(durationMs) ? undefined : Math.max(0, durationMs),
      response: message.error ?? message.result,
      responseMessage: entry.message,
    };
  }
  return exchanges;
}

export interface ExchangeFilter {
  method: string;
  direction: "all" | RpcTrafficEntry["direction"] | string;
  search: string;
  order: "oldest" | "newest";
}

const travelled = (exchange: ProtocolExchange, direction: string) =>
  exchange.direction === direction ||
  (exchange.responseMessage !== undefined && exchange.kind === "request" && exchange.direction !== direction);

export function filterExchanges(exchanges: readonly ProtocolExchange[], options: ExchangeFilter) {
  const search = options.search.trim().toLowerCase();
  const time = (exchange: ProtocolExchange) => Date.parse(exchange.timestamp);
  return exchanges
    .filter((exchange) => options.direction === "all" || travelled(exchange, options.direction))
    .filter((exchange) => !options.method || exchange.method.includes(options.method))
    .filter((exchange) => !search || JSON.stringify(exchange).toLowerCase().includes(search))
    .sort((a, b) => (options.order === "newest" ? time(b) - time(a) : time(a) - time(b)));
}

function headerValue(headers: unknown, name: string): string | undefined {
  const pairs: unknown[] = Array.isArray(headers)
    ? headers
    : headers && typeof headers === "object"
      ? Object.entries(headers)
      : [];
  for (const pair of pairs) {
    if (Array.isArray(pair) && String(pair[0]).toLowerCase() === name && typeof pair[1] === "string") return pair[1];
  }
  return undefined;
}

/** Short JSON-RPC summary for a captured HTTP request, e.g. "tools/call echo". */
export function networkRpcLabel(entry: { requestHeaders: unknown; requestBody?: string }): string | undefined {
  const method = headerValue(entry.requestHeaders, "mcp-method");
  if (method) {
    const name = headerValue(entry.requestHeaders, "mcp-name");
    return name ? `${method} ${name}` : method;
  }
  if (!entry.requestBody) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(entry.requestBody);
  } catch {
    return undefined;
  }
  const messages = Array.isArray(body) ? body : [body];
  const first = messages[0];
  if (!first || typeof first !== "object") return undefined;
  const label = typeof (first as { method?: unknown }).method === "string" ? (first as { method: string }).method : "response";
  return messages.length > 1 ? `${label} +${messages.length - 1}` : label;
}
