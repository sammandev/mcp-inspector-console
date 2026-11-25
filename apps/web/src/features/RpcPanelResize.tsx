import { GripVerticalIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/client/lib/utils";
import {
  clampRpcPanelWidth,
  readRpcPanelWidth,
  RPC_PANEL_MIN_WIDTH,
  RPC_PANEL_WIDTH_STORAGE_KEY,
} from "./rpcPanelWidth.js";

const KEYBOARD_STEP = 16;

function viewportWidth() {
  return typeof window === "undefined" ? 1600 : window.innerWidth;
}

function storedWidth() {
  try {
    return localStorage.getItem(RPC_PANEL_WIDTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useRpcPanelWidth() {
  const [width, setWidth] = useState(() => readRpcPanelWidth(storedWidth(), viewportWidth()));
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (resizing) return;
    try {
      localStorage.setItem(RPC_PANEL_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Storage can be unavailable (private mode); the width still applies for this session.
    }
  }, [width, resizing]);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampRpcPanelWidth(current, viewportWidth()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const resizeTo = useCallback((next: number) => setWidth(clampRpcPanelWidth(next, viewportWidth())), []);

  return { width, resizing, setResizing, resizeTo };
}

export function RpcPanelResizeHandle({
  width,
  resizing,
  onResizingChange,
  onResize,
}: {
  width: number;
  resizing: boolean;
  onResizingChange: (resizing: boolean) => void;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    onResizingChange(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // The panel sits on the right, so dragging left widens it.
    onResize(drag.current.startWidth + drag.current.startX - event.clientX);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onResizingChange(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowLeft" ? width + KEYBOARD_STEP
        : event.key === "ArrowRight" ? width - KEYBOARD_STEP
          : event.key === "Home" ? RPC_PANEL_MIN_WIDTH
            : event.key === "End" ? Number.POSITIVE_INFINITY
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onResize(next);
  };

  // The 16px gutter keeps the gap before the RPC Panel; the separator overlays the main card's
  // right border (like the vendor ResizableHandle), so that border is the line, not a new one.
  return (
    <div className="relative hidden w-4 shrink-0 lg:block">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize RPC Panel"
        aria-valuenow={width}
        aria-valuemin={RPC_PANEL_MIN_WIDTH}
        tabIndex={0}
        data-slot="resizable-handle"
        data-testid="rpc-panel-resize-handle"
        data-separator={resizing ? "active" : "inactive"}
        data-resizing={resizing || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-y-0 -left-[7px] z-50 w-px box-content px-1.5 cursor-col-resize touch-none select-none",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
          // inset-y-4 keeps the highlight off the card's rounded corners.
          "before:pointer-events-none before:absolute before:inset-y-4 before:left-1.5 before:w-px before:bg-transparent before:transition-[height,width,background-color] before:duration-200 before:ease-out",
          "hover:before:w-0.5 hover:before:bg-foreground/35 dark:hover:before:bg-foreground/45",
          "data-[resizing]:before:w-0.5 data-[resizing]:before:bg-foreground/35 dark:data-[resizing]:before:bg-foreground/45"
        )}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex h-4 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xs border border-zinc-200 bg-background shadow-sm dark:border-zinc-700">
          <GripVerticalIcon className="size-2.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
