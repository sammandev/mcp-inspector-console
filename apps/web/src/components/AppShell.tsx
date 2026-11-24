import { useState } from "react";
import { Menu, Moon, PlugZap, Search, Sun, X } from "lucide-react";
import type { ReactNode } from "react";
import type { PublishedExportName } from "../mcp-use-exports.js";

export interface Destination {
  label: string;
  description: string;
  publishedSurface?: PublishedExportName;
}

interface AppShellProps {
  destinations: readonly Destination[];
  selected: string;
  onSelect: (label: string) => void;
  children: ReactNode;
}

function ThemeButton() {
  const [dark, setDark] = useState(false);

  return (
    <button
      className="icon-button"
      type="button"
      aria-label="Toggle dark theme"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
      }}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function Navigation({
  destinations,
  selected,
  onSelect,
  mobile = false,
}: Pick<AppShellProps, "destinations" | "selected" | "onSelect"> & { mobile?: boolean }) {
  return (
    <nav
      className={mobile ? "mobile-drawer-nav" : "sidebar-nav"}
      aria-label={mobile ? "Mobile navigation" : "Desktop navigation"}
      data-testid={mobile ? "mobile-navigation-list" : "desktop-navigation"}
    >
      {destinations.map((destination, index) => (
        <button
          className={`nav-item ${selected === destination.label ? "active" : ""}`}
          type="button"
          key={destination.label}
          aria-current={selected === destination.label ? "page" : undefined}
          onClick={() => onSelect(destination.label)}
        >
          <span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span>{destination.label}</span>
          {destination.publishedSurface && <span className="published-mark" title="Published mcp-use surface" />}
        </button>
      ))}
    </nav>
  );
}

export function AppShell({ destinations, selected, onSelect, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const selectDestination = (label: string) => {
    onSelect(label);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><PlugZap size={20} /></div>
          <div><strong>Combined</strong><span>MCP Inspector</span></div>
        </div>
        <div className="sidebar-label">Workspace</div>
        <Navigation destinations={destinations} selected={selected} onSelect={selectDestination} />
        <div className="sidebar-footer">
          <span className="status-dot" /> Offline scaffold
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
            <Menu size={18} />
          </button>
          <label className="connection-control">
            <span>Connection</span>
            <select aria-label="Connection selector" data-testid="connection-selector" defaultValue="offline">
              <option value="offline">No connection — scaffold</option>
            </select>
          </label>
          <div className="topbar-actions">
            <span className="phase-badge">Phase 0</span>
            <ThemeButton />
          </div>
        </header>

        <div className="mobile-statusbar" data-testid="mobile-navigation" aria-label="Mobile navigation controls">
          <span><span className="status-dot" /> Offline scaffold</span>
          <span>Phase 0</span>
        </div>

        <main className="content-region">
          <div className="notice-bar" role="status">
            <span className="notice-icon">i</span>
            <p><strong>Phase 0 notice</strong><span>Static shell preview. Live MCP capabilities are intentionally unavailable.</span></p>
            <span className="notice-code">OFFLINE</span>
          </div>
          <div className="content-grid">
            {children}
            <aside className="session-panel">
              <div className="panel-heading"><span>Session</span><Search size={15} /></div>
              <dl>
                <div><dt>Profile</dt><dd>Not configured</dd></div>
                <div><dt>Transport</dt><dd>None</dd></div>
                <div><dt>Capabilities</dt><dd>Pending connection</dd></div>
              </dl>
              <div className="session-empty">
                <PlugZap size={22} />
                <strong>No active session</strong>
                <span>Configure a connection in a future phase.</span>
              </div>
            </aside>
          </div>
        </main>
      </div>

      {menuOpen && (
        <div className="mobile-overlay" role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Inspector navigation" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-heading"><strong>Navigate</strong><button className="icon-button" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
            <Navigation destinations={destinations} selected={selected} onSelect={selectDestination} mobile />
          </aside>
        </div>
      )}
    </div>
  );
}
