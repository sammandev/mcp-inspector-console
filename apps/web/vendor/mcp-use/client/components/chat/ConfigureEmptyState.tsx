// Modified for the combined Inspector: explain OpenAI-compatible provider configuration.
import { Key, Settings } from "lucide-react";

import { Button } from "@/client/components/ui/button";

interface ConfigureEmptyStateProps {
  onConfigureClick: () => void;
}

export function ConfigureEmptyState({
  onConfigureClick,
}: ConfigureEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <Key className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">
        Configure Your LLM Provider
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        Configure your OpenAI-compatible endpoint and model to start chatting using the MCP server.
        Sign-in to save your chat history.
      </p>
      <Button
        onClick={onConfigureClick}
        data-testid="chat-configure-api-key-button"
      >
        <Settings className="h-4 w-4 mr-2" />
        Configure Chat
      </Button>
    </div>
  );
}
