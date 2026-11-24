import { getViewResourceUri, type McpServer, type Tool } from "@mcp-use/client/react";
import { useState, type ReactNode } from "react";
import {
  authorizationServerMetadataUrls, decodeJwt, diffJson, lintSchema, maskToken,
} from "./analysis.js";
import { downloadJson, redact, serializeConfiguration, type ServerConfiguration } from "./model.js";
import { JSONDisplay } from "../../vendor/mcp-use/client/components/shared/JSONDisplay.js";
import type { ToolResult } from "../../vendor/mcp-use/client/components/tools/ToolResultDisplay.js";

export const buttonClass = "inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50";
export const inputClass = "w-full rounded-xl border border-border bg-background p-3 text-sm";
export const stringify = (value: unknown) => JSON.stringify(value, null, 2);

export type Action = (name: string, callback: (signal: AbortSignal) => Promise<unknown> | unknown) => ReactNode;
export type PanelProps = {
  connection: McpServer;
  action: Action;
};

export function getSelectedConnector(connection: McpServer) {
  const sessions = Object.values(connection.client?.getAllActiveSessions() ?? {});
  if (connection.state !== "ready" || sessions.length !== 1) {
    throw new Error("The selected server must have exactly one ready connection");
  }
  return sessions[0].connector;
}

export function InspectorPage({
  title,
  testId,
  connection,
  result,
  error,
  busy,
  cancel,
  resultFormat = "structured",
  children,
}: {
  title: string;
  testId: string;
  connection: McpServer;
  result: unknown;
  error: string;
  busy: boolean;
  cancel: () => void;
  resultFormat?: "raw" | "structured";
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">One connection · {connection.name}</span>
        {busy && (
          <button type="button" className={buttonClass} onClick={cancel}>
            Cancel request
          </button>
        )}
      </header>
      <div className="min-w-0 flex-1 space-y-6 overflow-auto p-4 md:p-6">
        {children}
        {error && <p role="alert" className="rounded-xl border border-destructive p-3 text-sm text-destructive">{error}</p>}
        {result !== undefined && (
          resultFormat === "raw" ? (
            <pre data-testid="inspector-result" className="overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-sm">
              {stringify(redact(result))}
            </pre>
          ) : (
            <div data-testid="inspector-result" className="overflow-auto rounded-xl border border-border bg-muted/30 p-4">
              <JSONDisplay data={redact(result)} collapsible />
            </div>
          )
        )}
      </div>
    </section>
  );
}

export function ToolConformancePanel({
  tool,
  runs,
  onReplay,
  onEdit,
}: {
  tool: Tool;
  runs: ToolResult[];
  onReplay: (run: ToolResult) => void;
  onEdit: (run: ToolResult) => void;
}) {
  const [report, setReport] = useState<unknown>();
  const chronologicalRuns = [...runs].reverse();
  return <section aria-label="Tool conformance" className="mt-4 space-y-3 rounded-xl border border-border p-3">
    <h4 className="font-medium">Tool conformance</h4>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} onClick={() => setReport({
        tool: tool.name,
        inputSchema: lintSchema(tool.inputSchema),
        outputSchema: tool.outputSchema ? lintSchema(tool.outputSchema) : { available: false, note: "No output schema is advertised" },
      })}>Lint tool schemas</button>
      <button type="button" className={buttonClass} onClick={() => {
        const metadata = (tool as Tool & { _meta?: Record<string, unknown> })._meta;
        const resourceUri = getViewResourceUri(metadata);
        const metadataAdvertised = metadata?.ui !== undefined || metadata?.["ui/resourceUri"] !== undefined;
        const status = !metadataAdvertised
          ? "not-advertised"
          : resourceUri?.trim()
            ? "pass"
            : "fail";
        setReport({
          tool: tool.name,
          appMetadata: metadata?.ui ?? metadata?.["ui/resourceUri"] ?? null,
          checks: [{
            name: "MCP App UI resource URI",
            status,
            message: status === "pass"
              ? "A non-empty UI resource URI is advertised."
              : status === "fail"
                ? "MCP App UI metadata must include a non-empty resource URI."
                : "This tool does not advertise an MCP App UI resource.",
          }],
        });
      }}>Inspect app metadata</button>
      <button type="button" className={buttonClass} disabled={chronologicalRuns.length < 2} onClick={() => {
        const [before, after] = chronologicalRuns.slice(-2);
        if (!before || !after) return;
        setReport({
          before: before.timestamp,
          after: after.timestamp,
          differences: diffJson(
            { arguments: before.requestArgs ?? before.args, result: before.result, error: before.error },
            { arguments: after.requestArgs ?? after.args, result: after.result, error: after.error },
          ),
        });
      }}>Diff last two runs</button>
    </div>
    {chronologicalRuns.length > 0 && <ol className="space-y-2 text-sm">
      {chronologicalRuns.map((run, index) => <li key={`${run.timestamp}-${index}`} className="flex flex-wrap items-center gap-2">
        <span>{run.toolName} · {new Date(run.timestamp).toLocaleTimeString()}</span>
        <button type="button" className={buttonClass} onClick={() => onEdit(run)}>Edit run {index + 1}</button>
        <button type="button" className={buttonClass} onClick={() => onReplay(run)}>Replay run {index + 1}</button>
      </li>)}
    </ol>}
    {report !== undefined && (
      <div data-testid="tool-conformance-result" className="max-h-56 overflow-auto rounded-lg bg-muted p-3">
        <JSONDisplay data={redact(report)} collapsible />
      </div>
    )}
  </section>;
}

