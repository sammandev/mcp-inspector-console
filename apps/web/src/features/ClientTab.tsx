import type { McpServer } from "@mcp-use/client/react";
import { Cable } from "lucide-react";
import { useInspector } from "@/client/context/InspectorContext";
import { useState } from "react";
import { parseParameters, parseRoots } from "./model.js";
import { InspectorPage, buttonClass, getSelectedConnector, inputClass, sectionClass, stringify } from "./OfficialPanels.js";
import { useInspectorAction } from "./useInspectorAction.js";

export function ClientTab({ connection }: { connection: McpServer }) {
  const { activeTab } = useInspector();
  const { run, cancel, busy, error, result } = useInspectorAction(activeTab === "client");
  const [roots, setRoots] = useState("[]");
  const [taskId, setTaskId] = useState("");
  const [taskArguments, setTaskArguments] = useState("{}");
  const request = (method: string, params: Record<string, unknown>, signal: AbortSignal) =>
    getSelectedConnector(connection).request(method, params, { signal, timeout: 30_000 });
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
      title="Client"
      icon={Cable}
      testId="inspector-client"
      connection={connection}
      result={result}
      error={error}
      busy={busy}
      cancel={cancel}
    >
      <section aria-labelledby="client-roots-title" className={sectionClass}>
        <h3 id="client-roots-title" className="text-sm font-medium">Roots</h3>
        <label className="block">
          Root directories
          <textarea
            aria-label="Root directories"
            className={`${inputClass} min-h-40 font-mono`}
            value={roots}
            onChange={(event) => setRoots(event.target.value)}
          />
        </label>
        {action("Set roots", async () => {
          const value = parseRoots(roots);
          await getSelectedConnector(connection).setRoots(value);
          return value;
        })}
        <p className="text-xs text-muted-foreground">
          Roots advertise file URIs to the server; they do not grant filesystem access to this browser.
        </p>
      </section>

      <section aria-labelledby="client-tasks-title" className={sectionClass}>
        <h3 id="client-tasks-title" className="text-sm font-medium">Tasks</h3>
        <label className="block">
          Task id
          <input className={inputClass} value={taskId} onChange={(event) => setTaskId(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {action("List tasks", (signal) => request("tasks/list", {}, signal))}
          {["Get task", "Get task result", "Cancel task"].map((label, index) => (
            <span key={label}>
              {action(label, (signal) => {
                if (!taskId.trim()) throw new Error("A task id is required");
                return request(["tasks/get", "tasks/result", "tasks/cancel"][index], { taskId }, signal);
              })}
            </span>
          ))}
        </div>
        <label className="block">
          Task tool arguments
          <textarea
            className={`${inputClass} min-h-32 font-mono`}
            value={taskArguments}
            onChange={(event) => setTaskArguments(event.target.value)}
          />
        </label>
        {action("Run tool as task", (signal) =>
          request("tools/call", parseParameters(taskArguments), signal))}
        <p className="text-xs text-muted-foreground">
          Task methods require server support. Unsupported operations show the server's response without affecting the selected connection.
        </p>
      </section>
    </InspectorPage>
  );
}
