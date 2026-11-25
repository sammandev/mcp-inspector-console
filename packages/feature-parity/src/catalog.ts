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

const reimplemented = (where: string) => `Reimplemented with the MCP SDK on the selected mcp-use connection (${where}); the Official Inspector is a behavioral reference only and no Official code is copied.`

export const parityCatalog = [
  { id: 'provenance-scaffold', feature: 'Provenance and scaffold', aliases: ['provenance-scaffold'], status: 'implemented', ownerPhase: 'phase-0', source: 'combined', note: 'Typed inventories, pinned references, static shell, and generated reports.' },
  { id: 'connection-foundation', feature: 'Unified connection foundation', aliases: ['connection-foundation', 'transport-stdio', 'transport-streamable-http', 'transport-sse'], status: 'implemented', ownerPhase: 'phase-1', source: 'combined', note: 'The forked mcp-use client connects over Streamable HTTP and SSE; stdio servers launch through the loopback-only local relay.' },
  { id: 'chat', feature: 'Chat', aliases: ['chat'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'tools', feature: 'Tools', aliases: ['tools'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'prompts', feature: 'Prompts', aliases: ['prompts'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'resources', feature: 'Resources', aliases: ['resources'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'skills', feature: 'Skills', aliases: ['skills'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'apps-widgets', feature: 'Apps and widgets', aliases: ['apps-widgets'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'server-workflows', feature: 'Sampling, elicitation, and notifications', aliases: ['sampling', 'elicitation', 'notifications'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'request-history', feature: 'Saved requests and history', aliases: ['saved-requests', 'history'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'multi-server-theme', feature: 'Multi-server UX and theme behavior', aliases: ['multi-server', 'theme'], status: 'implemented', ownerPhase: 'phase-2', source: 'mcp-use', note: 'Provided by the pinned, attributed mcp-use UI fork, kept intact and covered by end-to-end tests.' },
  { id: 'protocol-network-diagnostics', feature: 'Protocol and network diagnostics', aliases: ['protocol-transcript', 'network-inspector'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Protocol destination with raw requests, paired Protocol exchanges, and redacted per-request Network capture of headers, bodies, status, and timing, mirrored in the RPC panel Protocol/Network views with JSON export') },
  { id: 'process-stderr-diagnostics', feature: 'Process and stderr diagnostics', aliases: ['process-diagnostics', 'stderr'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Diagnostics destination with local session stderr and process lifecycle controls') },
  { id: 'oauth', feature: 'OAuth diagnostics', aliases: ['oauth'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Auth destination with protected-resource and authorization-server discovery') },
  { id: 'roots', feature: 'Roots', aliases: ['roots'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Client destination advertising validated file roots') },
  { id: 'tasks', feature: 'Tasks', aliases: ['tasks'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Client destination for task-augmented tool calls') },
  { id: 'completions', feature: 'Completions', aliases: ['completions'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Native Prompts and Resources tabs provide contextual argument completions') },
  { id: 'subscriptions-logging', feature: 'Subscriptions and logging controls', aliases: ['subscriptions', 'logging-controls'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Native Resources and Notifications tabs provide subscriptions and log controls') },
  { id: 'apps-schema-conformance', feature: 'Apps and schema conformance', aliases: ['apps-metadata', 'schema-conformance'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Native Tools tab validates schemas and checks MCP App resource metadata') },
  { id: 'configuration-io', feature: 'Configuration import and export', aliases: ['config-import', 'config-export'], status: 'implemented', ownerPhase: 'phase-3', source: 'combined', note: reimplemented('Diagnostics destination imports and exports redacted configs and explicitly launches stdio servers') },
  { id: 'cli-automation', feature: 'Automation and CLI assertions', aliases: ['cli-automation'], status: 'implemented', ownerPhase: 'phase-4', source: 'combined', note: reimplemented('Diagnostics destination documents the `pnpm inspect` CLI') },
  { id: 'load-testing', feature: 'Load testing', aliases: ['load-testing'], status: 'implemented', ownerPhase: 'phase-4', source: 'combined', note: reimplemented('Tools runs per-tool and weighted-scenario load tests with rate, duration, warm-up, and stepped stages plus JSON export; Diagnostics keeps the gated ping load test') },
] as const satisfies readonly ParityItem[]
