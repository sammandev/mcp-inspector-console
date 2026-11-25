// Modified for the combined Inspector: omit website and community promotion commands, add Open in OpenCode, and list inspector menus, their features, and theme/RPC Panel toggles.
import type { Prompt, Resource, Tool } from "@mcp-use/client/react";
import {
  BrushCleaning,
  ExternalLink,
  FileText,
  History,
  MessageSquare,
  Moon,
  PanelRight,
  Plus,
  Search,
  Server,
  SunDim,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router";
import { useProximityHover } from "@/client/hooks/use-proximity-hover";
import { spring } from "@/client/lib/springs";
import { shapeMap } from "@/client/lib/shape-context";
import { cn } from "@/client/lib/utils";
import { providerAssetUrl } from "@/client/utils/providerAssets";
import type { SavedRequest } from "./tools/SavedRequestsList";
import type { TabType } from "@/client/context/InspectorContext";
import { useTheme } from "@/client/context/ThemeContext";
import { isInspectorSamplingAvailable } from "@/client/utils/samplingProtocol";
import { getSkillsState } from "./layout/layoutHeaderUtils";
import {
  LAYOUT_TAB_FEATURES,
  LAYOUT_TABS,
  type LayoutTabDef,
} from "./layout/layoutTabs";

import {
  downloadMcpbFile,
  generateClaudeCodeCommand,
  generateCodexConfig,
  generateCursorDeepLink,
  generateGeminiCLICommand,
  generateOpenCodeCommand,
  generateVSCodeDeepLink,
  generateVSCodeInsidersDeepLink,
} from "@/client/utils/mcpClientUtils";
import { copyToClipboard } from "@/client/utils/browser";
import { toast } from "sonner";
import { getServerDisplayName } from "@/client/utils/servers";
import { getServerHeaders } from "@/client/utils/connectionUpdates";
import { ServerIcon } from "./ServerIcon";
import { VSCodeIcon } from "./ui/client-icons";

interface CommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tools: Tool[];
  prompts: Prompt[];
  resources: Resource[];
  savedRequests: SavedRequest[];
  connections: any[];
  selectedServer?: any;
  tunnelUrl?: string | null;
  onNavigate: (
    tab: "tools" | "prompts" | "resources",
    itemName?: string,
    serverId?: string
  ) => void;
  onServerSelect: (serverId: string) => void;
  onTabNavigate?: (tab: TabType, sectionId?: string) => void;
  visibleTabs?: TabType[];
  rpcPanelOpen?: boolean;
  onRpcPanelOpenChange?: (open: boolean) => void;
}

interface CommandItem {
  id: string;
  name: string;
  description?: string;
  type: "tool" | "prompt" | "resource" | "saved-request" | "global" | "menu";
  category: string;
  metadata?: any;
  action?: () => void;
}

/**
 * Renders a searchable command palette for navigating, selecting servers, and executing global or item-specific actions.
 *
 * @param isOpen - Whether the palette dialog is open
 * @param onOpenChange - Callback invoked when the dialog open state changes
 * @param tools - Array of available tools shown in the palette
 * @param prompts - Array of available prompts shown in the palette
 * @param resources - Array of available resources shown in the palette
 * @param savedRequests - Array of saved requests shown in the palette
 * @param connections - Array of server connection entries used to build server items and badges
 * @param selectedServer - Optional currently selected server; when provided, enables "Open in Client" actions
 * @param tunnelUrl - Optional tunnel base URL used to derive server URL for deep links and configs
 * @param onNavigate - Callback to navigate to a specific tab and optionally focus an item and server
 * @param onServerSelect - Callback invoked when a server entry is selected
 * @returns The Command Palette React element
 */
