import type { RequiredCapability } from './requirements.test-fixture.ts'

export const parityStatuses = ['implemented', 'phase-placeholder', 'rebuild', 'non-applicable', 'blocked-license'] as const
export const ownerPhases = ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'phase-4'] as const
export const featureSources = ['mcp-use', 'official-inspector', 'combined'] as const

export type ParityStatus = (typeof parityStatuses)[number]
export type OwnerPhase = (typeof ownerPhases)[number]
export type FeatureSource = (typeof featureSources)[number]

export interface ParityItem {
  id: string
  feature: string
  aliases: readonly RequiredCapability[]
  status: ParityStatus
  ownerPhase: OwnerPhase
  source: FeatureSource
  note: string
}

const blocked = 'Future runtime reuse is blocked until positive file-level legal classification.'

export const parityCatalog = [
  { id: 'provenance-scaffold', feature: 'Provenance and scaffold', aliases: ['provenance-scaffold'], status: 'implemented', ownerPhase: 'phase-0', source: 'combined', note: 'Typed inventories, pinned references, static shell, and generated reports.' },
  { id: 'connection-foundation', feature: 'Unified connection foundation', aliases: ['connection-foundation', 'transport-stdio', 'transport-streamable-http', 'transport-sse'], status: 'phase-placeholder', ownerPhase: 'phase-1', source: 'combined', note: 'Connection profiles, one-session relay, and local control channel for stdio, Streamable HTTP, and SSE.' },
  { id: 'chat', feature: 'Chat', aliases: ['chat'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve the published mcp-use chat surface.' },
  { id: 'tools', feature: 'Tools', aliases: ['tools'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published tools through the authoritative relay.' },
  { id: 'prompts', feature: 'Prompts', aliases: ['prompts'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published prompts through the authoritative relay.' },
  { id: 'resources', feature: 'Resources', aliases: ['resources'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published resources and resource templates.' },
  { id: 'skills', feature: 'Skills', aliases: ['skills'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve published skill capabilities.' },
  { id: 'apps-widgets', feature: 'Apps and widgets', aliases: ['apps-widgets'], status: 'rebuild', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Compose published renderer capabilities; do not copy the unexported shell.' },
  { id: 'server-workflows', feature: 'Sampling, elicitation, and notifications', aliases: ['sampling', 'elicitation', 'notifications'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve approval workflows and notification UX.' },
  { id: 'request-history', feature: 'Saved requests and history', aliases: ['saved-requests', 'history'], status: 'phase-placeholder', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Preserve local history with redacted import and export.' },
  { id: 'multi-server-theme', feature: 'Multi-server UX and theme behavior', aliases: ['multi-server', 'theme'], status: 'rebuild', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Rebuild capability-aware navigation and shared mcp-use theme behavior.' },
  { id: 'protocol-network-diagnostics', feature: 'Protocol and network diagnostics', aliases: ['protocol-transcript', 'network-inspector'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'process-stderr-diagnostics', feature: 'Process and stderr diagnostics', aliases: ['process-diagnostics', 'stderr'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'oauth', feature: 'OAuth diagnostics', aliases: ['oauth'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'roots', feature: 'Roots', aliases: ['roots'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'tasks', feature: 'Tasks', aliases: ['tasks'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'completions', feature: 'Completions', aliases: ['completions'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'subscriptions-logging', feature: 'Subscriptions and logging controls', aliases: ['subscriptions', 'logging-controls'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'apps-schema-conformance', feature: 'Apps and schema conformance', aliases: ['apps-metadata', 'schema-conformance'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'configuration-io', feature: 'Configuration import and export', aliases: ['config-import', 'config-export'], status: 'blocked-license', ownerPhase: 'phase-3', source: 'official-inspector', note: blocked },
  { id: 'cli-automation', feature: 'Automation and CLI assertions', aliases: ['cli-automation'], status: 'blocked-license', ownerPhase: 'phase-4', source: 'official-inspector', note: blocked },
  { id: 'load-testing', feature: 'Load testing', aliases: ['load-testing'], status: 'blocked-license', ownerPhase: 'phase-4', source: 'official-inspector', note: blocked },
] as const satisfies readonly ParityItem[]
