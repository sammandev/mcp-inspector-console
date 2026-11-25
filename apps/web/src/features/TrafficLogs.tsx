import { ArrowDownLeft, ArrowUpRight, ChevronRight, Copy } from "lucide-react";
import { useMcpClient } from "@mcp-use/client/react";
import { Fragment, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { cn } from "@/client/lib/utils";
import { copyToClipboard } from "@/client/utils/browser";
import { JSONDisplay } from "../../vendor/mcp-use/client/components/shared/JSONDisplay.js";
import { redact } from "./model.js";
import { networkEntriesFor, networkStore, type NetworkEntry } from "./network.js";
import { networkRpcLabel, type ProtocolExchange } from "./traffic.js";

// The RPC panel sits on the light page surface (#f3f3f3), where bg-accent/bg-muted are nearly invisible,
// so selected and expanded states use a raised surface or a primary tint that contrasts in both themes.
export const segmentedStateClass = "transition-[background-color,color,box-shadow] text-muted-foreground hover:bg-background/70 hover:text-foreground dark:hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const segmentedSelectedClass = "bg-background text-foreground shadow-sm ring-1 ring-inset ring-foreground/15 dark:bg-accent dark:ring-foreground/20";
// Same soft pill as the active sidebar menu item.
export const rpcViewTabClass = "rounded-full transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const rpcViewTabSelectedClass = "bg-sidebar-accent text-foreground";
export const logRowBaseClass = "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg text-left transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
export const logRowExpandedClass = "bg-primary/[0.07] text-foreground ring-1 ring-inset ring-primary/20 dark:bg-primary/10";
export const logRowIdleClass = "text-muted-foreground hover:bg-primary/[0.04] hover:text-foreground dark:hover:bg-primary/[0.06]";
export const logDetailsClass = "rounded-lg border border-border bg-background/80 dark:bg-muted/30";

/** Network entries for the given mcp-use server ids (all entries when no ids are given), newest first. */
export function useServerNetworkEntries(serverIds: readonly string[] | undefined, search = "") {
  const all = useSyncExternalStore(networkStore.subscribe, networkStore.snapshot, networkStore.snapshot);
  const { servers } = useMcpClient();
  const serverUrls = useMemo(
    () => (serverIds ?? [])
      .map((id) => servers.find((server) => server.id === id)?.url ?? (/^https?:\/\//.test(id) ? id : undefined))
      .filter((url): url is string => Boolean(url)),
    [serverIds, servers],
  );
  const entries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const scoped = serverIds?.length && !serverUrls.length ? [] : networkEntriesFor(all, serverUrls);
    return scoped
      .filter((entry) => !query || JSON.stringify(entry).toLowerCase().includes(query))
      .reverse();
  }, [all, search, serverIds, serverUrls]);
  const clear = () => {
    if (serverUrls.length) serverUrls.forEach((url) => networkStore.clear(url));
    else if (!serverIds?.length) networkStore.clear();
  };
  return { entries, clear };
}

export function formatDuration(ms?: number) {
  if (ms === undefined) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString();

function parseJson(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const };
  }
}

function statusColor(entry: NetworkEntry) {
  if (entry.error) return "red" as const;
  if (entry.status === undefined) return "gray" as const;
  if (entry.status >= 400) return "red" as const;
  if (entry.status >= 300) return "amber" as const;
  return "green" as const;
}

