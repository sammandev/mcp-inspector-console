import type { McpServer } from "@mcp-use/client/react";
import { Network } from "lucide-react";
import { useInspector } from "@/client/context/InspectorContext";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { rpcTrafficStore } from "../../vendor/mcp-use/client/rpc-traffic-store.js";
import { downloadJson, parseParameters, redact } from "./model.js";
import { networkEntriesFor, networkStore } from "./network.js";
import { StyledSelect } from "./StyledSelect.js";
import { buildProtocolExchanges, filterExchanges } from "./traffic.js";
import { NetworkLogList, ProtocolLogList } from "./TrafficLogs.js";
import { useInspectorAction } from "./useInspectorAction.js";
import {
  InspectorPage,
  buttonClass,
  getSelectedConnector,
  inputClass,
  sectionClass,
  stringify,
} from "./OfficialPanels.js";

type HistoryItem = {
  id: number;
  method: string;
  status: "ok" | "error";
  durationMs: number;
  timestamp: string;
  request: unknown;
  response: unknown;
};

export function ProtocolTab({ connection }: { connection: McpServer }) {
  const { activeTab } = useInspector();
  const { run, cancel, busy, error, result } = useInspectorAction(activeTab === "protocol");
  const [text, setText] = useState('{"method":"ping","params":{}}');
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [direction, setDirection] = useState("all");
  const [order, setOrder] = useState<"newest" | "oldest">("oldest");
  const [saved, setSaved] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [rpc, setRpc] = useState(() => [...rpcTrafficStore.getSnapshot()]);
  const network = useSyncExternalStore(networkStore.subscribe, networkStore.snapshot);

  useEffect(() => rpcTrafficStore.subscribe(() => setRpc([...rpcTrafficStore.getSnapshot()])), []);
  useEffect(() => {
    if (connection.url) networkStore.setLimit(networkStore.limit(connection.url), connection.url);
  }, [connection.url]);

  const connector = () => getSelectedConnector(connection);
  const request = (method: string, params: Record<string, unknown>, signal: AbortSignal) =>
    connector().request(method, params, { signal, timeout: 30_000 });
  const serverTraffic = useMemo(() => rpc.filter((entry) => entry.serverId === connection.id), [rpc, connection.id]);
  const exchanges = useMemo(
    () => filterExchanges(buildProtocolExchanges(serverTraffic), { method: methodFilter, direction, search, order }),
    [serverTraffic, methodFilter, direction, search, order],
  );
  const networkEntries = useMemo(() => {
    const query = search.toLowerCase();
    const scoped = connection.url ? networkEntriesFor(network, [connection.url]) : [];
    const matching = scoped.filter((entry) => !query || stringify(entry).toLowerCase().includes(query));
    return order === "newest" ? matching.reverse() : matching;
  }, [network, connection.url, search, order]);
  const consoleEntries = connection.log.filter((entry) =>
    stringify(entry).toLowerCase().includes(search.toLowerCase()),
  );

  async function sendOne(input: Record<string, unknown>, signal: AbortSignal) {
    if (typeof input.method !== "string" || !input.method.trim()) {
      throw new Error("A request method is required");
    }
    const params = input.params === undefined ? {} : parseParameters(stringify(input.params));
    const started = performance.now();
    const item = {
      id: Date.now() + Math.random(),
      method: input.method,
      timestamp: new Date().toISOString(),
      request: input,
    };
    try {
      const response = await request(input.method, params, signal);
      setHistory((items) => [
        ...items,
        { ...item, status: "ok" as const, durationMs: Math.round(performance.now() - started), response },
      ].slice(-100));
      return response;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setHistory((items) => [
        ...items,
        { ...item, status: "error" as const, durationMs: Math.round(performance.now() - started), response: { error: message } },
      ].slice(-100));
      throw failure;
    }
  }

  async function send(signal: AbortSignal) {
    const input: unknown = JSON.parse(text);
    if (Array.isArray(input)) {
      if (!input.length || input.length > 20) {
        throw new Error("A batch must contain 1 to 20 requests");
      }
      const results = [];
      for (const item of input) {
        results.push(await sendOne(parseParameters(stringify(item)), signal)
          .then((value) => ({ result: value }), (failure: Error) => ({ error: failure.message })));
      }
      return results;
    }
    return sendOne(parseParameters(text), signal);
  }

  const lastResponse = history.at(-1);
  const nextCursor = lastResponse?.status === "ok" &&
    lastResponse.response &&
    typeof lastResponse.response === "object" &&
    "nextCursor" in lastResponse.response
    ? String((lastResponse.response as { nextCursor: unknown }).nextCursor)
    : undefined;
  const action = (name: string, callback: (signal: AbortSignal) => Promise<unknown> | unknown) =>
    <button
      type="button"
      className={buttonClass}
      disabled={busy}
      onClick={() => void run(callback)}
    >
      {name}
    </button>;

  return (
    <InspectorPage
      title="Protocol"
      icon={Network}
      testId="inspector-features"
      connection={connection}
      result={result}
      error={error}
      busy={busy}
      cancel={cancel}
      resultFormat="raw"
    >
      <section aria-labelledby="protocol-request-title" className={sectionClass}>
        <h3 id="protocol-request-title" className="text-sm font-medium">Request console</h3>
        <label className="block space-y-2">
          Request parameters
          <textarea
            aria-label="Request parameters"
            className={`${inputClass} min-h-40 font-mono`}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Send one request object, or an array of up to 20 for a batch. Include <code>_meta</code> in params for request metadata such as a progress token.
        </p>
        <div className="flex flex-wrap gap-2">
          {action("Send request", send)}
          {nextCursor && action("Fetch next page", (signal) => {
            const last = lastResponse!.request as { method: string; params?: Record<string, unknown> };
            return sendOne({ method: last.method, params: { ...last.params, cursor: nextCursor } }, signal);
          })}
          {action("Save request", () => {
            parseParameters(text);
            setSaved((items) => [...items, stringify(redact(JSON.parse(text)))]);
            return { saved: true };
          })}
          {action("Clear protocol", () => rpcTrafficStore.clear({ serverIds: [connection.id] }))}
          {action("Export protocol", () => {
            downloadJson("protocol.json", exchanges);
            return { exported: exchanges.length };
          })}
        </div>
        {saved.map((item, index) => (
          <button
            type="button"
            className={buttonClass}
            key={index}
            onClick={() => setText(item)}
          >
            Saved request {index + 1}
          </button>
        ))}
        {history.length > 0 && (
          <>
            <h4 className="font-medium">Request history</h4>
            <ol className="space-y-1 text-sm">
              {history.map((item, index) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2 font-mono">
                  <span>{new Date(item.timestamp).toLocaleTimeString()} · {item.method} · {item.status} · {item.durationMs} ms</span>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setText(stringify(redact(item.request)))}
                  >
                    Load request {index + 1}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void run(() => item.response)}
                  >
                    Show response {index + 1}
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="grid gap-2 md:grid-cols-4">
          <label className="block">
            Filter traffic
            <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label className="block">
            Method filter
            <input className={inputClass} value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} />
          </label>
          <div className="block space-y-1">
            <span>Direction</span>
            <StyledSelect
              label="Direction"
              value={direction}
              onValueChange={setDirection}
              options={[
                { value: "all", label: "All" },
                { value: "send", label: "Sent" },
                { value: "receive", label: "Received" },
              ]}
            />
          </div>
          <div className="block space-y-1">
            <span>Order</span>
            <StyledSelect
              label="Order"
              value={order}
              onValueChange={(value) => setOrder(value === "newest" ? "newest" : "oldest")}
              options={[
                { value: "oldest", label: "Oldest first" },
                { value: "newest", label: "Newest first" },
              ]}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Protocol view: each JSON-RPC request paired with its response, with status and round-trip time. Expand a row for parameters and the result.
        </p>
        <ProtocolLogList exchanges={exchanges} testId="protocol-traffic" />
      </section>

      <section aria-labelledby="protocol-network-title" className={sectionClass}>
        <h3 id="protocol-network-title" className="text-sm font-medium">Network</h3>
        <p className="text-xs text-muted-foreground">
          Every HTTP request this client made: URL, status, timing, request and response headers, and bodies (secrets redacted, bodies capped at 64 KB). The log keeps the latest {networkStore.limit(connection.url)} requests; change the limit in Connection Settings.
        </p>
        <div className="flex flex-wrap gap-2">
          {action("Clear network", () => networkStore.clear(connection.url))}
          {action("Export network", () => {
            downloadJson("network.json", networkEntries);
            return { exported: networkEntries.length };
          })}
        </div>
        <NetworkLogList entries={networkEntries} testId="network-traffic" />
      </section>

      <section aria-labelledby="protocol-console-title" className={sectionClass}>
        <h3 id="protocol-console-title" className="text-sm font-medium">Console</h3>
        <label className="block">
          Filter console
          <input
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {action("Export console", () => {
            downloadJson("console.json", consoleEntries);
            return { exported: consoleEntries.length };
          })}
        </div>
        <pre data-testid="protocol-console" className="overflow-auto text-xs">{stringify(redact(consoleEntries))}</pre>
      </section>
    </InspectorPage>
  );
}
