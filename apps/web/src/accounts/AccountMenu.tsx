import { Link, useLocation } from "react-router";
import { LogOut } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/client/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useOptionalAccount } from "./AccountProvider.js";

/** First character of the first two words, where words are split by spaces, underscores, or other separators. */
export function accountInitials(username: string): string {
  const words = username.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0]!.toUpperCase()).join("") || "?";
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const account = useOptionalAccount(), location = useLocation();
  if (!account) return null;
  if (!account.session) return <Link to={`/sign-in?returnTo=${encodeURIComponent(`/mcp/inspector${location.pathname === "/" ? "" : location.pathname}${location.search}`)}`} className={`inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm hover:bg-muted ${compact ? "text-xs" : ""}`}>Sign in</Link>;
  const { username } = account.session.user;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<button type="button" aria-label={`Account menu for ${username}`} title={username}
      className="flex size-8 shrink-0 cursor-pointer select-none items-center justify-center rounded-full bg-foreground text-[11px] font-semibold tracking-wide text-background ring-offset-2 ring-offset-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:ring-2 data-[popup-open]:ring-border">
      {accountInitials(username)}</button>} />
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuLabel><p className="truncate">{username}</p><p className="mt-1 truncate text-xs font-normal text-muted-foreground">{account.session.user.email}</p></DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => void account.logout().then(() => { window.location.assign("/mcp/inspector"); }).catch(cause => toast.error(cause instanceof Error ? cause.message : "Sign out failed"))}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