async function copy(label: string, value: unknown) {
  try {
    await copyToClipboard(typeof value === "string" ? value : JSON.stringify(value, null, 2));
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}

function Section({
  title,
  copyValue,
  compact,
  children,
}: {
  title: string;
  copyValue?: unknown;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h5 className={cn("font-medium uppercase tracking-wide text-muted-foreground", compact ? "text-[9px]" : "text-[11px]")}>
          {title}
        </h5>
        {copyValue !== undefined && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 rounded-full p-0"
            aria-label={`Copy ${title.toLowerCase()}`}
            title={`Copy ${title.toLowerCase()}`}
            onClick={() => void copy(title, copyValue)}
          >
            <Copy className="size-3" />
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function KeyValues({ values, compact }: { values: unknown; compact: boolean }) {
  const rows = values && typeof values === "object" ? Object.entries(values as Record<string, unknown>) : [];
  if (!rows.length) return <p className="text-xs text-muted-foreground">None</p>;
  return (
    <dl className={cn("grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono", compact ? "text-[10px]" : "text-xs")}>
      {rows.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="break-all text-muted-foreground">{key}</dt>
          <dd className="break-all text-foreground">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function JsonBlock({ value, compact }: { value: unknown; compact: boolean }) {
  return (
    <div className={cn("overflow-auto rounded-lg bg-muted/40 p-2", compact ? "max-h-44" : "max-h-80")}>
      <JSONDisplay data={value} className={compact ? "[&_pre]:!text-[10px] [&_pre]:!leading-4" : "[&_pre]:!text-xs"} />
    </div>
  );
}

function BodyView({ text, truncated, compact }: { text?: string; truncated?: boolean; compact: boolean }) {
  if (text === undefined) return <p className="text-xs text-muted-foreground">Not captured yet</p>;
  if (text === "") return <p className="text-xs text-muted-foreground">Empty</p>;
  const json = parseJson(text);
  return (
    <div className="space-y-1">
      {json.ok ? (
        <JsonBlock value={json.value} compact={compact} />
      ) : (
        <pre className={cn("overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/40 p-2 font-mono", compact ? "max-h-44 text-[10px] leading-4" : "max-h-80 text-xs")}>
          {text}
        </pre>
      )}
      {truncated && <p className="text-[10px] text-muted-foreground">Body truncated at 64 KB.</p>}
    </div>
  );
}

function EmptyLog({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-8 text-center">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function useExpanded<T>() {
  const [expanded, setExpanded] = useState<Set<T>>(() => new Set());
  const toggle = (id: T) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return [expanded, toggle] as const;
}

function RowButton({
  expanded,
  onToggle,
  compact,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        logRowBaseClass,
        expanded ? logRowExpandedClass : logRowIdleClass,
        compact ? "py-2 pr-2 pl-1" : "px-2 py-2",
      )}
    >
      <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")} />
      {children}
    </button>
  );
}

export function NetworkLogList({
  entries,
  compact = false,
  testId,
}: {
  entries: readonly NetworkEntry[];
  compact?: boolean;
  testId?: string;
}) {
  const [expanded, toggle] = useExpanded<number>();
  if (!entries.length) {
    return <div data-testid={testId}><EmptyLog title="No network requests yet" hint="HTTP requests to this server will appear here" /></div>;
  }
  return (
    <ol data-testid={testId} className={cn("divide-y divide-border/60", !compact && "rounded-xl border border-border")}>
      {entries.map((entry) => {
        const url = String(redact(entry.url));
        let path = url;
        try {
          const parsed = new URL(url);
          path = `${parsed.pathname}${parsed.search}`;
        } catch {
          // Keep the raw value when it is not an absolute URL.
        }
        const isOpen = expanded.has(entry.id);
        const statusLabel = entry.error ? "failed" : entry.status === undefined ? "pending" : String(entry.status);
        const rpcLabel = networkRpcLabel(entry);
        return (
          <li key={entry.id} data-testid="network-entry" className="min-w-0">
            <RowButton expanded={isOpen} onToggle={() => toggle(entry.id)} compact={compact}>
              <Badge size="sm" color={statusColor(entry)} className="shrink-0 font-mono">{statusLabel}</Badge>
              <span className="shrink-0 font-mono text-xs text-foreground">{entry.method}</span>
              {rpcLabel && <span className="min-w-0 max-w-[50%] shrink truncate font-mono text-xs text-foreground" title={rpcLabel}>{rpcLabel}</span>}
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>{compact ? path : url}</span>
              {entry.stream && <Badge size="sm" variant="outline" className="shrink-0">SSE</Badge>}
              <span className="shrink-0 font-mono text-[10px] tabular-nums">{formatDuration(entry.durationMs)}</span>
              {!compact && <span className="shrink-0 font-mono text-[10px] tabular-nums">{formatTime(entry.timestamp)}</span>}
            </RowButton>
            {isOpen && (
              <div className={cn("my-2 space-y-3 p-3", logDetailsClass, compact && "mx-1")} data-testid="network-entry-details">
                <Section title="General" compact={compact}>
                  <KeyValues
                    compact={compact}
                    values={{
                      "Request URL": url,
                      "Request method": entry.method,
                      "Status": entry.status === undefined ? statusLabel : `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`,
                      "Duration": formatDuration(entry.durationMs),
                      "Started": new Date(entry.timestamp).toLocaleString(),
                      ...(entry.stream ? { "Stream": `${entry.stream.events} event${entry.stream.events === 1 ? "" : "s"} · ${entry.stream.closedAt ? "closed" : "open"}` } : {}),
                      ...(entry.error ? { "Error": entry.error } : {}),
                    }}
                  />
                </Section>
                <Section title="Request headers" compact={compact} copyValue={entry.requestHeaders}>
                  <KeyValues values={entry.requestHeaders} compact={compact} />
                </Section>
                <Section title="Request body" compact={compact} copyValue={entry.requestBody}>
                  <BodyView text={entry.requestBody ?? ""} compact={compact} />
                </Section>
                <Section title="Response headers" compact={compact} copyValue={entry.responseHeaders}>
                  <KeyValues values={entry.responseHeaders} compact={compact} />
                </Section>
                <Section title="Response body" compact={compact} copyValue={entry.responseBody}>
                  <BodyView text={entry.error && entry.responseBody === undefined ? "" : entry.responseBody} truncated={entry.responseBodyTruncated} compact={compact} />
                </Section>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const exchangeStatus = {
  ok: { label: "ok", color: "green" },
  error: { label: "error", color: "red" },
  pending: { label: "pending", color: "gray" },
} as const;

export function ProtocolLogList({
  exchanges,
  compact = false,
  testId,
}: {
  exchanges: readonly ProtocolExchange[];
  compact?: boolean;
  testId?: string;
}) {
  const [expanded, toggle] = useExpanded<string>();
  if (!exchanges.length) {
    return <div data-testid={testId}><EmptyLog title="No messages yet" hint="JSON-RPC requests and responses will appear here" /></div>;
  }
  return (
    <ol data-testid={testId} className={cn("divide-y divide-border/60", !compact && "rounded-xl border border-border")}>
      {exchanges.map((exchange) => {
        const isOpen = expanded.has(exchange.id);
        const status = exchange.kind === "notification"
          ? { label: "notification", color: "blue" as const }
          : exchangeStatus[exchange.status];
        return (
          <li key={exchange.id} data-testid="protocol-entry" className="min-w-0">
            <RowButton expanded={isOpen} onToggle={() => toggle(exchange.id)} compact={compact}>
              {exchange.direction === "receive"
                ? <ArrowDownLeft aria-label="Received" className="size-3.5 shrink-0 text-blue-500" />
                : <ArrowUpRight aria-label="Sent" className="size-3.5 shrink-0 text-emerald-500" />}
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                {exchange.method}
                {exchange.repeatCount && exchange.repeatCount > 1 ? <span className="text-muted-foreground"> ×{exchange.repeatCount}</span> : null}
              </span>
              <Badge size="sm" color={status.color} className="shrink-0">{status.label}</Badge>
              <span className="shrink-0 font-mono text-[10px] tabular-nums">{exchange.kind === "request" ? formatDuration(exchange.durationMs) : ""}</span>
              {!compact && <span className="shrink-0 font-mono text-[10px] tabular-nums">{formatTime(exchange.timestamp)}</span>}
            </RowButton>
            {isOpen && (
              <div className={cn("my-2 space-y-3 p-3", logDetailsClass, compact && "mx-1")} data-testid="protocol-entry-details">
                <Section title="Summary" compact={compact}>
                  <KeyValues
                    compact={compact}
                    values={{
                      Method: exchange.method,
                      Direction: exchange.direction === "send" ? "Client → server" : "Server → client",
                      Status: status.label,
                      ...(exchange.kind === "request" ? { Duration: formatDuration(exchange.durationMs) } : {}),
                      Time: new Date(exchange.timestamp).toLocaleString(),
                    }}
                  />
                </Section>
                {exchange.kind !== "response" && (
                  <Section title="Parameters" compact={compact} copyValue={redact(exchange.params ?? {})}>
                    <JsonBlock value={redact(exchange.params ?? {})} compact={compact} />
                  </Section>
                )}
                {(exchange.kind !== "notification") && (
                  <Section title={exchange.status === "error" ? "Error" : "Response"} compact={compact} copyValue={exchange.response === undefined ? undefined : redact(exchange.response)}>
                    {exchange.response === undefined
                      ? <p className="text-xs text-muted-foreground">Waiting for a response</p>
                      : <JsonBlock value={redact(exchange.response)} compact={compact} />}
                  </Section>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
