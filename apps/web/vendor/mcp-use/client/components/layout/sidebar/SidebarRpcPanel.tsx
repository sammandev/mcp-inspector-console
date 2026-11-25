// Modified for the combined Inspector: the panel width is user-resizable and disables its width transition while dragging.
import { JsonRpcLoggerView } from "@/client/components/logging/JsonRpcLoggerView";
import { cn } from "@/client/lib/utils";
import type { CSSProperties } from "react";

export function SidebarRpcPanel({
  serverId,
  open,
  width,
  resizing = false,
}: {
  serverId: string;
  open: boolean;
  width?: number;
  resizing?: boolean;
}) {
  return (
    <aside
      aria-label="RPC Panel"
      aria-hidden={!open}
      style={width === undefined ? undefined : ({ "--rpc-panel-width": `${width}px` } as CSSProperties)}
      className={cn(
        "relative hidden min-h-0 shrink-0 flex-col overflow-hidden lg:flex",
        !resizing && "transition-[width,margin] duration-200 ease-out",
        open ? "w-(--rpc-panel-width) lg:mr-[18px]" : "w-0 lg:mr-0"
      )}
    >
      <div
        className={cn(
          "flex h-full min-h-0 w-(--rpc-panel-width) flex-col transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <JsonRpcLoggerView serverIds={[serverId]} />
      </div>
    </aside>
  );
}
