// Modified for the combined Inspector: add selected-resource subscriptions and template completions.
import { Button } from "@/client/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/client/components/ui/resizable";
import { useInspector } from "@/client/context/InspectorContext";
import {
  MCPResourceReadEvent,
  captureInspectorEvent,
} from "@/client/telemetry";
import type {
  McpServer,
  Resource,
  ResourceTemplateType,
} from "@mcp-use/client/react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, FolderOpen } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ResourceResult } from "./resources/ResourceResultDisplay";
import { ResourceResultDisplay } from "./resources/ResourceResultDisplay";
import { ResourcesList } from "./resources/ResourcesList";
import { Input } from "@/client/components/ui/input";
import {
  InspectorScrollArea,
  ListItem,
  SearchTabHeader,
} from "@/client/components/shared";
import { useConfig } from "./chat/useConfig";
import { copyToClipboard } from "@/client/utils/browser";

export interface ResourcesTabRef {
  focusSearch: () => void;
  blurSearch: () => void;
}

interface ResourcesTabProps {
  resources: Resource[];
  resourceTemplates: ResourceTemplateType[];
  connection: McpServer;
  readResource: (uri: string) => Promise<any>;
  serverId: string;
  isConnected: boolean;
  mcpServerUrl: string;
  refreshResources?: () => Promise<void>;
}

/**
 * Render the Resources tab UI and manage its interactions (resource list, selection, result display, search, keyboard navigation, mobile/desktop layouts, copy/download/fullscreen actions, and RPC logger).
 *
 * @param ref - Optional ref exposing `focusSearch()` and `blurSearch()` methods for programmatic search focus control.
 * @param resources - Array of resources to show and filter.
 * @param readResource - Function to read a resource by its URI; used when a resource is selected.
 * @param serverId - Identifier for the server; used for telemetry and RPC logger scope.
 * @param isConnected - When `true`, selecting a resource triggers `readResource`; when `false`, reads are skipped.
 * @returns The ResourcesTab React element.
 */
