// Modified for the combined Inspector: removed the GitHub, Discord, and manufact.com shortcuts.
import { JsonRpcLoggerView } from "@/client/components/logging/JsonRpcLoggerView";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/client/components/ui/sheet";
import { cn } from "@/client/lib/utils";
import { ScrollText } from "lucide-react";
import { createPortal } from "react-dom";
import { useIsLgUp } from "../useTunnelPopoverOpen";

const toolbarItemClass =
  "flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:text-foreground";

interface MobileInspectorToolbarProps {
  serverId?: string;
  rpcLoggerOpen: boolean;
  onRpcLoggerOpenChange: (open: boolean) => void;
}

export function MobileInspectorToolbar({
  serverId,
  rpcLoggerOpen,
  onRpcLoggerOpenChange,
}: MobileInspectorToolbarProps) {
  const isLgUp = useIsLgUp();

  return (
    <>
      {typeof document !== "undefined" &&
        createPortal(
          <nav
            aria-label="Inspector shortcuts"
            className="fixed inset-x-0 bottom-0 z-[100] flex items-center bg-transparent px-4 pt-(--mobile-chrome-gap) pb-[calc(var(--mobile-chrome-gap)+env(safe-area-inset-bottom))] lg:hidden"
          >
            <button
              type="button"
              onClick={() => onRpcLoggerOpenChange(!rpcLoggerOpen)}
              className={cn(
                toolbarItemClass,
                rpcLoggerOpen && "text-foreground"
              )}
              aria-label="RPC logs"
              aria-pressed={rpcLoggerOpen}
            >
              <ScrollText className="size-4 shrink-0" />
            </button>
          </nav>,
          document.body
        )}

      {!isLgUp && (
        <Sheet open={rpcLoggerOpen} onOpenChange={onRpcLoggerOpenChange}>
          <SheetContent
            side="bottom"
            className="z-[101] flex h-[min(85dvh,720px)] flex-col gap-0 rounded-t-2xl border-zinc-200 p-0 dark:border-zinc-700"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>RPC logs</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1">
              <JsonRpcLoggerView
                serverIds={serverId ? [serverId] : undefined}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
