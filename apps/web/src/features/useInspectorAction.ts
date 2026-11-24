import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Action<T> = (signal: AbortSignal) => Promise<T> | T;

export function useInspectorAction(isActive: boolean) {
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>();

  const cancel = useCallback(() => {
    const controller = pending.current;
    pending.current = null;
    controller?.abort();
    setBusy(false);
    setError("");
    setResult(undefined);
  }, []);

  const run = useCallback(async <T,>(action: Action<T>): Promise<T | undefined> => {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const value = await action(controller.signal);
      if (pending.current === controller) setResult(value);
      return pending.current === controller ? value : undefined;
    } catch (failure) {
      if (pending.current === controller) {
        const message = controller.signal.aborted
          ? "Request cancelled"
          : failure instanceof Error ? failure.message : String(failure);
        setError(message);
        toast.error(message);
      }
      return undefined;
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive) cancel();
  }, [cancel, isActive]);

  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  return { run, cancel, busy, error, result };
}