type Metadata = Record<string, unknown>;
export function OAuthDetails({ connection, action }: PanelProps) {
  const [metadata, setMetadata] = useState<Metadata>();
  const fetchMetadata = async (url: string, signal: AbortSignal) => {
    const query = new URLSearchParams({ serverUrl: connection.url ?? "", url });
    const response = await fetch(`/mcp/inspector/api/oauth/metadata?${query}`, { signal });
    return response.ok ? await response.json() as Metadata : undefined;
  };
  const tokens = connection.authTokens;
  return <div className="flex flex-wrap gap-2">
    {action("Discover authorization server", async (signal) => {
      if (!connection.url) throw new Error("OAuth discovery requires an HTTP server");
      const server = new URL(connection.url);
      const path = server.pathname.replace(/\/+$/, "");
      let resource: Metadata | undefined;
      for (const candidate of [...(path ? [`${server.origin}/.well-known/oauth-protected-resource${path}`] : []), `${server.origin}/.well-known/oauth-protected-resource`]) {
        resource = await fetchMetadata(candidate, signal);
        if (resource) break;
      }
      const issuers = Array.isArray(resource?.authorization_servers) ? resource.authorization_servers.map(String) : [server.origin];
      for (const issuer of issuers) {
        for (const candidate of authorizationServerMetadataUrls(issuer)) {
          const found = await fetchMetadata(candidate, signal);
          if (found) { setMetadata(found); return { protectedResource: resource, metadataUrl: candidate, authorizationServer: found }; }
        }
      }
      throw new Error(`No authorization server metadata found for ${issuers.join(", ")}`);
    })}
    {action("Show tokens", () => ({
      authenticated: Boolean(tokens?.access_token),
      ...(tokens?.access_token ? {
        tokens: { access: maskToken(tokens.access_token), refresh: tokens.refresh_token ? maskToken(tokens.refresh_token) : undefined, accessClaims: decodeJwt(tokens.access_token) },
        scope: tokens.scope, expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : undefined, clientId: tokens.client_id, tokenEndpoint: tokens.token_endpoint,
      } : {}),
    }))}
    {action("Revoke tokens", async (signal) => {
      const endpoint = typeof metadata?.revocation_endpoint === "string" ? metadata.revocation_endpoint : undefined;
      if (!endpoint) throw new Error("Discover an authorization server that advertises a revocation_endpoint first");
      if (!tokens?.access_token) throw new Error("There is no access token to revoke");
      const revoked: string[] = [];
      for (const [hint, token] of [["refresh_token", tokens.refresh_token], ["access_token", tokens.access_token]] as const) {
        if (!token) continue;
        const body = new URLSearchParams({ token, token_type_hint: hint, ...(tokens.client_id ? { client_id: tokens.client_id } : {}) }).toString();
        const response = await fetch("/mcp/inspector/api/oauth/proxy", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify({ serverUrl: connection.url, url: endpoint, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }),
        });
        if (!response.ok) throw new Error(`Revocation of the ${hint} failed with HTTP ${response.status}`);
        revoked.push(hint);
      }
      connection.clearStorage();
      return { revoked, localStateCleared: true };
    })}
  </div>;
}

export function exportServers(servers: McpServer[], format: "mcp" | "vscode") {
  const configs: Record<string, ServerConfiguration> = {};
  for (const server of servers) {
    if (!server.url) continue;
    let name = server.name || new URL(server.url).host;
    for (let index = 2; name in configs; index++) name = `${server.name}-${index}`;
    configs[name] = { url: server.url };
  }
  return JSON.parse(serializeConfiguration(configs, format)) as unknown;
}
