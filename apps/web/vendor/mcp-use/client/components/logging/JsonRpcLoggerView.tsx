// Modified for the combined Inspector: add a Network view with request/response details next to the protocol log, sidebar-style active pills for the Protocol/Network views, and theme-aware selected/expanded states.
import { McpIcon } from "@/client/components/ui/client-icons";
import { JSONDisplay } from "@/client/components/shared/JSONDisplay";
import { TabsSubtle, TabsSubtleItem } from "@/client/components/ui/tabs-subtle";
import { downloadJson } from "../../../../../src/features/model.js";
import {
  NetworkLogList,
  logDetailsClass,
  logRowBaseClass,
  logRowExpandedClass,
  logRowIdleClass,
  rpcViewTabClass,
  rpcViewTabSelectedClass,
  segmentedSelectedClass,
  segmentedStateClass,
  useServerNetworkEntries,
} from "../../../../../src/features/TrafficLogs.js";
import { Button } from "@/client/components/ui/button";
import {
  CheckboxGroup,
  CheckboxItem,
} from "@/client/components/ui/checkbox-group";
import { Input } from "@/client/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { useRpcLogVirtualizer } from "@/client/hooks/use-rpc-log-virtualizer";
import { cn } from "@/client/lib/utils";
import { ensureRpcTrafficBridge } from "@/client/rpc-traffic-bridge";
import { getRpcTrafficMethod } from "@/client/rpc-traffic-coalesce";
import {
  buildRpcTrafficResponseLabels,
  type RpcTrafficResponseLabel,
} from "@/client/rpc-traffic-correlation";
import {
  rpcTrafficStore,
  type RpcTrafficEntry,
  type RpcTrafficSource,
} from "@/client/rpc-traffic-store";
import { copyToClipboard } from "@/client/utils/browser";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Download,
  PanelsTopLeft,
  Search,
  Trash2,
} from "lucide-react";
import { clearRpcLogs } from "@mcp-use/client/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

ensureRpcTrafficBridge();


