import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, Moon, PlugZap, Search, Sun, X } from "lucide-react";
import type { ReactNode } from "react";
import type { PublishedExportName } from "../mcp-use-exports.js";
import { useProviderTheme } from "../useProviderTheme.js";

export interface Destination {
  label: string;
  description: string;
  publishedSurface?: PublishedExportName;
}

interface AppShellProps {
  destinations: readonly Destination[];
  selected: string;
  onSelect: (label: string) => void;
  onThemeChange: () => void;
  children: ReactNode;
}

function ThemeButton({ onThemeChange }: Pick<AppShellProps, "onThemeChange">) {
  const { theme, setTheme } = useProviderTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="icon-button"
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={() => {
        setTheme(nextTheme);
        onThemeChange();
      }}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
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

export function AppShell({ destinations, selected, onSelect, onThemeChange, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const selectDestination = (label: string) => {
    onSelect(label);
    setMenuOpen(false);
  };

  return (
    <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen} modal>
      <div className="app-shell" data-testid="app-content">
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
          <button ref={openerRef} className="icon-button mobile-menu" type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
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
            <ThemeButton onThemeChange={onThemeChange} />
          </div>
        </header>

        <div className="mobile-statusbar" data-testid="mobile-status" aria-label="Mobile status">
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

        <Dialog.Portal>
          <Dialog.Backdrop className="mobile-overlay" />
          <Dialog.Popup
            className="mobile-drawer"
            aria-modal="true"
            initialFocus={closeRef}
            finalFocus={openerRef}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
              const first = focusable[0];
              const last = focusable.at(-1);
              if (event.shiftKey && document.activeElement === first && last) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last && first) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="drawer-heading">
              <Dialog.Title render={<strong />}>Navigate</Dialog.Title>
              <Dialog.Close ref={closeRef} className="icon-button" aria-label="Close navigation">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Navigation destinations={destinations} selected={selected} onSelect={selectDestination} mobile />
          </Dialog.Popup>
        </Dialog.Portal>
      </div>
    </Dialog.Root>
  );
}
