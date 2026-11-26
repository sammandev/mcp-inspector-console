// Modified for the combined Inspector: removed the manufact.com Deploy call to action, added the RPC Panel switch and a light/dark theme toggle beside Sign in, and a search box that opens the Command Palette.
import { Button } from "@/client/components/ui/button";
import { Switch } from "@/client/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import type { TabType } from "@/client/context/InspectorContext";
import { useInspector } from "@/client/context/InspectorContext";
import { cn } from "@/client/lib/utils";
import { getServerHeaders } from "@/client/utils/connectionUpdates";
import {
  getServerDisplayName,
  isLocalhostServerUrl,
} from "@/client/utils/servers";
import { getBasePath } from "@/client/utils/basePath";
import {
  isInspectorSamplingAvailable,
  STATELESS_SAMPLING_UNSUPPORTED_MESSAGE,
} from "@/client/utils/samplingProtocol";
import { ChevronDown, CircleAlert, Plus } from "lucide-react";
import type { McpServer } from "@mcp-use/client/react";
import { useState } from "react";
import { toast } from "sonner";
import { HostedUserMenu } from "@/client/components/HostedUserMenu";
import { AccountMenu } from "../../../../src/accounts/AccountMenu.js";
import { useOptionalAccount } from "../../../../src/accounts/AccountProvider.js";
import { TabCountBadge } from "./shared/TabCountBadge";
import { AddToClientDropdown } from "./AddToClientDropdown";
import LogoAnimated from "./LogoAnimated";
import { ServerDropdown } from "./ServerDropdown";
import {
  getSkillsAccessibleLabel,
  getSkillsState,
  getTabCount,
  isMcpUseTunnelUrl,
  SKILLS_EMPTY_CATALOG_MESSAGE,
  SKILLS_UNSUPPORTED_MESSAGE,
} from "./layout/layoutHeaderUtils";

const rpcSwitchUncheckedTrack =
  "color-mix(in oklab, var(--foreground) 22%, var(--background))";
const rpcSwitchUncheckedTrackHover =
  "color-mix(in oklab, var(--foreground) 30%, var(--background))";
import { getInspectorHeaderClassName } from "./layout/inspectorLayoutClasses";
import { HeaderCommandSearch } from "../../../../src/features/HeaderCommandSearch.js";
import { HeaderThemeToggle } from "../../../../src/features/HeaderThemeToggle.js";
import { LAYOUT_TABS } from "./layout/layoutTabs";
import { ServerUrlChip } from "./layout/ServerUrlChip";
import { TunnelStartButton } from "./layout/TunnelBadge";
import { useTunnelControls } from "./layout/useTunnelControls";
import { useTunnelPopoverOpen } from "./layout/useTunnelPopoverOpen";

interface LayoutHeaderProps {
  connections: McpServer[];
  selectedServer: McpServer | undefined;
  activeTab: string;
  onServerSelect: (serverId: string) => void;
  onTabChange: (tab: TabType) => void;
  embedded?: boolean;
  sidebarCollapsed?: boolean;
  rpcLoggerOpen?: boolean;
  onRpcLoggerOpenChange?: (open: boolean) => void;
  onCommandPaletteOpen?: () => void;
}

