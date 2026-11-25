// Modified for the combined Inspector: add the native Inspector section and the per-menu features listed in the Command Palette.
import {
  Bell,
  CheckSquare,
  FolderOpen,
  LibraryBig,
  Hash,
  Info,
  MessageCircle,
  MessageSquare,
  Settings,
  Wrench,
  Network,
  ShieldCheck,
  Cable,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { TabType } from "@/client/context/InspectorContext";

export type LayoutTabDef =
  | { id: "separator" }
  | {
      id: TabType;
      label: string;
      icon: LucideIcon;
      alwaysExpanded?: boolean;
    };

export const LAYOUT_TABS: LayoutTabDef[] = [
  { id: "server-metadata", label: "Server Metadata", icon: Info },
  { id: "separator" },
  { id: "chat", label: "Chat", icon: MessageCircle, alwaysExpanded: true },
  { id: "separator" },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "prompts", label: "Prompts", icon: MessageSquare },
  { id: "resources", label: "Resources", icon: FolderOpen },
  { id: "skills", label: "Skills", icon: LibraryBig },
  { id: "sampling", label: "Sampling", icon: Hash },
  { id: "elicitation", label: "Elicitation", icon: CheckSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "separator" },
  { id: "connection-settings", label: "Connection Settings", icon: Settings },
  { id: "protocol", label: "Protocol", icon: Network },
  { id: "auth", label: "Auth", icon: ShieldCheck },
  { id: "client", label: "Client", icon: Cable },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
];

export type LayoutTabFeature = {
  label: string;
  // Element id the Command Palette scrolls to after switching tabs.
  sectionId: string;
  keywords?: string;
};

export const LAYOUT_TAB_FEATURES: Partial<Record<TabType, LayoutTabFeature[]>> = {
  "connection-settings": [
    { label: "Endpoint", sectionId: "connection-settings-endpoint", keywords: "url alias" },
    { label: "Configuration", sectionId: "connection-settings-configuration", keywords: "connection mode protocol version proxy timeout" },
    { label: "Authentication", sectionId: "connection-settings-authentication", keywords: "oauth client id secret scope" },
    { label: "Custom Headers", sectionId: "connection-settings-headers", keywords: "http header authorization bearer" },
    { label: "Connection diagnostics settings", sectionId: "connection-settings-diagnostics", keywords: "connection timeout network log size" },
  ],
  protocol: [
    { label: "Request console", sectionId: "protocol-request-title", keywords: "json-rpc method params send request ping" },
    { label: "Network", sectionId: "protocol-network-title", keywords: "http traffic requests responses" },
    { label: "Console", sectionId: "protocol-console-title", keywords: "stderr logs messages" },
  ],
  auth: [
    { label: "Authentication state", sectionId: "auth-state-title", keywords: "token jwt bearer" },
    { label: "OAuth discovery and tokens", sectionId: "auth-discovery-title", keywords: "authorization server metadata well-known" },
  ],
  client: [
    { label: "Roots", sectionId: "client-roots-title", keywords: "workspace folders" },
    { label: "Tasks", sectionId: "client-tasks-title", keywords: "long-running operations" },
  ],
  diagnostics: [
    { label: "Local sessions", sectionId: "diagnostics-sessions-title", keywords: "stdio process launch" },
    { label: "Configuration", sectionId: "diagnostics-config-title", keywords: "import export mcp.json profiles validate" },
    { label: "Load testing", sectionId: "diagnostics-load-title", keywords: "benchmark concurrency performance" },
    { label: "CLI automation", sectionId: "diagnostics-automation-title", keywords: "command line pnpm inspect" },
  ],
};
