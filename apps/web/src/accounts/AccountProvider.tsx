import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountClient, clearAccountBrowserState, loginSchema, okSchema, sessionSchema, type BrowserSession } from "./api.js";
import { clearRpcLogs } from "@mcp-use/client/react";
import { networkStore } from "../features/network.js";
import { rpcTrafficStore } from "../../vendor/mcp-use/client/rpc-traffic-store.js";
import { toast } from "sonner";

interface AccountContext {
  session: BrowserSession | null;
  client: AccountClient | null;
  /** Aborted whenever the signed-in identity changes, including guest to account. */
  workspaceSignal: AbortSignal;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<{ email: string } | null>;
  verifyOtp: (otp: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<AccountContext | null>(null);
export function useOptionalAccount(): AccountContext | null { return useContext(Context); }
export function useAccount(): AccountContext {
  const value = useOptionalAccount();
  if (!value) throw new Error("AccountProvider is required");
  return value;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useRef(new AbortController());
  const [workspaceSignal, setWorkspaceSignal] = useState(() => lifetime.current.signal);
  const previousSession = useRef<BrowserSession | null>(null);
  const revision = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const client = useMemo(() => session ? new AccountClient(session.id, lifetime.current.signal) : null, [session]);

  function replace(next: BrowserSession | null) {
    revision.current++;
    const previous = previousSession.current;
    previousSession.current = next;
    // Only an identity change ends the workspace, so guest turns survive no-op session checks.
    if (previous?.id !== next?.id) {
      lifetime.current.abort();
      lifetime.current = new AbortController();
      setWorkspaceSignal(lifetime.current.signal);
      networkStore.clear();
      clearRpcLogs();
      rpcTrafficStore.clear();
    }
    setSession(next);
    if (previous && previous.id !== next?.id) {
      try { clearAccountBrowserState(previous.id); }
      catch (cause) {
        console.error("Could not clear browser account caches");
        toast.error(cause instanceof Error ? cause.message : "Could not clear browser account caches");
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      const expected = revision.current;
      try {
        const fresh = await new AccountClient("", controller.signal).request("me", sessionSchema.nullable());
        if (controller.signal.aborted || expected !== revision.current) return;
        replace(fresh); setError(null);
      } catch (cause) {
        if (controller.signal.aborted || expected !== revision.current) return;
        replace(null); setError(cause instanceof Error ? cause.message : "Could not check account session");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void check();
    const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("inspector-account") : null;
    channel.current = broadcast;
    if (broadcast) broadcast.onmessage = () => { replace(null); void check(); };
    return () => { controller.abort(); lifetime.current.abort(); broadcast?.close(); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timeout = setTimeout(() => { replace(null); setError("Your session expired. Sign in again."); }, Math.max(1, session.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [session]);

  async function login(username: string, password: string) {
    const result = await new AccountClient("", lifetime.current.signal).request("login", loginSchema, "POST", { username, password });
    if ("otpRequired" in result) return { email: result.email };
    replace(result); setError(null); channel.current?.postMessage("changed");
    return null;
  }
  async function verifyOtp(otp: string) {
    const result = await new AccountClient("", lifetime.current.signal).request("otp", sessionSchema, "POST", { otp });
    replace(result); setError(null); channel.current?.postMessage("changed");
  }
  async function logout() {
    if (!session) return;
    const original = session;
    replace(null);
    try {
      await new AccountClient(original.id, new AbortController().signal).request("logout", okSchema, "POST", {});
      setError(null); channel.current?.postMessage("changed");
    } catch (cause) {
      setError("Sign out could not be confirmed by the server. Retry when account storage is available.");
      throw cause;
    }
  }
  return <Context.Provider value={{ session, client, workspaceSignal, loading, error, login, verifyOtp, logout }}>{children}</Context.Provider>;
}
