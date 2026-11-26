// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:5173/mcp/inspector/sign-in"}
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { AccountProvider, useAccount } from "./AccountProvider.js";
import { SignInPage } from "./SignInPage.js";
import { accountInitials } from "./AccountMenu.js";
import { ThemeProvider } from "@/client/context/ThemeContext";
import { rpcTrafficStore } from "../../vendor/mcp-use/client/rpc-traffic-store.js";

function renderPage() {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  return render(<MemoryRouter><ThemeProvider defaultTheme="dark"><AccountProvider><SignInPage /></AccountProvider></ThemeProvider></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("account avatar initials", () => {
  it("uses the first character of up to two username words", () => {
    expect(["admin", "test_bca", "admin_001", "Admin TBA"].map(accountInitials)).toEqual(["A", "TB", "A0", "AT"]);
  });
});
describe("Inspector sign-in page", () => {
  it("does not let an older session check overwrite a completed sign in", async () => {
    let finishCheck!: (response: Response) => void;
    const pendingCheck = new Promise<Response>(resolve => { finishCheck = resolve; });
    const session = { id: "new-session", expiresAt: Date.now() + 60000, user: { id: "user", username: "fixture", email: "", kind: "admin" } };
    vi.stubGlobal("fetch", async (url: string) => url.endsWith("/me") ? pendingCheck : Response.json(session));
    function Controls() {
      const account = useAccount();
      return <><p>{account.session?.user.username ?? "Anonymous"}</p><button onClick={() => void account.login("fixture", "fixture")}>Authenticate</button></>;
    }
    render(<AccountProvider><Controls /></AccountProvider>);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("fixture");
    await act(async () => { finishCheck(Response.json(null)); await pendingCheck; });
    expect(screen.getByText("fixture")).toBeTruthy();
    expect(screen.queryByText("Anonymous")).toBeNull();
  });
  it("ends the guest workspace and its protocol history when a user signs in", async () => {
    const session = { id: "new-session", expiresAt: Date.now() + 60000, user: { id: "user", username: "fixture", email: "", kind: "admin" } };
    vi.stubGlobal("fetch", async (url: string) => Response.json(url.endsWith("/me") ? null : session));
    let guestSignal: AbortSignal | undefined;
    function Controls() {
      const account = useAccount();
      if (!account.session && !account.loading) guestSignal ??= account.workspaceSignal;
      return <><p>{account.session?.user.username ?? (account.loading ? "Checking" : "Anonymous")}</p>
        <button onClick={() => void account.login("fixture", "fixture")}>Authenticate</button></>;
    }
    render(<AccountProvider><Controls /></AccountProvider>);
    await screen.findByText("Anonymous");
    expect(guestSignal?.aborted).toBe(false);
    rpcTrafficStore.publish({ source: "mcp", serverId: "shared", direction: "send", timestamp: new Date().toISOString(), message: { id: 1, method: "guest/private" } });
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("fixture");
    expect(guestSignal?.aborted).toBe(true);
    expect(rpcTrafficStore.getSnapshot()).toEqual([]);
  });
  it("clears only the departing account's OAuth, retry, and prompt caches on sign out", async () => {
    const session = { id: "session-one", expiresAt: Date.now() + 60000, user: { id: "user", username: "fixture", email: "", kind: "admin" } };
    vi.stubGlobal("fetch", async (url: string) => Response.json(url.endsWith("/me") ? session : { ok: true }));
    function Controls() {
      const account = useAccount();
      return <button disabled={!account.session} onClick={() => void account.logout()}>Sign out</button>;
    }
    render(<AccountProvider><Controls /></AccountProvider>);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    const oauth = "mcp:inspector-account:session-one_hash_tokens";
    const prompt = "mcp-inspector-system-prompt:inspector-account:session-one:server";
    const retry = "__mcpUseInspectorPendingChatTurn:inspector-account%3Asession-one%3Aserver:chat";
    localStorage.setItem(oauth, "fixture"); localStorage.setItem(prompt, "fixture"); sessionStorage.setItem(retry, "fixture");
    localStorage.setItem("mcp:auth_hash_tokens", "anonymous-fixture");
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(localStorage.getItem(oauth)).toBeNull());
    expect(localStorage.getItem(prompt)).toBeNull();
    expect(sessionStorage.getItem(retry)).toBeNull();
    expect(localStorage.getItem("mcp:auth_hash_tokens")).toBe("anonymous-fixture");
    localStorage.removeItem("mcp:auth_hash_tokens");
  });
  it("uses one sign-in form and exposes rejected login errors", async () => {
    vi.stubGlobal("fetch", async (url: string) => url.endsWith("/me")
      ? Response.json(null) : Response.json({ error: "Invalid username or password" }, { status: 401 }));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Username or email")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "External account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue without an account" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "fixture" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Invalid username or password"));
  });
  it("shows an OTP form rather than granting access to a challenged login", async () => {
    vi.stubGlobal("fetch", async (url: string) => url.endsWith("/me")
      ? Response.json(null) : Response.json({ otpRequired: true, email: "fixture@example.test", expiresIn: 300 }));
    renderPage();
    fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "fixture" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByLabelText("Verification code")).toBeTruthy());
    expect(screen.getByText(/fixture@example.test/)).toBeTruthy();
  });
});
