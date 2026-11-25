// One-click light/dark theme toggle for the inspector's top header.
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../vendor/mcp-use/client/components/ui/tooltip.js";
import { useTheme } from "../../vendor/mcp-use/client/context/ThemeContext.js";
import { Moon, SunDim } from "lucide-react";

export function HeaderThemeToggle() {
  const { resolvedTheme, setTheme, forced } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setTheme(next)}
            disabled={forced}
            aria-label={label}
            title={forced ? "Theme set by URL" : undefined}
            data-testid="header-theme-toggle"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {resolvedTheme === "dark" ? (
              <SunDim className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
          </button>
        }
        nativeButton
      />
      <TooltipContent side="bottom">
        {forced ? "Theme set by URL" : label}
      </TooltipContent>
    </Tooltip>
  );
}
