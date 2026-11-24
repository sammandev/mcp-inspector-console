import {
  ChatTab,
  InspectorProvider,
  PromptsTab,
  ResourcesTab,
  SkillsTab,
  ThemeProvider,
  ToolResultRenderer,
  ToolsTab,
  ViewRenderer,
} from "@mcp-use/inspector/client";

export const publishedExports = {
  ThemeProvider,
  InspectorProvider,
  ToolsTab,
  ResourcesTab,
  PromptsTab,
  SkillsTab,
  ChatTab,
  ToolResultRenderer,
  ViewRenderer,
} as const;

export type PublishedExportName = keyof typeof publishedExports;

export const unavailableSurfaces = {
  Shell: "rebuild",
  Sampling: "rebuild",
  Elicitation: "rebuild",
  Notifications: "rebuild",
  AppsControls: "rebuild",
  Metadata: "rebuild",
} as const;