export function CommandPalette({
  isOpen,
  onOpenChange,
  tools,
  prompts,
  resources,
  savedRequests,
  connections,
  selectedServer,
  tunnelUrl,
  onNavigate,
  onServerSelect,
  onTabNavigate,
  visibleTabs,
  rpcPanelOpen,
  onRpcPanelOpenChange,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const { resolvedTheme, setTheme, forced: themeForced } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const shape = shapeMap.pill;
  const {
    activeIndex: hoverIndex,
    itemRects,
    sessionRef,
    handlers,
    registerItem,
    measureItems,
  } = useProximityHover(listRef);

  // Get server URL for "Open in..." commands
  const serverUrl = selectedServer
    ? tunnelUrl
      ? `${tunnelUrl}/mcp`
      : selectedServer.url
    : null;
  const serverName = selectedServer?.name || "MCP Server";
  const serverHeaders = selectedServer
    ? getServerHeaders(selectedServer)
    : undefined;

  // Create "Open in..." command items
  const openInItems: CommandItem[] = selectedServer
    ? [
        {
          id: "open-in-cursor",
          name: "Open in Cursor",
          description: "Add this server to Cursor",
          type: "global",
          category: "Open in Client",
          action: () => {
            try {
              const deepLink = generateCursorDeepLink(
                serverUrl!,
                serverName,
                serverHeaders
              );
              window.location.href = deepLink;
              toast.success("Opening in Cursor...");
              onOpenChange(false);
            } catch (error) {
              toast.error("Failed to open in Cursor");
            }
          },
        },
        {
          id: "open-in-claude-code",
          name: "Open in Claude Code",
          description: "Add this server to Claude Code CLI",
          type: "global",
          category: "Open in Client",
          action: () => {
            const { command } = generateClaudeCodeCommand(
              serverUrl!,
              serverName,
              serverHeaders
            );
            copyToClipboard(command);
            toast.success("Command copied to clipboard");
            onOpenChange(false);
          },
        },
        {
          id: "open-in-claude-desktop",
          name: "Open in Claude Desktop",
          description: "Download .mcpb configuration file",
          type: "global",
          category: "Open in Client",
          action: () => {
            try {
              downloadMcpbFile(serverUrl!, serverName, serverHeaders);
              toast.success("Downloaded .mcpb file");
              onOpenChange(false);
            } catch (error) {
              toast.error("Failed to download configuration file");
            }
          },
        },
        {
          id: "open-in-vscode",
          name: "Open in VS Code",
          description: "Add this server to VS Code",
          type: "global",
          category: "Open in Client",
          action: () => {
            try {
              const deepLink = generateVSCodeDeepLink(
                serverUrl!,
                serverName,
                serverHeaders
              );
              window.location.href = deepLink;
              toast.success("Opening in VS Code...");
              onOpenChange(false);
            } catch (error) {
              toast.error("Failed to open in VS Code");
            }
          },
        },
        {
          id: "open-in-vscode-insiders",
          name: "Open in VS Code Insiders",
          description: "Add this server to VS Code Insiders",
          type: "global",
          category: "Open in Client",
          action: () => {
            try {
              const deepLink = generateVSCodeInsidersDeepLink(
                serverUrl!,
                serverName,
                serverHeaders
              );
              window.location.href = deepLink;
              toast.success("Opening in VS Code Insiders...");
              onOpenChange(false);
            } catch (error) {
              toast.error("Failed to open in VS Code Insiders");
            }
          },
        },
        {
          id: "open-in-gemini",
          name: "Open in Gemini CLI",
          description: "Add this server to Gemini CLI",
          type: "global",
          category: "Open in Client",
          action: () => {
            const { command } = generateGeminiCLICommand(
              serverUrl!,
              serverName,
              serverHeaders
            );
            copyToClipboard(command);
            toast.success("Command copied to clipboard");
            onOpenChange(false);
          },
        },
        {
          id: "open-in-codex",
          name: "Open in Codex CLI",
          description: "Add this server to Codex CLI",
          type: "global",
          category: "Open in Client",
          action: () => {
            const { config } = generateCodexConfig(
              serverUrl!,
              serverName,
              serverHeaders
            );
            copyToClipboard(config);
            toast.success("Config copied to clipboard");
            onOpenChange(false);
          },
        },
        {
          id: "open-in-opencode",
          name: "Open in OpenCode",
          description: "Add this server to OpenCode",
          type: "global",
          category: "Open in Client",
          action: () => {
            const { command } = generateOpenCodeCommand(
              serverUrl!,
              serverName,
              serverHeaders
            );
            copyToClipboard(command);
            toast.success("Command copied to clipboard");
            onOpenChange(false);
          },
        },
      ]
    : [];

  // Create global command items
  const globalItems: CommandItem[] = [
    {
      id: "connect-server",
      name: "Connect Server",
      description: "Add a new MCP server connection",
      type: "global",
      category: "Navigation",
      action: () => navigate("/"),
    },
    {
      id: "mcp-use-docs",
      name: "How to Create an MCP Server",
      description: "Step-by-step guide to building MCP servers",
      type: "global",
      category: "Documentation",
      action: () => window.open("https://mcp-use.com/docs", "_blank"),
    },
    {
      id: "mcp-docs",
      name: "MCP Official Documentation",
      description: "Learn about the Model Context Protocol",
      type: "global",
      category: "Documentation",
      action: () =>
        window.open(
          "https://modelcontextprotocol.io/docs/getting-started/intro",
          "_blank"
        ),
    },
    {
      id: "clear-localstorage",
      name: "Clear localStorage & Reload",
      description:
        "Having trouble connecting? Clear stored auth data and refresh",
      type: "global",
      category: "Troubleshooting",
      action: () => {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith("mcp:auth") || key.startsWith("mcp-inspector"))
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        toast.success(
          `Cleared ${keysToRemove.length} localStorage item(s). Refreshing page...`,
          { duration: 2000 }
        );
        setTimeout(() => {
          window.location.reload();
        }, 500);
        onOpenChange(false);
      },
    },
  ];

  // Create menu, menu feature, and preference items
  const isMenuAvailable = (tabId: TabType) => {
    if (visibleTabs && !visibleTabs.includes(tabId)) return false;
    if (tabId === "sampling") return isInspectorSamplingAvailable(selectedServer);
    if (tabId === "skills") return getSkillsState(selectedServer) === "available";
    return true;
  };
  const menuTabs =
    selectedServer && onTabNavigate
      ? LAYOUT_TABS.filter(
          (tab): tab is Extract<LayoutTabDef, { label: string }> =>
            tab.id !== "separator" && isMenuAvailable(tab.id)
        )
      : [];
  const menuItems: CommandItem[] = menuTabs.map((tab) => ({
    id: `menu-${tab.id}`,
    name: tab.label,
    description: `Go to ${tab.label}`,
    type: "menu",
    category: "Menus",
    metadata: { icon: tab.icon },
    action: () => onTabNavigate?.(tab.id),
  }));
  const featureItems: CommandItem[] = menuTabs.flatMap((tab) =>
    (LAYOUT_TAB_FEATURES[tab.id] ?? []).map((feature) => ({
      id: `feature-${feature.sectionId}`,
      name: `${tab.label} › ${feature.label}`,
      description: feature.keywords,
      type: "menu" as const,
      category: `Features - ${tab.label}`,
      metadata: { icon: tab.icon },
      action: () => onTabNavigate?.(tab.id, feature.sectionId),
    }))
  );
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const preferenceItems: CommandItem[] = [
    ...(themeForced
      ? []
      : [
          {
            id: "toggle-theme",
            name: `Switch to ${nextTheme} theme`,
            description: "Toggle light and dark appearance",
            type: "menu" as const,
            category: "Preferences",
            metadata: { icon: nextTheme === "dark" ? Moon : SunDim },
            action: () => setTheme(nextTheme),
          },
        ]),
    ...(onRpcPanelOpenChange
      ? [
          {
            id: "toggle-rpc-panel",
            name: rpcPanelOpen ? "Hide RPC Panel" : "Show RPC Panel",
            description: "Toggle the JSON-RPC protocol and network logs",
            type: "menu" as const,
            category: "Preferences",
            metadata: { icon: PanelRight },
            action: () => onRpcPanelOpenChange(!rpcPanelOpen),
          },
        ]
      : []),
  ];

  // Create server selection items
  const serverItems: CommandItem[] = connections.map((connection) => ({
    id: `server-${connection.id}`,
    name: getServerDisplayName(connection),
    description: `Connected server (${connection.state})`,
    type: "global",
    category: "Connected Servers",
    metadata: { serverId: connection.id, state: connection.state },
    action: () => onServerSelect(connection.id),
  }));

  // Create unified command items
  const commandItems: CommandItem[] = [
    ...menuItems,
    ...featureItems,
    ...preferenceItems,
    ...globalItems,
    ...openInItems,
    ...serverItems,
    ...tools.map((tool) => ({
      id: `tool-${tool.name}`,
      name: tool.name,
      description: tool.description,
      type: "tool" as const,
      category: (tool as any)._serverName
        ? `Tools - ${(tool as any)._serverName}`
        : "Tools",
      metadata: {
        inputSchema: tool.inputSchema,
        serverId: (tool as any)._serverId,
        serverName: (tool as any)._serverName,
      },
    })),
    ...prompts.map((prompt) => ({
      id: `prompt-${prompt.name}`,
      name: prompt.name,
      description: prompt.description,
      type: "prompt" as const,
      category: (prompt as any)._serverName
        ? `Prompts - ${(prompt as any)._serverName}`
        : "Prompts",
      metadata: {
        arguments: prompt.arguments,
        serverId: (prompt as any)._serverId,
        serverName: (prompt as any)._serverName,
      },
    })),
    ...resources.map((resource) => ({
      id: `resource-${resource.uri}`,
      name: resource.name,
      description: resource.description,
      type: "resource" as const,
      category: (resource as any)._serverName
        ? `Resources - ${(resource as any)._serverName}`
        : "Resources",
      metadata: {
        uri: resource.uri,
        mimeType: resource.mimeType,
        serverId: (resource as any)._serverId,
        serverName: (resource as any)._serverName,
      },
    })),
    ...savedRequests.map((request) => ({
      id: `saved-${request.id}`,
      name: request.name,
      description: `Saved request for ${request.toolName}`,
      type: "saved-request" as const,
      category: "Saved Requests",
      metadata: {
        toolName: request.toolName,
        args: request.args,
        savedAt: request.savedAt,
        serverId: request.serverId,
        serverName: request.serverName,
      },
    })),
  ];

  const filteredItems = commandItems.filter((item) => {
    if (!search.trim()) return true;
    const haystack =
      `${item.name} ${item.description || ""} ${item.category}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const handleSelect = useCallback(
    (item: CommandItem) => {
      console.warn("[CommandPalette] Item selected:", {
        itemType: item.type,
        itemName: item.name,
        itemId: item.id,
        metadata: item.metadata,
      });

      if (item.action) {
        console.warn("[CommandPalette] Executing action for global item");
        item.action();
        onOpenChange(false);
      } else if (item.type === "global") {
        // Handle server selection
        if (item.metadata?.serverId) {
          console.warn(
            "[CommandPalette] Selecting server:",
            item.metadata.serverId
          );
          onServerSelect(item.metadata.serverId);
          onOpenChange(false);
        }
      } else {
        // Navigate to the item's tab and server in one atomic operation
        // For resources, use URI instead of name
        const itemIdentifier =
          item.type === "resource" ? item.metadata?.uri : item.name;

        // Convert singular type to plural tab name
        const tabName =
          item.type === "tool"
            ? "tools"
            : item.type === "prompt"
              ? "prompts"
              : item.type === "saved-request"
                ? "tools" // Navigate to tools tab for saved requests
                : ("resources" as const);

        console.warn("[CommandPalette] Navigating to item:", {
          tab: tabName,
          itemIdentifier,
          serverId: item.metadata?.serverId,
        });
        onNavigate(tabName, itemIdentifier, item.metadata?.serverId);
        onOpenChange(false);
      }
    },
    [onNavigate, onOpenChange, onServerSelect]
  );

  const getIcon = (
    type: string,
    category?: string,
    itemName?: string,
    MenuIcon?: LucideIcon
  ) => {
    switch (type) {
      case "menu":
        return (
          <div className="bg-muted rounded-full p-2 flex items-center justify-center shrink-0">
            {MenuIcon ? (
              <MenuIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        );
      case "tool":
        return (
          <div className="bg-blue-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-blue-500" />
          </div>
        );
      case "prompt":
        return (
          <div className="bg-purple-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
            <MessageSquare className="h-4 w-4 text-purple-500" />
          </div>
        );
      case "resource":
        return (
          <div className="bg-green-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-green-500" />
          </div>
        );
      case "saved-request":
        return (
          <div className="bg-orange-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
            <History className="h-4 w-4 text-orange-500" />
          </div>
        );
      case "global":
        if (category === "Navigation") {
          return (
            <div className="bg-gray-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </div>
          );
        }
        if (category === "Open in Client") {
          // Determine which client icon to show based on item name
          if (itemName?.includes("Cursor")) {
            return (
              <div className="bg-gray-200 dark:bg-gray-800 rounded-full p-2 flex items-center justify-center shrink-0">
                <img
                  src="https://cdn.simpleicons.org/cursor"
                  alt="Cursor"
                  className="h-4 w-4"
                />
              </div>
            );
          }
          if (
            itemName?.includes("Claude Code") ||
            itemName?.includes("Claude Desktop")
          ) {
            return (
              <div className="bg-orange-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
                <img
                  src="https://cdn.simpleicons.org/claude"
                  alt="Claude"
                  className="h-4 w-4"
                />
              </div>
            );
          }
          if (itemName?.includes("VS Code")) {
            return (
              <div className="bg-blue-600/20 rounded-full p-2 flex items-center justify-center shrink-0">
                <VSCodeIcon className="h-4 w-4 text-blue-600" />
              </div>
            );
          }
          if (itemName?.includes("Gemini")) {
            return (
              <div className="bg-purple-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
                <img
                  src="https://cdn.simpleicons.org/googlegemini"
                  alt="Gemini"
                  className="h-4 w-4"
                />
              </div>
            );
          }
          if (itemName?.includes("Codex")) {
            return (
              <div className="bg-green-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
                <img
                  src={providerAssetUrl("openai.png")}
                  alt="Codex"
                  className="h-4 w-4"
                />
              </div>
            );
          }
          if (itemName?.includes("OpenCode")) {
            return (
              <div className="bg-muted rounded-full p-2 flex items-center justify-center shrink-0">
                <img
                  src="https://cdn.simpleicons.org/opencode"
                  alt="OpenCode"
                  className="h-4 w-4 dark:invert"
                />
              </div>
            );
          }
        }
        if (category === "Documentation") {
          return (
            <div className="bg-orange-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
              <ExternalLink className="h-4 w-4 text-orange-500" />
            </div>
          );
        }
        if (category === "Troubleshooting") {
          return (
            <div className="bg-yellow-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
              <BrushCleaning className="h-4 w-4 text-yellow-500" />
            </div>
          );
        }
        if (category === "Connected Servers") {
          // For connected servers, we need to find the actual server object from metadata.serverId
          // Since we don't have access to it here, just show a generic server icon
          return (
            <div className="bg-cyan-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
              <Server className="h-4 w-4 text-cyan-500" />
            </div>
          );
        }
        return (
          <div className="bg-gray-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
            <ExternalLink className="h-4 w-4 text-gray-500" />
          </div>
        );
      default:
        return (
          <div className="bg-gray-500/20 rounded-full p-2 flex items-center justify-center shrink-0">
            <Search className="h-4 w-4 text-gray-500" />
          </div>
        );
    }
  };

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll to top and clamp selection when search changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    if (activeIndex >= filteredItems.length) {
      setActiveIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [activeIndex, filteredItems.length]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    measureItems();
  }, [isOpen, measureItems, filteredItems]);

  const checkedRect = itemRects[activeIndex] ?? null;
  const hoverRect = hoverIndex !== null ? itemRects[hoverIndex] : null;
  const isHoveringOther = hoverIndex !== null && hoverIndex !== activeIndex;

  if (!isOpen) return null;

  const onPaletteKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && filteredItems[activeIndex]) {
      event.preventDefault();
      handleSelect(filteredItems[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        aria-label="Close command palette"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-label="Command Palette"
        data-testid="command-palette-dialog"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] max-w-[640px] w-[calc(100vw-2rem)] sm:w-full p-2 bg-white dark:bg-zinc-900/90 backdrop-blur-xl rounded-xl overflow-hidden border border-border shadow-[var(--cmdk-shadow)] transition-transform duration-100 ease-out outline-none"
        onKeyDown={onPaletteKeyDown}
      >
        <input
          ref={inputRef}
          placeholder="What do you need?"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none w-full text-[17px] px-4 pt-2 pb-4 outline-none bg-transparent text-foreground border-b border-border mb-0 rounded-none placeholder:text-muted-foreground"
          data-testid="command-palette-input"
        />
        <div
          ref={listRef}
          onMouseEnter={handlers.onMouseEnter}
          onMouseMove={handlers.onMouseMove}
          onMouseLeave={handlers.onMouseLeave}
          className="relative isolate min-h-[200px] sm:min-h-[330px] max-h-[400px] overflow-auto overscroll-contain transition-[height] duration-100 ease-out px-1"
          data-testid="command-palette-list"
        >
          <AnimatePresence>
            {checkedRect && (
              <motion.div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute bg-active",
                  shape.bg
                )}
                initial={false}
                animate={{
                  top: checkedRect.top,
                  left: checkedRect.left,
                  width: checkedRect.width,
                  height: checkedRect.height,
                  opacity: isHoveringOther ? 0.8 : 1,
                }}
                exit={{ opacity: 0, transition: spring.moderate.exit }}
                transition={{
                  ...spring.moderate,
                  opacity: { duration: 0.08 },
                }}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {hoverRect && (
              <motion.div
                key={sessionRef.current}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute bg-hover",
                  shape.bg
                )}
                initial={{
                  opacity: 0,
                  top: checkedRect?.top ?? hoverRect.top,
                  left: checkedRect?.left ?? hoverRect.left,
                  width: checkedRect?.width ?? hoverRect.width,
                  height: checkedRect?.height ?? hoverRect.height,
                }}
                animate={{
                  opacity: 1,
                  top: hoverRect.top,
                  left: hoverRect.left,
                  width: hoverRect.width,
                  height: hoverRect.height,
                }}
                exit={{ opacity: 0, transition: spring.fast.exit }}
                transition={{
                  ...spring.fast,
                  opacity: { duration: 0.08 },
                }}
              />
            )}
          </AnimatePresence>
          {filteredItems.length === 0 ? (
            <div className="text-sm flex items-center justify-center h-12 whitespace-pre-wrap text-muted-foreground">
              No results found.
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                ref={(el) => registerItem(index, el)}
                type="button"
                data-testid={`command-palette-item-${item.id}`}
                data-proximity-index={index}
                onClick={() => handleSelect(item)}
                className="[content-visibility:auto] relative z-10 cursor-pointer h-12 text-sm flex items-center gap-3 px-3 text-foreground select-none w-full text-left mt-1 first:mt-0"
              >
                {getIcon(item.type, item.category, item.name, item.metadata?.icon)}
                <span className="font-medium truncate flex-1 min-w-0">
                  {item.name}
                </span>
                {(() => {
                  const serverId = item.metadata?.serverId;
                  if (!serverId || item.category === "Connected Servers") {
                    return null;
                  }
                  const server = connections.find((c) => c.id === serverId);
                  if (!server) return null;
                  return (
                    <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                      <ServerIcon server={server} size="xs" />
                      <span className="text-xs truncate max-w-[9rem]">
                        {getServerDisplayName(server)}
                      </span>
                    </div>
                  );
                })()}
              </button>
            ))
          )}
        </div>

        {/* Keyboard Shortcuts Footer */}
        <div className="border-t border-border px-4 py-3 pb-1 flex items-center justify-between text-xs text-muted-foreground ">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 font-mono font-medium rounded shadow-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground leading-none">
                t
              </span>
              <span>Tools</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 font-mono font-medium rounded shadow-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground leading-none">
                p
              </span>
              <span>Prompts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 font-mono font-medium rounded shadow-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground leading-none">
                r
              </span>
              <span>Resources</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 font-mono font-medium rounded shadow-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground leading-none">
                c
              </span>
              <span>Chat</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 font-mono font-medium rounded shadow-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground leading-none">
                h
              </span>
              <span>Home</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center px-2 h-5 font-mono text-[10px] font-medium rounded shadow-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground leading-none">
                esc
              </span>
              <span>Close</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