interface JsonRpcLoggerViewProps {
  serverIds?: string[];
  onCountChange?: (count: number) => void;
  onClearRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onExportRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function JsonRpcLoggerView({
  serverIds,
  onCountChange,
  onClearRef,
  onExportRef,
}: JsonRpcLoggerViewProps = {}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [view, setView] = useState<0 | 1>(0);
  const isNetworkView = view === 1;
  const network = useServerNetworkEntries(serverIds, searchQuery);
  const [sourceFilters, setSourceFilters] = useState<Set<RpcTrafficSource>>(
    () => new Set(["mcp", "widget"])
  );
  const items = useSyncExternalStore(
    rpcTrafficStore.subscribe,
    rpcTrafficStore.getSnapshot,
    rpcTrafficStore.getSnapshot
  );

  const copyMessageToClipboard = async (payload: unknown) => {
    try {
      const jsonString = JSON.stringify(payload, null, 2);
      await copyToClipboard(jsonString);
      toast.success("Message copied to clipboard");
    } catch (error) {
      console.error("Failed to copy message:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const scopedItems = useMemo(() => {
    if (!serverIds?.length) return items;
    const serverIdSet = new Set(serverIds);
    return items.filter((item) => serverIdSet.has(item.serverId));
  }, [items, serverIds]);

  const responseLabels = useMemo(
    () => buildRpcTrafficResponseLabels(items),
    [items]
  );

  const sourceCheckedIndices = useMemo(() => {
    const indices = new Set<number>();
    if (sourceFilters.has("mcp")) indices.add(0);
    if (sourceFilters.has("widget")) indices.add(1);
    return indices;
  }, [sourceFilters]);

  const toggleSourceFilter = useCallback((source: RpcTrafficSource) => {
    setSourceFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const filteredItems = useMemo(() => {
    let result = scopedItems;

    if (sourceFilters.size > 0) {
      result = result.filter((item) => sourceFilters.has(item.source));
    }

    const queryLower = searchQuery.trim().toLowerCase();
    if (queryLower) {
      result = result.filter((item) => {
        const method = getMethod(item, responseLabels);
        return (
          item.serverId.toLowerCase().includes(queryLower) ||
          item.widgetId?.toLowerCase().includes(queryLower) ||
          item.source.includes(queryLower) ||
          method.toLowerCase().includes(queryLower) ||
          item.direction.toLowerCase().includes(queryLower) ||
          JSON.stringify(item.message).toLowerCase().includes(queryLower)
        );
      });
    }

    return [...result].reverse();
  }, [responseLabels, scopedItems, searchQuery, sourceFilters]);

  const { totalHeight, visibleItems } = useRpcLogVirtualizer(
    filteredItems,
    expanded,
    scrollRef
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearMessages = useCallback(async () => {
    const sources =
      sourceFilters.size === 0 || sourceFilters.size === 2
        ? undefined
        : ([...sourceFilters] satisfies RpcTrafficSource[]);

    if (!sources || sources.includes("mcp")) {
      if (serverIds?.length) {
        serverIds.forEach((serverId) => clearRpcLogs(serverId));
      } else {
        clearRpcLogs();
      }
    }
    rpcTrafficStore.clear({ serverIds, sources });
    setExpanded(new Set());
  }, [serverIds, sourceFilters]);

  const copyFilteredMessages = useCallback(async () => {
    try {
      await copyToClipboard(JSON.stringify(filteredItems, null, 2));
      toast.success(`Copied ${filteredItems.length} messages`);
    } catch (error) {
      console.error("Failed to copy messages:", error);
      toast.error("Failed to copy to clipboard");
    }
  }, [filteredItems]);

  const downloadFilteredMessages = useCallback(() => {
    const blob = new Blob([JSON.stringify(filteredItems, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mcp-rpc-traffic-${new Date()
      .toISOString()
      .replaceAll(":", "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredItems]);

  const copyNetworkEntries = useCallback(async () => {
    try {
      await copyToClipboard(JSON.stringify(network.entries, null, 2));
      toast.success(`Copied ${network.entries.length} requests`);
    } catch (error) {
      console.error("Failed to copy network requests:", error);
      toast.error("Failed to copy to clipboard");
    }
  }, [network.entries]);

  const visibleCount = isNetworkView
    ? network.entries.length
    : filteredItems.length;

  useEffect(() => {
    onCountChange?.(visibleCount);
  }, [visibleCount, onCountChange]);

  useEffect(() => {
    if (onClearRef) onClearRef.current = clearMessages;
    return () => {
      if (onClearRef) onClearRef.current = null;
    };
  }, [clearMessages, onClearRef]);

  useEffect(() => {
    if (onExportRef) onExportRef.current = copyFilteredMessages;
    return () => {
      if (onExportRef) onExportRef.current = null;
    };
  }, [copyFilteredMessages, onExportRef]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2 py-2">
        <h2 className="sr-only">RPC Logs</h2>
        <TabsSubtle
          selectedIndex={view}
          onSelect={(index) => setView(index === 1 ? 1 : 0)}
          aria-label="RPC log view"
          className="min-w-0"
        >
          <TabsSubtleItem index={0} label="Protocol" className={cn(rpcViewTabClass, view === 0 && rpcViewTabSelectedClass)} />
          <TabsSubtleItem index={1} label="Network" className={cn(rpcViewTabClass, view === 1 && rpcViewTabSelectedClass)} />
        </TabsSubtle>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={isNetworkView ? copyNetworkEntries : copyFilteredMessages}
            disabled={visibleCount === 0}
            aria-label={
              isNetworkView
                ? "Copy filtered network requests"
                : "Copy filtered RPC traffic"
            }
            title="Copy filtered"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={
              isNetworkView
                ? () =>
                    downloadJson(
                      `mcp-network-traffic-${new Date()
                        .toISOString()
                        .replaceAll(":", "-")}.json`,
                      network.entries
                    )
                : downloadFilteredMessages
            }
            disabled={visibleCount === 0}
            aria-label={
              isNetworkView
                ? "Download filtered network requests as JSON"
                : "Download filtered RPC traffic as JSON"
            }
            title="Download JSON"
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={isNetworkView ? network.clear : clearMessages}
            disabled={
              isNetworkView ? network.entries.length === 0 : items.length === 0
            }
            aria-label={
              isNetworkView ? "Clear network requests" : "Clear RPC traffic"
            }
            title="Clear"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex shrink-0 items-center px-2 py-2">
        <div className="relative min-w-0 flex-1 transition-[flex-grow] duration-200 ease-out">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search"
            aria-label={
              isNetworkView ? "Search network requests" : "Search RPC traffic"
            }
            className="h-8 w-full pl-7 text-xs shadow-none transition-[width] duration-200 ease-out"
          />
        </div>
        <div
          aria-hidden={isSearchFocused || isNetworkView}
          inert={isNetworkView}
          className={cn(
            "shrink-0 overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out",
            isSearchFocused || isNetworkView
              ? "pointer-events-none ml-0 max-w-0 opacity-0"
              : "ml-2 max-w-32 opacity-100"
          )}
        >
          <CheckboxGroup
            checkedIndices={sourceCheckedIndices}
            orientation="horizontal"
            aria-label="Filter RPC traffic by source"
            className="w-auto shrink-0"
          >
            <CheckboxItem
              index={0}
              label="MCP"
              className={cn(segmentedStateClass, sourceFilters.has("mcp") && segmentedSelectedClass)}
              size="sm"
              checked={sourceFilters.has("mcp")}
              onToggle={() => toggleSourceFilter("mcp")}
            />
            <CheckboxItem
              index={1}
              label="UI"
              className={cn(segmentedStateClass, sourceFilters.has("widget") && segmentedSelectedClass)}
              size="sm"
              checked={sourceFilters.has("widget")}
              onToggle={() => toggleSourceFilter("widget")}
            />
          </CheckboxGroup>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto pb-10"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 0, black calc(100% - 3rem), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0, black calc(100% - 3rem), transparent 100%)",
        }}
      >
        {isNetworkView ? (
          <NetworkLogList
            entries={network.entries}
            compact
            testId="rpc-network-log"
          />
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-xs text-muted-foreground">
              {"No messages yet"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {"JSON-RPC messages will appear here"}
            </div>
          </div>
        ) : (
          <div className="relative w-full" style={{ height: totalHeight }}>
            {visibleItems.map(({ item, top, height }) => (
              <RpcLogRow
                key={item.id}
                item={item}
                method={getMethod(item, responseLabels)}
                responseLabel={responseLabels.get(item.id)}
                top={top}
                height={height}
                expanded={expanded.has(item.id)}
                onToggle={() => toggleExpanded(item.id)}
                onCopy={() => copyMessageToClipboard(item.message)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RpcLogRow({
  item,
  method,
  responseLabel,
  top,
  height,
  expanded,
  onToggle,
  onCopy,
}: {
  item: RpcTrafficEntry;
  method: string;
  responseLabel?: RpcTrafficResponseLabel;
  top: number;
  height: number;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const direction = getDirectionLabel(item);
  const repeatSuffix =
    item.repeatCount && item.repeatCount > 1 ? ` ×${item.repeatCount}` : "";

  return (
    <div
      className="absolute inset-x-0 overflow-hidden"
      style={{ top, height }}
      data-testid={`rpc-message-${method.replace(/\//g, "-")}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(
          logRowBaseClass,
          "h-9 py-2 pr-3 pl-1",
          expanded ? logRowExpandedClass : logRowIdleClass
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex size-4 shrink-0 items-center justify-center">
                {item.direction === "receive" ? (
                  <ArrowDownLeft className="size-3.5 text-blue-500" />
                ) : (
                  <ArrowUpRight className="size-3.5 text-emerald-500" />
                )}
              </span>
            }
            nativeButton={false}
          />
          <TooltipContent side="left">{direction}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {item.source === "mcp" ? (
                  <McpIcon className="size-3" />
                ) : (
                  <PanelsTopLeft className="size-3" />
                )}
              </span>
            }
            nativeButton={false}
          />
          <TooltipContent side="left">
            {item.source === "mcp" ? "MCP server" : "UI widget"}
          </TooltipContent>
        </Tooltip>

        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {responseLabel ? (
            <>
              <span>{responseLabel.method}</span>
              {responseLabel.outcome === "error" ? (
                <span className="text-muted-foreground"> · error</span>
              ) : null}
            </>
          ) : (
            method
          )}
          {repeatSuffix ? (
            <span className="text-muted-foreground">{repeatSuffix}</span>
          ) : null}
        </span>

        {responseLabel ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="shrink-0 cursor-default font-mono text-[10px] tabular-nums text-muted-foreground underline decoration-dotted underline-offset-2">
                  {responseLabel.latencyMs} ms
                </span>
              }
              nativeButton={false}
            />
            <TooltipContent side="left">
              {`Request took ${responseLabel.latencyMs} ms (${new Date(
                item.timestamp
              ).toLocaleString()})`}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </button>

      {expanded ? (
        <div className={cn("relative mx-3 mt-1 mb-2 max-h-44 overflow-auto p-2 pr-8", logDetailsClass)}>
          <JSONDisplay
            data={item.message}
            className="[&_pre]:!text-[10px] [&_pre]:!leading-4"
          />
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={onCopy}
            className="absolute right-1 top-1 size-6 rounded-full p-0"
            title="Copy message"
            aria-label="Copy message"
          >
            <Copy className="size-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function getMethod(
  entry: RpcTrafficEntry,
  responseLabels: ReadonlyMap<string, RpcTrafficResponseLabel>
): string {
  const responseLabel = responseLabels.get(entry.id);
  if (responseLabel) return responseLabel.method;

  const fromMessage = getRpcTrafficMethod(entry.message);
  if (fromMessage) return fromMessage;
  const message = entry.message as {
    result?: unknown;
    error?: unknown;
  };
  if (message?.result !== undefined) return "result";
  if (message?.error !== undefined) return "error";
  return "unknown";
}

function getDirectionLabel(entry: RpcTrafficEntry): string {
  if (entry.source === "widget") {
    return entry.direction === "send" ? "Host → Widget" : "Widget → Host";
  }
  return entry.direction === "send" ? "Inspector → MCP" : "MCP → Inspector";
}
