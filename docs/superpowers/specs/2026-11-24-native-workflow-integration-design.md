# Native mcp-use Workflow Integration Design

## Intent

Integrate Official Inspector workflows into the places mcp-use users already
work. Preserve the existing mcp-use UI, behavior, and server connection as the
source of truth, while replacing the single 20-item Inspector submenu with a
small set of focused top-level destinations.

## Goals

- Keep all supported Official Inspector workflows available without asking
  users to leave their normal mcp-use workflows.
- Put feature-specific actions next to their related server objects and
  operations.
- Reduce duplicated navigation and duplicate views of the same data.
- Preserve existing MCP behavior, credential redaction, cancellation, local
  relay restrictions, and mcp-use's shared connection.
- Keep the code fork attributable and verifiable against the pinned mcp-use
  source.

## Non-goals

- Implement transport capabilities that mcp-use does not expose (cookie jar,
  notification suppression, enterprise IdP/step-up auth, OAuth endpoint
  overrides, per-request log levels, or server ordering).
- Copy Official Inspector UI or source code.
- Rebuild native mcp-use workflows or change their visual language.
- Add a second server connection or a second source of truth for connection
  state.

## Approaches

1. **Fully integrate (selected by the user):** move related actions into the
   native mcp-use destinations and keep only cross-cutting features in four
   focused destinations. This best matches the stated goal and removes the
   current nested-menu burden, at the cost of editing more vendored mcp-use
   files and increasing the cost of future upstream updates.
2. **Four standalone destinations only:** divide the existing panels among
   Protocol, Auth, Client, and Diagnostics while leaving Tools, Notifications,
   and other native tabs unchanged. This is cheaper to maintain, but leaves the
   same conceptual duplication the user asked to remove.
3. **Keep the Inspector tab and group its submenu:** smallest implementation,
   but preserves the navigation problem and keeps related workflows separate.

Approach 1 is the chosen approach because the user explicitly selected full
integration over easier upstream updates.

## Navigation and feature placement

Keep the existing mcp-use destinations and their visual patterns. Add these
four top-level destinations:

- **Protocol:** raw JSON-RPC request composer, batch requests, pagination,
  request history, traffic filters/export, HTTP network capture, and stdio
  console/process diagnostics.
- **Auth:** OAuth discovery, masked token details/JWT claims, authentication
  status, and token revocation. Keep connection credentials and OAuth client
  configuration in Connection Settings.
- **Client:** client Roots and MCP Tasks workflows.
- **Diagnostics:** local stdio sessions, configuration import/export and
  explicit launch, load testing, and CLI automation.

Move workflows into existing mcp-use destinations:

- **Tools:** tool run history, replay/edit/diff, output validation and schema
  lint. Combine schema lint and App conformance into one tool-focused
  conformance experience; include MCP App metadata checks there.
- **Prompts and Resources:** expose completion for the relevant prompt
  arguments and resource-template arguments. Put resource subscribe/unsubscribe
  controls in the selected Resource workflow.
- **Skills:** add validation of advertised `SKILL.md` resources to the existing
  Skills view.
- **Notifications:** keep the existing notification browser and add log
  filtering, `logging/setLevel`, and log export there; do not keep a separate
  Logs destination.
- **Connection Settings:** use its existing protocol and timeout settings;
  include the network-log limit there instead of a separate Server Settings
  panel.
- **Server Metadata:** augment the existing metadata/capability view with
  connection diagnostics rather than keeping a separate Connection Info panel.
- **Dashboard:** rely on the existing server cards and connection actions;
  remove the duplicate Servers panel.

Remove the old 20-item nested Inspector feature navigation after all workflows
are placed. Keep one canonical view for each workflow or data stream.

The old URL `?tab=inspector` must remain a compatibility alias to the Protocol
destination, which was the previous default landing feature. New links use the
new destination IDs.

## Design and implementation constraints

- Use the vendored mcp-use components, hooks, typography, forms, cards, and
  accessible tab patterns. Use raw JSON only for intentional protocol
  inspection; use existing structured renderers for ordinary results.
- Every action continues to use the selected server's current connector. No
  panel may instantiate a new MCP client or silently connect to another
  endpoint.
- Preserve per-connection state boundaries, cancellation, explicit failures,
  and existing mcp-use state management.
- Preserve the loopback-only stdio relay and its explicit launch/stop behavior.
- Keep secrets redacted in exported diagnostics/configuration and masked in
  OAuth UI.
- Treat the Official implementation as behavioral reference only. Update the
  vendored source attribution/provenance for every changed upstream file.

## Verification

- Add/adjust focused unit and browser tests before implementation for feature
  relocation, destination navigation, protocol compatibility URLs, and
  preserved native workflows.
- Verify that old nested feature labels no longer render and that each moved
  workflow is available in its native or new destination.
- Verify the selected connection is still the only transport used, and that
  previously supported actions retain their request semantics.
- Run `pnpm verify:phase-0`, including provenance, build, and the complete e2e
  suite.
- Update README, feature parity documentation, provenance records, and tests
  affected by the new navigation.

## Builder calls

- The four new destinations are fixed; do not add another top-level category.
- Feature-specific actions should use the existing selection/context within
  the native mcp-use tab, not duplicate global controls.
- Group the few actions that do not map naturally to one native tab under
  Diagnostics; use the simplest accessible mcp-use pattern rather than
  creating another nested menu.
- If an Official workflow cannot be placed without changing its semantics or
  duplicating data/state, preserve it under the closest named destination and
  report the reason instead of silently dropping it.