export function ResourcesTab({
  ref,
  resources,
  resourceTemplates,
  connection,
  readResource,
  serverId,
  isConnected,
  mcpServerUrl,
  refreshResources,
}: ResourcesTabProps & { ref?: React.RefObject<ResourcesTabRef | null> }) {
  // State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<ResourceTemplateType | null>(null);
  const { selectedResourceUri, setSelectedResourceUri } = useInspector();
  const { llmConfig } = useConfig({ mcpServerUrl });
  const [currentResult, setCurrentResult] = useState<ResourceResult | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab] = useState<"resources">("resources");
  const [previewMode, setPreviewMode] = useState(true);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isCopied, setIsCopied] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resourceDisplayRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [templateArguments, setTemplateArguments] = useState<Record<string, string>>({});
  const [templateCompletions, setTemplateCompletions] = useState<Record<string, string[]>>({});
  const [templateCompletionErrors, setTemplateCompletionErrors] = useState<Record<string, string>>({});
  const [completingTemplateArgument, setCompletingTemplateArgument] = useState<string | null>(null);
  const [subscribedUris, setSubscribedUris] = useState<Set<string>>(() => new Set());
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");

  const templateArgumentNames = useMemo(
    () => selectedTemplate ? getResourceTemplateArguments(selectedTemplate.uriTemplate) : [],
    [selectedTemplate]
  );

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle mobile view transitions
  useEffect(() => {
    if (selectedResource || selectedTemplate) {
      setMobileView("detail");
    } else {
      setMobileView("list");
    }
  }, [selectedResource, selectedTemplate]);

  // Expose focusSearch and blurSearch methods via ref
  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      setIsSearchExpanded(true);
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 0);
    },
    blurSearch: () => {
      setSearchQuery("");
      setIsSearchExpanded(false);
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
    },
  }));

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

  const handleRefresh = useCallback(async () => {
    if (!refreshResources) return;
    setIsRefreshing(true);
    try {
      await refreshResources();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshResources]);

  const filteredResources = useMemo(() => {
    if (!searchQuery) return resources;
    const query = searchQuery.toLowerCase();
    return resources.filter(
      (resource) =>
        resource.name.toLowerCase().includes(query) ||
        resource.description?.toLowerCase().includes(query) ||
        resource.uri.toLowerCase().includes(query)
    );
  }, [resources, searchQuery]);

  const handleResourceSelect = useCallback(
    async (resource: Resource) => {
      setSelectedTemplate(null);
      setSelectedResource(resource);
      setSubscriptionError("");

      // Automatically read the resource when selected
      if (isConnected) {
        setIsLoading(true);
        const timestamp = Date.now();

        try {
          const result = await readResource(resource.uri);

          // Track successful resource read
          captureInspectorEvent(
            new MCPResourceReadEvent({
              resourceUri: resource.uri,
              serverId,
              success: true,
            })
          ).catch(() => {
            // Silently fail - telemetry should not break the application
          });

          setCurrentResult({
            uri: resource.uri,
            result,
            timestamp,
            resourceAnnotations: {
              ...(resource.annotations as Record<string, any>),
              ...(((resource as any)._meta as Record<string, any>) || {}),
            },
          });
        } catch (error) {
          // Track failed resource read
          captureInspectorEvent(
            new MCPResourceReadEvent({
              resourceUri: resource.uri,
              serverId,
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            })
          ).catch(() => {
            // Silently fail - telemetry should not break the application
          });

          setCurrentResult({
            uri: resource.uri,
            result: {
              contents: [],
              _meta: {},
            },
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp,
            resourceAnnotations: {
              ...(resource.annotations as Record<string, any>),
              ...(((resource as any)._meta as Record<string, any>) || {}),
            },
          });
        } finally {
          setIsLoading(false);
        }
      }
    },
    [readResource, serverId, isConnected]
  );

  const handleTemplateSelect = useCallback((template: ResourceTemplateType) => {
    setSelectedResource(null);
    setCurrentResult(null);
    setSelectedTemplate(template);
    setTemplateArguments(Object.fromEntries(
      getResourceTemplateArguments(template.uriTemplate).map((name) => [name, ""])
    ));
    setTemplateCompletions({});
    setTemplateCompletionErrors({});
  }, []);

  const handleTemplateCompletion = useCallback(async (name: string) => {
    if (!selectedTemplate || !templateArgumentNames.includes(name)) {
      throw new Error("Select a resource-template argument before requesting completions");
    }

    setCompletingTemplateArgument(name);
    setTemplateCompletionErrors((current) => ({ ...current, [name]: "" }));
    try {
      const result = await connection.complete({
        ref: { type: "ref/resource", uri: selectedTemplate.uriTemplate },
        argument: { name, value: templateArguments[name] ?? "" },
      });
      setTemplateCompletions((current) => ({
        ...current,
        [name]: result.completion.values,
      }));
    } catch (error) {
      setTemplateCompletionErrors((current) => ({
        ...current,
        [name]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setCompletingTemplateArgument(null);
    }
  }, [connection, selectedTemplate, templateArgumentNames, templateArguments]);

  const handleResourceSubscription = useCallback(async (subscribe: boolean) => {
    const uri = selectedResource?.uri;
    if (!uri) {
      throw new Error("Select a resource before changing its subscription");
    }

    setSubscriptionBusy(true);
    setSubscriptionError("");
    try {
      const sessions = Object.values(connection.client?.getAllActiveSessions() ?? {});
      if (connection.state !== "ready" || sessions.length !== 1 || !sessions[0]) {
        throw new Error("The selected server must have exactly one ready connection");
      }
      const connector = sessions[0].connector;
      if (subscribe) {
        await connector.subscribeToResource(uri);
      } else {
        await connector.unsubscribeFromResource(uri);
      }
      setSubscribedUris((current) => {
        const next = new Set(current);
        if (subscribe) next.add(uri);
        else next.delete(uri);
        return next;
      });
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubscriptionBusy(false);
    }
  }, [connection, selectedResource]);

  // Reset focused index when filtered resources change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery, activeTab]);

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

      const items = filteredResources;

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
        const resource = filteredResources[focusedIndex];
        if (resource) {
          handleResourceSelect(resource);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, filteredResources, handleResourceSelect]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const itemId = `resource-${filteredResources[focusedIndex]?.uri}`;
      const element = document.getElementById(itemId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusedIndex, filteredResources]);

  // Handle auto-selection from context
  useEffect(() => {
    if (selectedResourceUri && resources.length > 0) {
      const resource = resources.find((r) => r.uri === selectedResourceUri);

      if (resource && selectedResource?.uri !== resource.uri) {
        setSelectedResourceUri(null);
        setTimeout(() => {
          handleResourceSelect(resource);
          const element = document.getElementById(`resource-${resource.uri}`);
          if (element) {
            element.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }
        }, 100);
      }
    }
  }, [
    selectedResourceUri,
    resources,
    selectedResource,
    handleResourceSelect,
    setSelectedResourceUri,
  ]);

  // Sync selectedResource with updated resources list (for HMR support)
  // When resources change via HMR, update selectedResource to the new object reference
  useEffect(() => {
    if (selectedResource) {
      const updatedResource = resources.find(
        (r) => r.uri === selectedResource.uri
      );
      if (updatedResource && updatedResource !== selectedResource) {
        // Resource definition changed - update the reference
        const hasChanges =
          updatedResource.description !== selectedResource.description ||
          updatedResource.mimeType !== selectedResource.mimeType ||
          updatedResource.name !== selectedResource.name;
        if (hasChanges) {
          setSelectedResource(updatedResource);
        }
      }
    }
  }, [resources, selectedResource]);

  const handleCopy = useCallback(async () => {
    if (!currentResult) return;
    try {
      await copyToClipboard(JSON.stringify(currentResult.result, null, 2));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("[ResourcesTab] Failed to copy result:", error);
    }
  }, [currentResult]);

  const handleDownload = useCallback(() => {
    if (!currentResult) return;
    try {
      const blob = new globalThis.Blob(
        [JSON.stringify(currentResult.result, null, 2)],
        {
          type: "application/json",
        }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resource-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[ResourcesTab] Failed to download result:", error);
    }
  }, [currentResult]);

  const handleFullscreen = useCallback(async () => {
    if (!resourceDisplayRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await resourceDisplayRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("[ResourcesTab] Failed to toggle fullscreen:", error);
    }
  }, []);

  const resourceDetail = selectedTemplate ? (
    <section
      aria-label="Resource template arguments"
      className="h-full overflow-y-auto p-4 sm:p-6"
    >
      <h3 className="text-base font-semibold">{selectedTemplate.name}</h3>
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
        {selectedTemplate.uriTemplate}
      </p>
      {templateArgumentNames.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          This resource template has no completable arguments.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {templateArgumentNames.map((name) => (
            <div key={name} className="space-y-2">
              <label htmlFor={`resource-template-arg-${name}`} className="text-sm font-medium">
                {name}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={`resource-template-arg-${name}`}
                  data-testid={`resource-template-param-${name}`}
                  value={templateArguments[name] ?? ""}
                  onChange={(event) => {
                    setTemplateArguments((current) => ({ ...current, [name]: event.target.value }));
                    setTemplateCompletions((current) => ({ ...current, [name]: [] }));
                    setTemplateCompletionErrors((current) => ({ ...current, [name]: "" }));
                  }}
                  placeholder={`Enter ${name}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Complete ${name}`}
                  disabled={!isConnected || completingTemplateArgument !== null}
                  onClick={() => void handleTemplateCompletion(name)}
                >
                  {completingTemplateArgument === name ? "Completing..." : "Complete"}
                </Button>
              </div>
              {templateCompletionErrors[name] && (
                <p role="alert" className="text-sm text-destructive">
                  {templateCompletionErrors[name]}
                </p>
              )}
              {templateCompletions[name]?.length ? (
                <div aria-label={`${name} completions`} className="flex flex-wrap gap-2">
                  {templateCompletions[name].map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTemplateArguments((current) => ({ ...current, [name]: suggestion }));
                        setTemplateCompletions((current) => ({ ...current, [name]: [] }));
                      }}
                    >
                      Use {suggestion}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      {selectedResource && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3 sm:px-6">
          <div>
            <p className="text-sm font-medium">Resource subscription</p>
            <p className="text-xs text-muted-foreground">
              {subscribedUris.has(selectedResource.uri) ? "Subscribed" : "Not subscribed"} · {selectedResource.uri}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isConnected || subscriptionBusy}
            onClick={() => void handleResourceSubscription(!subscribedUris.has(selectedResource.uri))}
          >
            {subscriptionBusy
              ? "Updating..."
              : subscribedUris.has(selectedResource.uri)
                ? "Unsubscribe from resource"
                : "Subscribe to resource"}
          </Button>
          {subscriptionError && (
            <p role="alert" className="w-full text-sm text-destructive">
              {subscriptionError}
            </p>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <ResourceResultDisplay
          result={currentResult}
          isLoading={isLoading}
          previewMode={previewMode}
          serverId={serverId}
          readResource={readResource}
          onTogglePreview={() => setPreviewMode(!previewMode)}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onFullscreen={handleFullscreen}
          isCopied={isCopied}
          selectedResource={selectedResource}
          llmConfig={llmConfig}
        />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-full flex flex-col overflow-hidden relative bg-background">
        {/* Breadcrumbs / Header - Only show when not on list view */}
        {mobileView !== "list" && (
          <div className="flex items-center gap-2 p-2 border-b shrink-0 bg-background z-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedResource(null);
                setSelectedTemplate(null);
                setMobileView("list");
              }}
              className="p-0 h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center text-sm font-medium">
              <button
                onClick={() => {
                  setSelectedResource(null);
                  setSelectedTemplate(null);
                  setMobileView("list");
                }}
                className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
              >
                Resources
              </button>
              {mobileView === "detail" && (
                <>
                  <span className="mx-2 text-muted-foreground">/</span>
                  <span className="text-foreground">
                    {selectedTemplate?.name ?? selectedResource?.name ?? "Content"}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            {mobileView === "list" && (
              <motion.div
                key="list"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute inset-0 flex flex-col bg-background z-0"
              >
                <InspectorScrollArea>
                  {(isScrolled) => (
                    <>
                      <SearchTabHeader
                        isScrolled={isScrolled}
                        title="Resources"
                        icon={FolderOpen}
                        count={filteredResources.length}
                        isSearchExpanded={isSearchExpanded}
                        searchQuery={searchQuery}
                        searchPlaceholder="Search resources..."
                        onSearchExpand={() => setIsSearchExpanded(true)}
                        onSearchChange={setSearchQuery}
                        onSearchBlur={handleSearchBlur}
                        searchInputRef={
                          searchInputRef as React.RefObject<HTMLInputElement>
                        }
                        onRefresh={refreshResources ? handleRefresh : undefined}
                        isRefreshing={isRefreshing}
                      />
                      <ResourcesList
                        resources={filteredResources}
                        selectedResource={selectedResource}
                        onResourceSelect={handleResourceSelect}
                        focusedIndex={focusedIndex}
                      />
                      <ResourceTemplatesList
                        templates={resourceTemplates}
                        selectedTemplate={selectedTemplate}
                        onSelect={handleTemplateSelect}
                      />
                    </>
                  )}
                </InspectorScrollArea>
              </motion.div>
            )}

            {mobileView === "detail" && (
              <motion.div
                key="detail"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute inset-0 bg-white dark:bg-zinc-900 z-10"
              >
                <div ref={resourceDisplayRef} className="h-full">
                  {resourceDetail}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="33%">
        <div className="flex h-full flex-col overflow-hidden border-r dark:border-zinc-700">
          <InspectorScrollArea>
            {(isScrolled) => (
              <>
                <SearchTabHeader
                  isScrolled={isScrolled}
                  title="Resources"
                  icon={FolderOpen}
                  count={filteredResources.length}
                  isSearchExpanded={isSearchExpanded}
                  searchQuery={searchQuery}
                  searchPlaceholder="Search resources..."
                  onSearchExpand={() => setIsSearchExpanded(true)}
                  onSearchChange={setSearchQuery}
                  onSearchBlur={handleSearchBlur}
                  searchInputRef={
                    searchInputRef as React.RefObject<HTMLInputElement>
                  }
                  onRefresh={refreshResources ? handleRefresh : undefined}
                  isRefreshing={isRefreshing}
                />

                <ResourcesList
                  resources={filteredResources}
                  selectedResource={selectedResource}
                  onResourceSelect={handleResourceSelect}
                  focusedIndex={focusedIndex}
                />
                <ResourceTemplatesList
                  templates={resourceTemplates}
                  selectedTemplate={selectedTemplate}
                  onSelect={handleTemplateSelect}
                />
              </>
            )}
          </InspectorScrollArea>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel defaultSize="67%">
        <div
          ref={resourceDisplayRef}
          className="h-full bg-white dark:bg-zinc-900"
        >
          {resourceDetail}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

ResourcesTab.displayName = "ResourcesTab";

function getResourceTemplateArguments(uriTemplate: string): string[] {
  const names = new Set<string>();
  for (const [, expression] of uriTemplate.matchAll(/\{([^}]+)\}/g)) {
    const variables = expression.replace(/^[+#./;?&]/, "").split(",");
    for (const variable of variables) {
      const name = variable.replace(/\*$/, "").replace(/:\d+$/, "");
      if (name) names.add(name);
    }
  }
  return [...names];
}

function ResourceTemplatesList({
  templates,
  selectedTemplate,
  onSelect,
}: {
  templates: ResourceTemplateType[];
  selectedTemplate: ResourceTemplateType | null;
  onSelect: (template: ResourceTemplateType) => void;
}) {
  return (
    <section aria-label="Resource templates" className="border-t py-2">
      <h3 className="px-4 py-2 text-sm font-medium">Resource templates</h3>
      {templates.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-muted-foreground">
          No resource templates available
        </p>
      ) : (
        templates.map((template) => (
          <ListItem
            key={`${template.name}:${template.uriTemplate}`}
            id={`resource-template-${template.name}`}
            data-testid={`resource-template-item-${template.name}`}
            isSelected={
              selectedTemplate?.uriTemplate === template.uriTemplate &&
              selectedTemplate?.name === template.name
            }
            isFocused={false}
            title={template.name}
            description={
              <span className="font-mono text-xs">{template.uriTemplate}</span>
            }
            onClick={() => onSelect(template)}
          />
        ))
      )}
    </section>
  );
}
