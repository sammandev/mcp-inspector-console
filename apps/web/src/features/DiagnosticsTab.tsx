import type { McpServer } from "@mcp-use/client/react";
import { Activity } from "lucide-react";
import { useMcpClient } from "@mcp-use/client/react";
import { useInspector } from "@/client/context/InspectorContext";
import { useEffect, useState, useSyncExternalStore } from "react";
import { rpcTrafficStore } from "../../vendor/mcp-use/client/rpc-traffic-store.js";
import { InspectorPage, buttonClass, exportServers, getSelectedConnector, inputClass, sectionClass, stringify } from "./OfficialPanels.js";
import { downloadJson, parseConfiguration, redact, serializeConfiguration, type ServerConfiguration } from "./model.js";
import { networkStore } from "./network.js";
import { runLoad } from "./load.js";
import { StyledSelect } from "./StyledSelect.js";
import { useInspectorAction } from "./useInspectorAction.js";

type LocalSession = { id: string; name: string };
type ListedSession = { id: string; closed: boolean };

export function DiagnosticsTab({ connection }: { connection: McpServer }) {
  const { addServer, servers } = useMcpClient();
  const { activeTab } = useInspector();
  const { run, cancel, busy, error, result } = useInspectorAction(activeTab === "diagnostics");
  const [configText, setConfigText] = useState(() => stringify({
    mcpServers: {
      [connection.name || "server"]: { url: redact(connection.url ?? "") },
    },
  }));
  const [localProfiles, setLocalProfiles] = useState<Record<string, ServerConfiguration>>({});
  const [localSessions, setLocalSessions] = useState<LocalSession[]>([]);
  const [sessions, setSessions] = useState<ListedSession[]>([]);
  const [count, setCount] = useState(10);
  const [concurrency, setConcurrency] = useState(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [parameters, setParameters] = useState('{"method":"ping","params":{}}');
  const [exportFormat, setExportFormat] = useState<"mcp" | "vscode">("mcp");
  const network = useSyncExternalStore(networkStore.subscribe, networkStore.snapshot);
  const [rpc, setRpc] = useState(() => [...rpcTrafficStore.getSnapshot()]);

  useEffect(() => rpcTrafficStore.subscribe(() => setRpc([...rpcTrafficStore.getSnapshot()])), []);

  const request = (method: string, args: Record<string, unknown>, signal: AbortSignal) =>
    getSelectedConnector(connection).request(method, args, { signal, timeout: 30_000 });
  const action = (name: string, callback: (signal: AbortSignal) => Promise<unknown> | unknown) =>
    <button
      type="button"
      className={buttonClass}
      disabled={busy}
      onClick={() => void run(callback)}
    >
      {name}
    </button>;

  const refreshSessions = async (signal: AbortSignal) => {
    const response = await fetch("/mcp/inspector/api/local", { signal });
    if (!response.ok) throw new Error(`Session listing failed: ${response.status}`);
    const value = await response.json() as { sessions: ListedSession[] };
    setSessions(value.sessions);
    return {
      localProcesses: value.sessions,
      mcpUseSessions: Object.keys(connection.client?.getAllActiveSessions() ?? {}),
    };
  };

  async function launch(name: string, config: ServerConfiguration, signal: AbortSignal) {
    const response = await fetch("/mcp/inspector/api/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stringify(config),
      signal,
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(`Local launch failed: ${stringify(redact(value))}`);
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") {
      throw new Error("Invalid local relay response");
    }
    const id = value.id;
    const url = `${window.location.origin}/mcp/inspector/api/local/${id}/mcp`;
    addServer(url, { url, displayName: name, connectionMode: "direct" });
    setLocalSessions((items) => [...items.filter((item) => item.id !== id), { id, name }]);
    return { id, url, profileAdded: true };
  }

  const networkEntries = network.filter((entry) => connection.url && entry.url.includes(connection.url));
  const protocolEntries = rpc.filter((entry) => entry.serverId === connection.id);

  return (
    <InspectorPage
      title="Diagnostics"
      icon={Activity}
      testId="inspector-diagnostics"
      connection={connection}
      result={result}
      error={error}
      busy={busy}
      cancel={cancel}
    >
      <section aria-labelledby="diagnostics-sessions-title" className={sectionClass}>
        <h3 id="diagnostics-sessions-title" className="text-sm font-medium">Local sessions</h3>
        <p className="text-xs text-muted-foreground">
          Local stdio processes are launched explicitly. Importing configuration never starts a process.
        </p>
        {action("Refresh sessions", refreshSessions)}
        {sessions.length > 0 && (
          <ul className="space-y-2">
            {sessions.map((session) => {
              const local = localSessions.find((item) => item.id === session.id);
              const name = local?.name ?? session.id.slice(0, 8);
              return (
                <li key={session.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
                  <span className="font-mono">{session.id} · {session.closed ? "closed" : "running"}</span>
                  {!session.closed && (
                    <>
                      {action(`Read stderr: ${name}`, async (signal) => {
                        const response = await fetch(`/mcp/inspector/api/local/${session.id}`, { signal });
                        if (!response.ok) throw new Error(`Process diagnostics failed: ${response.status}`);
                        return response.json();
                      })}
                      {action(`Stop process: ${name}`, async (signal) => {
                        const response = await fetch(`/mcp/inspector/api/local/${session.id}`, { method: "DELETE", signal });
                        if (!response.ok) throw new Error(`Process stop failed: ${response.status}`);
                        setSessions((items) => items.map((item) =>
                          item.id === session.id ? { ...item, closed: true } : item));
                        setLocalSessions((items) => items.filter((item) => item.id !== session.id));
                        return { stopped: session.id };
                      })}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="diagnostics-config-title" className={sectionClass}>
        <h3 id="diagnostics-config-title" className="text-sm font-medium">Configuration</h3>
        <label className="block">
          Server configuration
          <textarea
            aria-label="Server configuration"
            className={`${inputClass} min-h-56 font-mono`}
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {action("Validate configuration", () => redact(parseConfiguration(configText)))}
          {action("Import profiles", () => {
            const configs = parseConfiguration(configText);
            const local: Record<string, ServerConfiguration> = {};
            for (const [name, config] of Object.entries(configs)) {
              if (config.url) {
                addServer(config.url, {
                  url: config.url,
                  displayName: name,
                  headers: config.headers,
                  connectionMode: "auto",
                });
              } else {
                local[name] = config;
              }
            }
            setLocalProfiles(local);
            return { profilesAdded: Object.keys(configs), localProcessesAwaitExplicitLaunch: Object.keys(local) };
          })}
          {action("Export configuration", () => {
            const configs = parseConfiguration(configText);
            downloadJson(
              exportFormat === "vscode" ? "mcp.vscode.json" : "mcp.json",
              JSON.parse(serializeConfiguration(configs, exportFormat)),
            );
            return { exported: true, format: exportFormat };
          })}
          {action("Export connected servers", () => {
            const value = exportServers(servers, exportFormat);
            downloadJson(exportFormat === "vscode" ? "mcp.vscode.json" : "mcp.json", value);
            return value;
          })}
          {action("Export diagnostics", () => {
            downloadJson("inspector-diagnostics.json", {
              connection: {
                name: connection.name,
                url: connection.url,
                serverInfo: connection.serverInfo,
                authorization: connection.authorization,
                userInfo: connection.userInfo,
              },
              protocol: protocolEntries,
              network: networkEntries,
              console: connection.log,
              notifications: connection.notifications,
              localSessions: sessions,
              result,
            });
            return { exported: true };
          })}
        </div>
        <label className="block space-y-2">
          <span>Export format</span>
          <StyledSelect
            label="Export format"
            value={exportFormat}
            onValueChange={(value) => setExportFormat(value as "mcp" | "vscode")}
            options={[
              { value: "mcp", label: "mcp.json (mcpServers)" },
              { value: "vscode", label: "VS Code (servers)" },
            ]}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Imports accept mcp.json and VS Code configuration. Local command profiles are kept in memory and require explicit launch. Exports redact secrets.
        </p>
        {Object.entries(localProfiles).map(([name, config]) => (
          <div key={name}>{action(`Launch local server: ${name}`, (signal) => launch(name, config, signal))}</div>
        ))}
      </section>

      <section aria-labelledby="diagnostics-load-title" className={sectionClass}>
        <h3 id="diagnostics-load-title" className="text-sm font-medium">Load testing</h3>
        <label className="block">
          Request parameters
          <textarea
            aria-label="Request parameters"
            className={`${inputClass} min-h-32 font-mono`}
            value={parameters}
            onChange={(event) => setParameters(event.target.value)}
          />
        </label>
        <label className="block">
          Request count
          <input className={inputClass} type="number" min={1} max={1000} value={count} onChange={(event) => setCount(Number(event.target.value))} />
        </label>
        <label className="block">
          Concurrency
          <input className={inputClass} type="number" min={1} max={20} value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} />
        </label>
        <label className="flex gap-2">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          I understand this repeats requests
        </label>
        {action("Start load test", (signal) => {
          if (!acknowledged) throw new Error("Confirm that repeated requests are safe for this server");
          return runLoad(count, concurrency, parameters, signal, request);
        })}
      </section>

      <section aria-labelledby="diagnostics-automation-title" className={sectionClass}>
        <h3 id="diagnostics-automation-title" className="text-sm font-medium">CLI automation</h3>
        <p className="text-xs text-muted-foreground">
          Run requests without the browser with the workspace CLI. Use a local configuration file for stdio and credentials; do not paste credentials into shell history.
        </p>
        <pre className="overflow-auto rounded-xl border border-border p-4 text-sm">{`pnpm inspect --url ${JSON.stringify(redact(connection.url ?? ""))} --method tools/list\npnpm inspect --config mcp.json --server audit --method tools/list\npnpm inspect --url ${JSON.stringify(redact(connection.url ?? ""))} --method tools/call --params '{"name":"tool","arguments":{}}'\npnpm inspect --config mcp.json --list-servers --format text\npnpm inspect --url ${JSON.stringify(redact(connection.url ?? ""))} --method ping --load 100 --concurrency 4 --max-p95-ms 500 --output-file load.json`}</pre>
      </section>
    </InspectorPage>
  );
}
