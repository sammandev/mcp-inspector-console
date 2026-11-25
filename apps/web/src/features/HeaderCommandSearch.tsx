// Header search box that opens the Command Palette.
import { Search } from "lucide-react";

export function HeaderCommandSearch({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search commands"
      aria-keyshortcuts="Meta+K Control+K"
      data-testid="header-command-search"
      className="hidden lg:flex h-8 w-56 xl:w-72 shrink min-w-0 items-center gap-2 rounded-full border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="size-3.5 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-left">Search…</span>
      <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 font-mono text-[10px] leading-4">
        {"\u2318"}K
      </kbd>
    </button>
  );
}