export function LayoutHeader({
  connections,
  selectedServer,
  activeTab,
  onServerSelect,
  onTabChange,
  embedded = false,
  sidebarCollapsed = false,
  rpcLoggerOpen = false,
  onRpcLoggerOpenChange,
  onCommandPaletteOpen,
}: LayoutHeaderProps) {
  const {
    tunnelUrl,
    isTunnelStarting,
    setTunnelUrl,
    setIsTunnelStarting,
    embeddedConfig,
  } = useInspector();
  const [mobileTabsCollapsed] = useState(true);
  const account = useOptionalAccount();

  const tunnelPopover = useTunnelPopoverOpen(tunnelUrl);

  const tunnel = useTunnelControls({
    tunnelUrl,
    setTunnelUrl,
    setIsTunnelStarting,
    onTunnelStarted: tunnelPopover.openWithAutoCopy,
  });

  if (embeddedConfig.singleTab) {
    return null;
  }

  const filteredTabs = embeddedConfig.visibleTabs
    ? LAYOUT_TABS.filter(
        (t) =>
          t.id === "separator" ||
          embeddedConfig.visibleTabs!.includes(t.id as TabType)
      )
    : LAYOUT_TABS;

  const onServerRoute = !!selectedServer;

  const showTunnelBadge =
    !!selectedServer &&
    (isLocalhostServerUrl(selectedServer.url ?? "") ||
      isMcpUseTunnelUrl(selectedServer.url ?? "") ||
      !!tunnelUrl);

  const serverUrl = selectedServer
    ? tunnelUrl
      ? `${tunnelUrl.replace(/\/+$/, "")}${getBasePath()}`
      : (selectedServer.url ?? "")
    : "";

  const displayMcpUrl =
    tunnel.mcpUrl ??
    (tunnelUrl ? `${tunnelUrl.replace(/\/+$/, "")}${getBasePath()}` : null);

  const renderUrlCluster = (
    row: "desktop" | "mobile",
    chipClassName?: string
  ) => {
    if (!selectedServer || !serverUrl) return null;
    const rowVisible =
      row === "desktop" ? tunnelPopover.isLgUp : !tunnelPopover.isLgUp;

    return (
      <div className="flex items-center gap-1 min-w-0">
        <ServerUrlChip
          url={serverUrl}
          className={chipClassName}
          tunnelPopover={
            tunnelUrl && displayMcpUrl && rowVisible
              ? {
                  mcpUrl: displayMcpUrl,
                  onStop: tunnel.handleStopTunnel,
                  open: tunnelPopover.open,
                  onOpenChange: tunnelPopover.onOpenChange,
                  autoCopyOnOpen: tunnelPopover.autoCopyOnOpen,
                }
              : undefined
          }
        />
        {showTunnelBadge && !tunnelUrl && (
          <TunnelStartButton
            devFromCli={tunnel.devFromCli}
            isTunnelStarting={isTunnelStarting}
            onStart={tunnel.handleStartTunnel}
          />
        )}
      </div>
    );
  };

  const renderActionButtons = () => {
    if (embedded) return null;

    return (
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {selectedServer &&
          (() => {
            const displayName = getServerDisplayName(selectedServer);
            return (
              <>
                <AddToClientDropdown
                  serverConfig={{
                    url: serverUrl,
                    name: displayName,
                    headers: getServerHeaders(selectedServer),
                    serverId: selectedServer.id,
                  }}
                  onSuccess={(client: string) =>
                    toast.success(`Opening in ${client}...`)
                  }
                  onError={(error: Error) =>
                    toast.error(`Failed: ${error.message}`)
                  }
                  trigger={
                    <Button
                      variant="ghost"
                      className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-full transition-colors px-3 flex items-center justify-center"
                      aria-label="Add to Client"
                    >
                      <span className="xl:hidden hidden sm:flex items-center gap-1">
                        <Plus className="size-3" />
                        Client
                      </span>
                      <span className="hidden xl:flex items-center gap-1">
                        Add to Client
                        <ChevronDown className="size-3" />
                      </span>
                    </Button>
                  }
                />
              </>
            );
          })()}
        {selectedServer && onRpcLoggerOpenChange && (
          <Switch
            label="RPC Panel"
            checked={rpcLoggerOpen}
            onToggle={() => onRpcLoggerOpenChange(!rpcLoggerOpen)}
            uncheckedTrackColor={rpcSwitchUncheckedTrack}
            uncheckedTrackColorHovered={rpcSwitchUncheckedTrackHover}
            className="shrink-0 flex-row-reverse gap-2 text-sm"
            data-testid="header-rpc-panel-switch"
          />
        )}
        <HeaderThemeToggle />
        {renderLoginButton()}
      </div>
    );
  };

  const renderLoginButton = (compact = false) =>
    account ? <AccountMenu compact={compact} /> : embeddedConfig.chatApiUrl ? (
      <HostedUserMenu
        chatApiUrl={embeddedConfig.chatApiUrl}
        compact={compact}
      />
    ) : null;

  return (
    <header className={getInspectorHeaderClassName(embedded)}>
      <div className="hidden lg:flex h-(--header-height) items-center justify-between gap-3 px-4 md:pl-0 md:pr-6">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!embedded && (
            <>
              <div
                className={cn(
                  "hidden lg:block shrink-0",
                  onServerRoute &&
                    sidebarCollapsed &&
                    "-mr-[calc(var(--sidebar-width-icon)/2-0.625rem)]"
                )}
              >
                <LogoAnimated
                  pinSymbolInIconColumn
                  showLabel={!onServerRoute || !sidebarCollapsed}
                  state={
                    onServerRoute && sidebarCollapsed ? "collapsed" : "expanded"
                  }
                />
              </div>
              <span className="text-sm text-muted-foreground/60 shrink-0 [text-box:trim-both_cap_alphabetic]">
                /
              </span>
              <ServerDropdown
                connections={connections}
                selectedServer={selectedServer}
                onServerSelect={onServerSelect}
                variant="header"
              />
              {renderUrlCluster("desktop")}
            </>
          )}
        </div>
        {!embedded && onCommandPaletteOpen && (
          <HeaderCommandSearch onOpen={onCommandPaletteOpen} />
        )}
        {renderActionButtons()}
      </div>

      <div className="flex lg:hidden min-w-0 w-full flex-col overflow-hidden pt-(--mobile-chrome-gap)">
        <div className="flex min-h-0 items-center gap-2 pb-(--mobile-chrome-gap)">
          {!embedded && (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                <LogoAnimated
                  state="collapsed"
                  showLabel
                  labelParts="inspector"
                  className="shrink-0"
                />
                <span className="shrink-0 px-0.5 text-sm text-muted-foreground/60 [text-box:trim-both_cap_alphabetic]">
                  /
                </span>
                <div className="min-w-0 flex-1">
                  <ServerDropdown
                    connections={connections}
                    selectedServer={selectedServer}
                    onServerSelect={onServerSelect}
                    variant="header"
                    compactHeader
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <HeaderThemeToggle />
                {renderLoginButton(true)}
              </div>
            </>
          )}
        </div>

        {selectedServer && (
          <div className="w-full min-w-0 pb-(--mobile-chrome-gap) lg:hidden">
            <Tabs
              value={activeTab}
              onValueChange={(tab) => onTabChange(tab as TabType)}
              collapsed={mobileTabsCollapsed}
              className="w-full"
            >
              <TabsList className="w-full gap-0 border-0 bg-transparent p-0 [&_[role=tablist]]:justify-between">
                {filteredTabs
                  .filter((tab) => tab.id !== "separator")
                  .map((tab) => {
                    const count = getTabCount(tab.id, selectedServer);
                    const skillsState =
                      tab.id === "skills"
                        ? getSkillsState(selectedServer)
                        : undefined;
                    const isDisabled =
                      (tab.id === "sampling" &&
                        !isInspectorSamplingAvailable(selectedServer)) ||
                      (skillsState !== undefined &&
                        skillsState !== "available");
                    const disabledTooltip =
                      tab.id === "skills"
                        ? skillsState === "empty"
                          ? SKILLS_EMPTY_CATALOG_MESSAGE
                          : SKILLS_UNSUPPORTED_MESSAGE
                        : STATELESS_SAMPLING_UNSUPPORTED_MESSAGE;

                    const trigger = (
                      <TabsTrigger
                        value={tab.id}
                        disabled={isDisabled}
                        disabledTooltip={
                          isDisabled ? disabledTooltip : undefined
                        }
                        data-testid={`tab-${tab.id}`}
                        icon={skillsState === "empty" ? CircleAlert : tab.icon}
                        iconOnly
                        title={isDisabled ? undefined : tab.label}
                        badge={
                          count > 0 ? (
                            <TabCountBadge
                              count={count}
                              isActive={activeTab === tab.id}
                              overlay
                            />
                          ) : undefined
                        }
                        className={cn(
                          "size-9 shrink-0 rounded-full p-0",
                          skillsState === "empty" &&
                            "text-red-600 dark:text-red-400"
                        )}
                      >
                        <span className="sr-only">
                          {skillsState
                            ? getSkillsAccessibleLabel(tab.label, skillsState)
                            : tab.label}
                        </span>
                      </TabsTrigger>
                    );

                    return (
                      <span key={tab.id} className="contents">
                        {trigger}
                      </span>
                    );
                  })}
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>
    </header>
  );
}
