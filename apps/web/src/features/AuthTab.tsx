import type { McpServer } from "@mcp-use/client/react";
import { useInspector } from "@/client/context/InspectorContext";
import { useInspectorAction } from "./useInspectorAction.js";
import { OAuthDetails, InspectorPage, buttonClass, stringify } from "./OfficialPanels.js";
import { redact } from "./model.js";

export function AuthTab({ connection }: { connection: McpServer }) {
  const { activeTab } = useInspector();
  const { run, cancel, busy, error, result } = useInspectorAction(activeTab === "auth");
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
      title="Auth"
      testId="inspector-auth"
      connection={connection}
      result={result}
      error={error}
      busy={busy}
      cancel={cancel}
    >
      <section aria-labelledby="auth-state-title" className="space-y-3">
        <h3 id="auth-state-title" className="text-lg font-semibold">Authentication state</h3>
        <pre className="overflow-auto rounded-xl border border-border bg-muted/30 p-4 text-sm">
          {stringify(redact({ authorization: connection.authorization, userInfo: connection.userInfo }))}
        </pre>
        <div className="flex flex-wrap gap-2">
          {action("Authenticate", () => connection.authenticate())}
          {action("Fetch user info", () => connection.getUserInfo())}
          {action("Clear OAuth state", () => {
            connection.clearStorage();
            return { cleared: true };
          })}
          {action("Discover protected resource", async (signal) => {
            if (!connection.url) throw new Error("Protected resource discovery requires an HTTP server");
            const target = new URL("/.well-known/oauth-protected-resource", connection.url);
            const response = await fetch("/mcp/inspector/api/proxy", {
              headers: { "X-Target-URL": target.href },
              signal,
            });
            if (!response.ok) {
              throw new Error(`Resource discovery returned HTTP ${response.status}`);
            }
            return response.json();
          })}
        </div>
      </section>
      <section aria-labelledby="auth-discovery-title" className="space-y-3">
        <h3 id="auth-discovery-title" className="text-lg font-semibold">OAuth discovery and tokens</h3>
        <p className="text-sm text-muted-foreground">
          Discover authorization metadata before revoking tokens. Token values remain masked; decoded claims are displayed without exposing the bearer token.
        </p>
        <OAuthDetails
          connection={connection}
          action={action}
        />
      </section>
    </InspectorPage>
  );
}
