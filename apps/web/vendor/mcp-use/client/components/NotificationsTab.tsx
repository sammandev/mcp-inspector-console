// Modified for the combined Inspector: add native log filtering, logging controls, styled dropdowns, and JSON exports.
import type { McpNotification, McpServer } from "@mcp-use/client/react";
import { downloadJson } from "../../../../src/features/model.js";
import { StyledSelect } from "../../../../src/features/StyledSelect.js";

// Type alias for backward compatibility
type MCPNotification = McpNotification;
const LOG_LEVELS = [
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency",
] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const LOG_LEVEL_OPTIONS = LOG_LEVELS.map((level) => ({ value: level, label: level }));
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/client/components/ui/resizable";
import { NotificationsList } from "./notifications/NotificationsList";
import { NotificationResultDisplay } from "./notifications/NotificationResultDisplay";
import type { NotificationResult } from "./notifications/NotificationResultDisplay";
import {
  InspectorScrollArea,
  SearchTabHeader,
} from "@/client/components/shared";
import { copyToClipboard, formatRelativeTime } from "@/client/utils/browser";

interface NotificationsTabProps {
  connection: McpServer;
  notifications: MCPNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  serverId: string;
  isConnected: boolean;
}

export function NotificationsTab({
  connection,
  notifications,
  unreadCount: _unreadCount,
  markNotificationRead,
  markAllNotificationsRead: _markAllNotificationsRead,
  clearNotifications,
  serverId: _serverId,
  isConnected,
}: NotificationsTabProps) {
  const [selectedNotification, setSelectedNotification] =
    useState<MCPNotification | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [minimumLogLevel, setMinimumLogLevel] = useState<LogLevel>("debug");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [activeLogLevel, setActiveLogLevel] = useState<LogLevel>("info");
  const [loggingBusy, setLoggingBusy] = useState(false);
  const [loggingError, setLoggingError] = useState("");
  const [loggingStatus, setLoggingStatus] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const notificationDisplayRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userHasScrolledRef = useRef(false);

  // Auto-scroll to top when new notifications arrive (only if user hasn't scrolled)
  useEffect(() => {
    if (
      autoScroll &&
      notifications.length > 0 &&
      listRef.current &&
      !userHasScrolledRef.current
    ) {
      listRef.current.scrollTop = 0;
    }
  }, [notifications.length, autoScroll]);

  // Track user scroll to disable auto-scroll
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;

    const handleScroll = () => {
      if (listElement.scrollTop > 0) {
        userHasScrolledRef.current = true;
        setAutoScroll(false);
      }
    };

    listElement.addEventListener("scroll", handleScroll);
    return () => listElement.removeEventListener("scroll", handleScroll);
  }, []);

  // Reset user scroll tracking when notifications are cleared
  useEffect(() => {
    if (notifications.length === 0) {
      userHasScrolledRef.current = false;
      setAutoScroll(true);
    }
  }, [notifications.length]);

  // Mark notification as read when selected
  useEffect(() => {
    if (selectedNotification && !selectedNotification.read) {
      markNotificationRead(selectedNotification.id);
    }
  }, [selectedNotification, markNotificationRead]);

  // Auto-focus search input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

  const handleSearchBlur = useCallback(() => {
    if (!searchQuery.trim()) {
      setIsSearchExpanded(false);
    }
  }, [searchQuery]);

  const filteredLogs = useMemo(() => {
    const minimum = LOG_LEVELS.indexOf(minimumLogLevel);
    const query = logSearchQuery.trim().toLowerCase();
    return notifications
      .filter((notification) => notification.method === "notifications/message")
      .map((notification) => {
        const level = String(notification.params?.level ?? "info");
        return {
          id: notification.id,
          level,
          logger: typeof notification.params?.logger === "string"
            ? notification.params.logger
            : undefined,
          data: notification.params?.data,
          timestamp: notification.timestamp,
        };
      })
      .filter((log) => {
        const index = LOG_LEVELS.indexOf(log.level as LogLevel);
        const rank = index < 0 ? LOG_LEVELS.indexOf("info") : index;
        return rank >= minimum && (
          !query || JSON.stringify(log).toLowerCase().includes(query)
        );
      });
  }, [notifications, minimumLogLevel, logSearchQuery]);

  // Apply global search to all notifications and log-specific filters only to log events.
  const filteredNotifications = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return notifications.filter(
      (notification) => {
        const matchesGlobalSearch = !query ||
          notification.method.toLowerCase().includes(query) ||
          JSON.stringify(notification.params || {}).toLowerCase().includes(query);
        if (!matchesGlobalSearch) return false;
        if (notification.method !== "notifications/message") return true;
        return filteredLogs.some((log) => log.id === notification.id);
      }
    );
  }, [notifications, searchQuery, filteredLogs]);

  // Reset focused index when filtered notifications change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery, minimumLogLevel, logSearchQuery]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (isInputFocused || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const items = filteredNotifications;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev + 1;
          return next >= items.length ? 0 : next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? items.length - 1 : next;
        });
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const notification = filteredNotifications[focusedIndex];
        if (notification) {
          handleNotificationSelect(notification);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, filteredNotifications]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const itemId = `notification-${filteredNotifications[focusedIndex]?.id}`;
      const element = document.getElementById(itemId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusedIndex, filteredNotifications]);

  const handleNotificationSelect = useCallback(
    (notification: MCPNotification) => {
      setSelectedNotification(notification);
    },
    []
  );

  const handleClearAll = useCallback(() => {
    if (
      window.confirm(
        "Are you sure you want to clear all notifications? This cannot be undone."
      )
    ) {
      clearNotifications();
      setSelectedNotification(null);
    }
  }, [clearNotifications]);

  const handleCopy = useCallback(async () => {
    if (!selectedNotification) return;
    try {
      await copyToClipboard(
        JSON.stringify(
          {
            method: selectedNotification.method,
            timestamp: selectedNotification.timestamp,
            read: selectedNotification.read,
            params: selectedNotification.params,
          },
          null,
          2
        )
      );
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("[NotificationsTab] Failed to copy notification:", error);
    }
  }, [selectedNotification]);

  const handleDownload = useCallback(() => {
    if (!selectedNotification) return;
    try {
      const blob = new globalThis.Blob(
        [
          JSON.stringify(
            {
              method: selectedNotification.method,
              timestamp: selectedNotification.timestamp,
              read: selectedNotification.read,
              params: selectedNotification.params,
            },
            null,
            2
          ),
        ],
        {
          type: "application/json",
        }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notification-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(
        "[NotificationsTab] Failed to download notification:",
        error
      );
    }
  }, [selectedNotification]);

  const handleFullscreen = useCallback(async () => {
    if (!notificationDisplayRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await notificationDisplayRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("[NotificationsTab] Failed to toggle fullscreen:", error);
    }
  }, []);

  const handleSetLoggingLevel = useCallback(async () => {
    setLoggingBusy(true);
    setLoggingError("");
    setLoggingStatus("");
    try {
      const sessions = Object.values(connection.client?.getAllActiveSessions() ?? {});
      if (connection.state !== "ready" || sessions.length !== 1 || !sessions[0]) {
        throw new Error("The selected server must have exactly one ready connection");
      }
      await sessions[0].connector.request(
        "logging/setLevel",
        { level: activeLogLevel },
        { timeout: 30_000 }
      );
      setLoggingStatus(`Server log level set to ${activeLogLevel}`);
    } catch (error) {
      setLoggingError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoggingBusy(false);
    }
  }, [activeLogLevel, connection]);

  const handleExportLogs = useCallback(() => {
    setLoggingError("");
    try {
      const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "server-logs.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setLoggingStatus(`Exported ${filteredLogs.length} log message${filteredLogs.length === 1 ? "" : "s"}`);
    } catch (error) {
      setLoggingError(error instanceof Error ? error.message : String(error));
    }
  }, [filteredLogs]);

  // Convert selected notification to NotificationResult format
  const notificationResult: NotificationResult | null = selectedNotification
    ? {
        method: selectedNotification.method,
        params: selectedNotification.params,
        timestamp: selectedNotification.timestamp,
        read: selectedNotification.read,
        formatRelativeTime,
      }
    : null;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <Bell className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">
          Not connected to server
        </p>
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={40} minSize={30}>
        <ResizablePanelGroup
          orientation="vertical"
          className="h-full border-r dark:border-zinc-700"
        >
          <ResizablePanel
            defaultSize={75}
            minSize={30}
            className="h-full overflow-hidden"
          >
            <InspectorScrollArea scrollRef={listRef}>
              {(isScrolled) => (
                <>
                  <SearchTabHeader
                    isScrolled={isScrolled}
                    title="Notifications"
                    icon={Bell}
                    count={filteredNotifications.length}
                    isSearchExpanded={isSearchExpanded}
                    searchQuery={searchQuery}
                    searchPlaceholder="Search notifications..."
                    onSearchExpand={() => setIsSearchExpanded(true)}
                    onSearchChange={setSearchQuery}
                    onSearchBlur={handleSearchBlur}
                    bulkAction={{
                      icon: Trash2,
                      label: "Clear all",
                      onClick: handleClearAll,
                      disabled: notifications.length === 0,
                    }}
                    searchInputRef={
                      searchInputRef as React.RefObject<HTMLInputElement>
                    }
                  />

                  <div className="space-y-3 border-b p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1 text-xs text-muted-foreground">
                        Minimum log level
                        <StyledSelect
                          label="Minimum log level"
                          value={minimumLogLevel}
                          onValueChange={(value) => setMinimumLogLevel(value as LogLevel)}
                          options={LOG_LEVEL_OPTIONS}
                        />
                      </label>
                      <label className="block space-y-1 text-xs text-muted-foreground">
                        Search logs
                        <Input
                          aria-label="Search logs"
                          value={logSearchQuery}
                          onChange={(event) => setLogSearchQuery(event.target.value)}
                          placeholder="Filter log messages..."
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block min-w-40 space-y-1 text-xs text-muted-foreground">
                        Active log level
                        <StyledSelect
                          label="Active log level"
                          value={activeLogLevel}
                          onValueChange={(value) => setActiveLogLevel(value as LogLevel)}
                          options={LOG_LEVEL_OPTIONS}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loggingBusy}
                        onClick={() => void handleSetLoggingLevel()}
                      >
                        {loggingBusy ? "Setting level..." : "Set log level"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={filteredLogs.length === 0}
                        onClick={handleExportLogs}
                      >
                        Export logs
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={filteredNotifications.length === 0}
                        onClick={() => {
                          downloadJson("notifications.json", filteredNotifications);
                          setLoggingStatus(`Exported ${filteredNotifications.length} notification${filteredNotifications.length === 1 ? "" : "s"}`);
                        }}
                      >
                        Export notifications
                      </Button>
                    </div>
                    {loggingError && <p role="alert" className="text-sm text-destructive">{loggingError}</p>}
                    {loggingStatus && <p role="status" className="text-sm text-muted-foreground">{loggingStatus}</p>}
                  </div>

                  {filteredNotifications.length === 0 && notifications.length > 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No notifications match the current filters
                    </div>
                  ) : (
                    <NotificationsList
                      notifications={filteredNotifications}
                      selectedNotification={selectedNotification}
                      onNotificationSelect={handleNotificationSelect}
                      focusedIndex={focusedIndex}
                      formatRelativeTime={formatRelativeTime}
                    />
                  )}
                </>
              )}
            </InspectorScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize={60} minSize={40}>
        <div
          ref={notificationDisplayRef}
          className="h-full bg-white dark:bg-zinc-900"
        >
          <NotificationResultDisplay
            notification={notificationResult}
            previewMode={previewMode}
            onTogglePreview={() => setPreviewMode(!previewMode)}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onFullscreen={handleFullscreen}
            onClose={() => setSelectedNotification(null)}
            isCopied={isCopied}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
