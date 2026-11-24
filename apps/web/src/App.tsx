import { useState } from "react";
import type { UnifiedInspectorSession } from "@combined-mcp-inspector/contract";
import { publishedExports } from "./mcp-use-exports.js";
import { AppShell, type Destination } from "./components/AppShell.js";
import { FeaturePlaceholder } from "./components/FeaturePlaceholder.js";

export const destinations = [
  { label: "Connections", description: "Connection profiles and transport configuration." },
  { label: "Chat", description: "Conversations grounded in MCP context.", publishedSurface: "ChatTab" },
  { label: "Tools", description: "Discover and invoke server-provided tools.", publishedSurface: "ToolsTab" },
  { label: "Prompts", description: "Inspect reusable prompt capabilities.", publishedSurface: "PromptsTab" },
  { label: "Resources", description: "Browse and inspect protocol resources.", publishedSurface: "ResourcesTab" },
  { label: "Skills", description: "Review installed skill capabilities.", publishedSurface: "SkillsTab" },
  { label: "Apps", description: "Embedded application views and controls." },
  { label: "Protocol", description: "Protocol negotiation and message details." },
  { label: "Network", description: "Connection traffic and transport diagnostics." },
  { label: "Auth", description: "Authentication state and credential configuration." },
  { label: "Tasks", description: "Long-running operations and task status." },
  { label: "Roots", description: "Client roots exposed to connected servers." },
  { label: "Load", description: "Load testing and request diagnostics." },
  { label: "Settings", description: "Workspace and inspector preferences." },
] as const satisfies readonly Destination[];

type ContractSessionCapability = Pick<UnifiedInspectorSession, "profileId" | "sessionId">;
const offlineSession: ContractSessionCapability = {
  profileId: "phase-0-offline",
  sessionId: "not-connected",
};

export function App() {
  const [selected, setSelected] = useState("Connections");
  const destination = destinations.find((item) => item.label === selected) ?? destinations[0];
  const ThemeProvider = publishedExports.ThemeProvider;

  return (
    <ThemeProvider defaultTheme="light" storageKey="combined-inspector-theme">
      <AppShell destinations={destinations} selected={selected} onSelect={setSelected}>
        <div data-profile-id={offlineSession.profileId} data-session-id={offlineSession.sessionId}>
          <FeaturePlaceholder
            label={destination.label}
            description={destination.description}
            available={"publishedSurface" in destination}
          />
          <button className="primary-action" type="button" data-testid="primary-control" disabled>
            MCP runtime available in a later phase
          </button>
        </div>
      </AppShell>
    </ThemeProvider>
  );
}
