export const parityStatuses = [
  'implemented',
  'phase-placeholder',
  'rebuild',
  'non-applicable',
  'blocked-license',
] as const

export type ParityStatus = (typeof parityStatuses)[number]
export type OwnerPhase = 'phase-0' | 'phase-1' | 'phase-2' | 'phase-3' | 'phase-4'
export type FeatureSource = 'mcp-use' | 'official-inspector' | 'combined'

export interface ParityItem {
  feature: string
  status: ParityStatus
  ownerPhase: OwnerPhase
  source: FeatureSource
  note: string
}

export const parityCatalog = [
  { feature: 'Provenance and scaffold', status: 'implemented', ownerPhase: 'phase-0', source: 'combined', note: 'Typed inventories, pinned references, static shell, and generated reports.' },
  { feature: 'Unified connection foundation', status: 'phase-placeholder', ownerPhase: 'phase-1', source: 'combined', note: 'Connection profiles, one-session relay, and the local control channel are scheduled for Phase 1.' },
  { feature: 'Chat', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve the published mcp-use chat surface.' },
  { feature: 'Tools', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published tools through the authoritative relay.' },
  { feature: 'Prompts', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published prompts through the authoritative relay.' },
  { feature: 'Resources', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published resources and resource templates.' },
  { feature: 'Skills', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published skill capabilities.' },
  { feature: 'Apps and widgets', status: 'rebuild', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Compose published renderer capabilities; do not copy the unexported shell.' },
  { feature: 'Sampling, elicitation, and notifications', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve approval workflows and notification UX.' },
  { feature: 'Saved requests and history', status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve local history with redacted import and export.' },
  { feature: 'Multi-server UX and theme behavior', status: 'rebuild', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Rebuild capability-aware navigation and shared mcp-use theme behavior.' },
  { feature: 'Protocol and network diagnostics', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Process and stderr diagnostics', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'OAuth diagnostics', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Roots', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Tasks', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Completions', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Subscriptions and logging controls', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Apps and schema conformance', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Configuration import and export', status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Automation and CLI assertions', status: 'blocked-license', ownerPhase: 'phase-4', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
  { feature: 'Load testing', status: 'blocked-license', ownerPhase: 'phase-4', source: 'official-inspector', note: 'Future runtime reuse is blocked until positive file-level legal classification.' },
] as const satisfies readonly ParityItem[]
