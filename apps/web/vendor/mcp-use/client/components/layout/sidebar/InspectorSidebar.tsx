// Modified for the combined Inspector: the RPC Panel switch, theme toggle and Command Palette moved to the header, and the sidebar footer now credits mcp-use.
import { cn } from "@/client/lib/utils";
import type { TabType } from "@/client/context/InspectorContext";
import type { McpServer } from "@mcp-use/client/react";
import { SidebarRail } from "../SidebarRail";
import { InspectorSidebarNav } from "./InspectorSidebarNav";
import { SidebarProximityNav } from "./SidebarProximityNav";

interface InspectorSidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedServer: McpServer;
  visibleTabs?: TabType[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  embedded?: boolean;
}

export function InspectorSidebar({
  activeTab,
  onTabChange,
  selectedServer,
  visibleTabs,
  collapsed,
  onCollapsedChange,
}: InspectorSidebarProps) {
  return (
    <aside
      className={cn(
        "group/sidebar relative hidden lg:flex flex-col shrink-0 text-sidebar-foreground transition-[width] duration-200 ease-out @container/sidebar",
        collapsed ? "w-(--sidebar-width-icon)" : "w-(--sidebar-width)"
      )}
      data-collapsed={collapsed}
      data-collapsible={collapsed ? "icon" : "expanded"}
    >
      <div className="sidebar-nav-scroll flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <SidebarProximityNav
          isActiveKey={(key) => key === activeTab}
          className="pb-2"
        >
          <InspectorSidebarNav
            activeTab={activeTab}
            onTabChange={onTabChange}
            selectedServer={selectedServer}
            visibleTabs={visibleTabs}
            collapsed={collapsed}
          />
        </SidebarProximityNav>
      </div>
      {!collapsed && (
        <footer className="shrink-0 border-t border-sidebar-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          Built on{" "}
          <a
            href="https://github.com/mcp-use/mcp-use"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            mcp-use
          </a>
        </footer>
      )}
      <SidebarRail
        collapsed={collapsed}
        onToggle={() => onCollapsedChange(!collapsed)}
      />
    </aside>
  );
}
