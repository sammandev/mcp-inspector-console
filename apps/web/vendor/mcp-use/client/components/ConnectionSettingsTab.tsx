// Modified for the combined Inspector: expose transport diagnostics in native connection settings.
import { useConnectionFormState } from "@/client/hooks/useConnectionFormState";
import type { EditableConnectionConfig } from "@/client/utils/connectionUpdates";
import { getStoredConnectionConfig } from "@/client/utils/connectionUpdates";
import type { McpServer } from "@mcp-use/client/react";
import {
  inspectorStickyTabHeaderClass,
  inspectorTabHeaderPadding,
  inspectorTabTitleClass,
} from "@/client/lib/font-weight";
import { inspectorSettingsContentClass } from "@/client/lib/inspector-settings-layout";
import { ConnectionSettingsForm } from "./ConnectionSettingsForm";
import { tabHeaderIconClass } from "./shared/ListTabHeader";
import { Settings } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useEffect, useState } from "react";
import { networkStore } from "../../../../src/features/network.js";

interface ConnectionSettingsTabProps {
  connection: McpServer;
  onSave: (config: EditableConnectionConfig) => void | Promise<void>;
}

export function ConnectionSettingsTab({
  connection,
  onSave,
}: ConnectionSettingsTabProps) {
  const form = useConnectionFormState(connection, true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [connectionTimeout, setConnectionTimeout] = useState("30000");
  const [networkLogSize, setNetworkLogSize] = useState(String(networkStore.limit(connection.url)));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const stored = getStoredConnectionConfig<EditableConnectionConfig>(connection.id);
    setConnectionTimeout(String(stored?.connectionTimeout ?? 30_000));
    const storedLogSize = stored?.networkLogSize;
    if (
      typeof storedLogSize === "number" &&
      Number.isInteger(storedLogSize) &&
      storedLogSize >= 1 &&
      storedLogSize <= 10_000
    ) {
      networkStore.setLimit(storedLogSize, connection.url);
      setNetworkLogSize(String(storedLogSize));
    } else {
      const currentLimit = networkStore.limit(connection.url);
      networkStore.setLimit(currentLimit, connection.url);
      setNetworkLogSize(String(currentLimit));
      if (storedLogSize !== undefined) {
        setSaveError("Stored network log size must be between 1 and 10000");
      }
    }
  }, [connection.id]);

  const handleSave = async () => {
    const config = form.buildConfig();
    if (!config) return;
    setSaveError("");
    setSaveStatus("");
    const timeout = Number(connectionTimeout);
    const logSize = Number(networkLogSize);
    if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 600_000) {
      setSaveError("Connection timeout must be between 1000 and 600000 ms");
      return;
    }
    if (!Number.isInteger(logSize) || logSize < 1 || logSize > 10_000) {
      setSaveError("Network log size must be between 1 and 10000");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ ...config, connectionTimeout: timeout, networkLogSize: logSize });
      networkStore.setLimit(logSize, config.url);
      setSaveStatus("Connection settings saved");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="h-full overflow-y-auto overscroll-none"
      onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 0)}
    >
      <div
        className={`${inspectorStickyTabHeaderClass(isScrolled)} flex flex-row items-center justify-between gap-2 ${inspectorTabHeaderPadding}`}
      >
        <h2 className={`${inspectorTabTitleClass} flex items-center gap-1.5`}>
          <Settings className={tabHeaderIconClass} aria-hidden />
          Connection Settings
        </h2>
        <Button
          data-testid="connection-form-save-button"
          size="sm"
          disabled={isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className={inspectorSettingsContentClass}>
        <ConnectionSettingsForm
          alias={form.alias}
          setAlias={form.setAlias}
          url={form.url}
          setUrl={form.setUrl}
          connectionMode={form.connectionMode}
          setConnectionMode={form.setConnectionMode}
          protocolMode={form.protocolMode}
          setProtocolMode={form.setProtocolMode}
          customHeaders={form.customHeaders}
          setCustomHeaders={form.setCustomHeaders}
          requestTimeout={form.requestTimeout}
          setRequestTimeout={form.setRequestTimeout}
          resetTimeoutOnProgress={form.resetTimeoutOnProgress}
          setResetTimeoutOnProgress={form.setResetTimeoutOnProgress}
          maxTotalTimeout={form.maxTotalTimeout}
          setMaxTotalTimeout={form.setMaxTotalTimeout}
          proxyAddress={form.proxyAddress}
          setProxyAddress={form.setProxyAddress}
          clientId={form.clientId}
          setClientId={form.setClientId}
          clientSecret={form.clientSecret}
          setClientSecret={form.setClientSecret}
          scope={form.scope}
          setScope={form.setScope}
          showConnectButton={false}
          showExportButton={false}
          inlineSections
          cardSections
        />
        <section id="connection-settings-diagnostics" className="scroll-mt-20 space-y-4 rounded-xl border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Connection diagnostics settings</h3>
            <p className="text-xs text-muted-foreground">
              These settings apply to the selected connection and its captured network history.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="connection-timeout">Connection timeout (ms)</Label>
              <Input
                id="connection-timeout"
                aria-label="Connection timeout (ms)"
                type="number"
                min={1_000}
                max={600_000}
                value={connectionTimeout}
                onChange={(event) => setConnectionTimeout(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-log-size">Network log size</Label>
              <Input
                id="network-log-size"
                aria-label="Network log size"
                type="number"
                min={1}
                max={10_000}
                value={networkLogSize}
                onChange={(event) => setNetworkLogSize(event.target.value)}
              />
            </div>
          </div>
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          {saveStatus && <p role="status" className="text-sm text-muted-foreground">{saveStatus}</p>}
        </section>
      </div>
    </div>
  );
}
