// Modified for the combined Inspector: add prompt-argument completion controls.
import type { Prompt } from "@mcp-use/client/react";
import { useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";

interface PromptInputFormProps {
  selectedPrompt: Prompt;
  promptArgs: Record<string, unknown>;
  onArgChange: (key: string, value: any) => void;
  onCompleteArgument?: (key: string, value: string) => Promise<string[]>;
}

export function PromptInputForm({
  selectedPrompt,
  promptArgs,
  onArgChange,
  onCompleteArgument,
}: PromptInputFormProps) {
  const [completions, setCompletions] = useState<Record<string, string[]>>({});
  const [completionErrors, setCompletionErrors] = useState<Record<string, string>>({});
  const [completingArgument, setCompletingArgument] = useState<string | null>(null);
  const arguments_ = selectedPrompt?.arguments || [];
  const hasInputs = arguments_.length > 0;

  if (!hasInputs) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400 text-sm">
        No arguments required
      </div>
    );
  }

  const renderInputField = (arg: any) => {
    const key = arg.name;
    const value = promptArgs[key];
    const stringValue = typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : JSON.stringify(value);

    if (arg.type === "boolean") {
      return (
        <div key={key} className="space-y-2">
          <div>
            <Label htmlFor={key} className="text-sm font-medium">
              {key}
              {arg.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {arg.description && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {arg.description}
              </p>
            )}
          </div>
          <input
            id={key}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onArgChange(key, e.target.checked)}
            className="rounded"
            aria-label={`Toggle ${key}`}
          />
        </div>
      );
    }

    if (arg.type === "number") {
      return (
        <div key={key} className="space-y-2">
          <div>
            <Label htmlFor={key} className="text-sm font-medium">
              {key}
              {arg.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {arg.description && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {arg.description}
              </p>
            )}
          </div>
          <Input
            id={key}
            type="number"
            value={Number(value) || 0}
            onChange={(e) => onArgChange(key, Number(e.target.value))}
            placeholder={`Enter ${key}`}
          />
        </div>
      );
    }

    if (arg.type === "array" || arg.type === "object") {
      return (
        <div key={key} className="space-y-2">
          <div>
            <Label htmlFor={key} className="text-sm font-medium">
              {key}
              {arg.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {arg.description && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {arg.description}
              </p>
            )}
          </div>
          <Textarea
            id={key}
            value={stringValue}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onArgChange(key, parsed);
              } catch {
                onArgChange(key, e.target.value);
              }
            }}
            placeholder={`Enter ${key} as JSON`}
            className="font-mono text-sm min-h-[100px]"
          />
        </div>
      );
    }

    return (
      <div key={key} className="space-y-2">
        <div>
          <Label htmlFor={key} className="text-sm font-medium">
            {key}
            {arg.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {arg.description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {arg.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            id={key}
            data-testid={`prompt-param-${key}`}
            value={stringValue}
            onChange={(e) => {
              setCompletions((current) => ({ ...current, [key]: [] }));
              setCompletionErrors((current) => ({ ...current, [key]: "" }));
              onArgChange(key, e.target.value);
            }}
            placeholder={`Enter ${key}`}
          />
          {onCompleteArgument && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Complete ${key}`}
              disabled={completingArgument !== null}
              onClick={async () => {
                setCompletingArgument(key);
                setCompletionErrors((current) => ({ ...current, [key]: "" }));
                try {
                  const values = await onCompleteArgument(key, stringValue);
                  setCompletions((current) => ({ ...current, [key]: values }));
                } catch (error) {
                  setCompletionErrors((current) => ({
                    ...current,
                    [key]: error instanceof Error ? error.message : String(error),
                  }));
                } finally {
                  setCompletingArgument(null);
                }
              }}
            >
              {completingArgument === key ? "Completing..." : "Complete"}
            </Button>
          )}
        </div>
        {completionErrors[key] && (
          <p role="alert" className="text-sm text-destructive">{completionErrors[key]}</p>
        )}
        {completions[key]?.length > 0 && (
          <div aria-label={`${key} completions`} className="flex flex-wrap gap-2">
            {completions[key].map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onArgChange(key, suggestion);
                  setCompletions((current) => ({ ...current, [key]: [] }));
                }}
              >
                Use {suggestion}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {arguments_.map((arg) => renderInputField(arg))}
    </div>
  );
}
