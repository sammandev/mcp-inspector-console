import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Eye, EyeOff, KeyRound, MessageSquare, Server } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { useAccount } from "./AccountProvider.js";
import { safeReturnPath } from "./api.js";

export function SignInPage() {
  const account = useAccount();
  const navigate = useNavigate(), location = useLocation();
  const returnTo = safeReturnPath(new URLSearchParams(location.search).get("returnTo"));
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [otp, setOtp] = useState(""), [challenge, setChallenge] = useState<{ email: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    document.title = "Inspector | Sign in";
    if (account.session) navigate(returnTo.replace(/^\/mcp\/inspector/, "") || "/", { replace: true });
  }, [account.session, navigate, returnTo]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (challenge) await account.verifyOtp(otp);
      else { const result = await account.login(username, password); setPassword(""); if (result) setChallenge(result); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed"); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-background text-foreground">
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-6 py-12 md:grid-cols-2">
      <section className="hidden space-y-8 md:block">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">Keep your work.<br /><span className="text-muted-foreground">Pick up where you left off.</span></h1>
        <p className="max-w-sm text-sm leading-7 text-muted-foreground">One account for your conversations, provider settings, and MCP connections.</p>
        <div className="space-y-5 text-sm">
          {[{ icon: MessageSquare, title: "Your conversations", detail: "Continue, rename, or delete saved chats." },
            { icon: KeyRound, title: "Protected API keys", detail: "Encrypted storage. Keys stay on the server." },
            { icon: Server, title: "Your MCP connections", detail: "Restore your server configurations when you return." }].map(({ icon: Icon, title, detail }) =>
              <div key={title} className="flex items-start gap-3"><span className="rounded-xl border border-border p-2.5"><Icon className="size-4" /></span><div><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></div>)}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="mb-6"><h2 className="text-2xl font-semibold tracking-tight">{challenge ? "Check your email" : "Sign in"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{challenge ? `Enter the verification code sent to ${challenge.email || "your email"}. The code expires in five minutes.` : "Save and restore your workspace."}</p></div>
        <form onSubmit={submit} className="space-y-5">
          {challenge ? <div className="space-y-2"><Label htmlFor="login-otp">Verification code</Label><Input id="login-otp" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} required disabled={busy} onChange={event => setOtp(event.target.value)} /></div>
            : <><div className="space-y-2"><Label htmlFor="login-username">Username or email</Label><Input id="login-username" autoComplete="username" required disabled={busy} value={username} onChange={event => setUsername(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="login-password">Password</Label><div className="relative"><Input id="login-password" className="pr-11" type={visible ? "text" : "password"} autoComplete="current-password" value={password} required disabled={busy} onChange={event => setPassword(event.target.value)} />
                <button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground focus-visible:outline-2">{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div></>}
          {(error || account.error) && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error || account.error}</p>}
          <Button type="submit" size="lg" className="w-full rounded-full" loading={busy} disabled={account.loading}>{busy ? "Signing in..." : challenge ? "Verify code" : "Sign in"}</Button>
        </form>
        {challenge && <Button variant="ghost" size="lg" className="mt-3 w-full rounded-full" disabled={busy} onClick={() => { setChallenge(null); setOtp(""); setError(null); }}>Back to sign in / resend code</Button>}
        {!challenge && <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" size="lg" className="w-full rounded-full" disabled={busy} onClick={() => navigate("/")}>Continue without an account</Button>
        </>}
      </section>
    </main>
  </div>;
}
