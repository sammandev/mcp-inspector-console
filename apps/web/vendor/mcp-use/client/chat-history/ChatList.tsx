// Modified for the combined Inspector: unify history rows with compact rename/delete controls.
import { cn } from "@/client/lib/utils";
import { Input } from "@/client/components/ui/input";
import { NotFound } from "@/client/components/ui/not-found";
import { Skeleton } from "@/client/components/ui/skeleton";
import { MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/client/components/ui/dropdown-menu";
import * as React from "react";
import { ChatTitleReveal } from "./ChatTitleReveal";
import type { ChatSession } from "./types";

export type { ChatSession };

interface ChatListProps {
  chats: ChatSession[];
  onDelete: (id: string) => void | Promise<void>;
  onRename?: (id: string, title: string) => Promise<void>;
  /** When provided, render buttons that call this instead of navigation links */
  onSelect?: (chatId: string) => void;
  /** When true, align item content with header (reduced horizontal padding) */
  compact?: boolean;
  /** When true, hide the agent name line (e.g. for MCP Server Chat where it's not an agent) */
  hideAgentName?: boolean;
  /** When true and chats is empty, show skeleton placeholders instead of empty state */
  isLoading?: boolean;
  /** Highlight the active chat */
  currentChatId?: string;
}

function ChatItemSkeleton({
  compact,
  hideAgentName,
}: {
  compact?: boolean;
  hideAgentName?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3 gap-2",
        compact ? "px-4" : "px-3 rounded-lg"
      )}
    >
      <div
        className={cn(
          "flex-1 min-w-0 flex flex-col gap-1",
          hideAgentName ? "gap-1.5" : "gap-1"
        )}
      >
        <Skeleton className="h-4 w-3/4" />
        {!hideAgentName && <Skeleton className="h-3 w-1/2" />}
      </div>
      <Skeleton className="h-3 w-14 shrink-0" />
    </div>
  );
}

export function ChatList({
  chats,
  onDelete,
  onRename,
  onSelect,
  compact,
  hideAgentName,
  isLoading,
  currentChatId,
}: ChatListProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [editing, setEditing] = React.useState<{ chat: ChatSession; action: "rename" | "delete" } | null>(null);
  const [name, setName] = React.useState(""), [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  function edit(chat: ChatSession, action: "rename" | "delete") {
    setName(chat.title); setError(null); setEditing({ chat, action });
  }
  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      if (editing.action === "rename") await onRename?.(editing.chat.id, name.trim());
      else await onDelete(editing.chat.id);
      setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chat update failed"); }
    finally { setBusy(false); }
  }

  const visibleChats = chats.filter((chat) => chat.type !== "agent_execution");

  const filteredChats = visibleChats.filter((chat) => {
    const title = (chat.title ?? "").toLowerCase();
    return title.includes(searchTerm.toLowerCase());
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();

    const isSameDay = date.toDateString() === now.toDateString();

    if (isSameDay) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isYesterday) {
      return "Yesterday";
    }

    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const renderChatItem = (chat: ChatSession) => (
    <div
      className="flex min-w-0 items-center justify-between gap-2 py-3 pl-3 pr-2"
    >
      <div
        className={cn(
          "flex-1 min-w-0 flex overflow-hidden",
          hideAgentName ? "flex-col" : "flex-col gap-1"
        )}
      >
        <p className="text-sm font-medium truncate w-full">
          <ChatTitleReveal
            key={`${chat.id}:${chat.title}`}
            chatId={chat.id}
            title={chat.title}
          />
        </p>
        {!hideAgentName && (
          <p className="text-xs text-muted-foreground truncate w-full">
            {chat.agent_name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(chat.updated_at)}
        </span>
      </div>
    </div>
  );

  const renderChatList = () => {
    if (isLoading && visibleChats.length === 0) {
      return (
        <div className="space-y-1">
          <ChatItemSkeleton compact={compact} hideAgentName={hideAgentName} />
          <ChatItemSkeleton compact={compact} hideAgentName={hideAgentName} />
          <ChatItemSkeleton compact={compact} hideAgentName={hideAgentName} />
        </div>
      );
    }

    if (visibleChats.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center min-h-[12rem]">
          <NotFound vertical noBorder message="No chats" className="mt-0" />
        </div>
      );
    }

    if (filteredChats.length === 0) {
      return null;
    }

    return (
      <div className="space-y-1">
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            className={cn(
              "flex min-w-0 items-center rounded-lg transition-colors hover:bg-muted/50 focus-within:bg-muted/50 has-[[aria-expanded=true]]:bg-muted/50",
              compact && "mx-2",
              currentChatId === chat.id && "bg-muted/50"
            )}
          >
            {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(chat.id)}
              aria-current={currentChatId === chat.id ? "page" : undefined}
              className="block min-w-0 flex-1 rounded-lg text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {renderChatItem(chat)}
            </button>
          ) : (
            <div className="block min-w-0 flex-1 cursor-pointer">
              {renderChatItem(chat)}
            </div>
            )}
            <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="mr-1 shrink-0 rounded-md" aria-label={`Chat actions for ${chat.title}`}><MoreHorizontal className="size-4" /></Button>} />
              <DropdownMenuContent align="end" className="w-40">
                {onRename && <DropdownMenuItem onSelect={() => edit(chat, "rename")}>Rename</DropdownMenuItem>}
                <DropdownMenuItem variant="destructive" onSelect={() => edit(chat, "delete")}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-4 px-3 sm:px-5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-8 border-gray-300 dark:border-zinc-600"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">{renderChatList()}</div>
      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !busy) setEditing(null); }}>
        <DialogContent><DialogHeader>
          <DialogTitle>{editing?.action === "rename" ? "Rename chat" : "Delete chat?"}</DialogTitle>
          <DialogDescription>{editing?.action === "rename" ? "Choose a name for this conversation." : "This removes the saved conversation and its messages. This cannot be undone."}</DialogDescription>
        </DialogHeader>
          <form onSubmit={confirm} className="space-y-5">
            {editing?.action === "rename" && <div className="space-y-2"><Label htmlFor="chat-name">Chat name</Label><Input id="chat-name" autoFocus value={name} onChange={event => setName(event.target.value)} required maxLength={256} disabled={busy} /></div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant={editing?.action === "delete" ? "destructive" : "default"} disabled={busy || editing?.action === "rename" && !name.trim()}>{editing?.action === "rename" ? "Save name" : "Delete chat"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
