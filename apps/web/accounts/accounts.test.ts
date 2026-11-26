import { describe, expect, it } from "vitest";
import { SecretBox, readAccountConfig } from "./config.js";
import { ExternalAuthenticator } from "./auth.js";
import { readDatabaseUrl } from "./database-url.js";

describe("account secrets", () => {
  it("constructs the SQL field connection without interpreting password delimiters as URL syntax", () => {
    const value = readDatabaseUrl({
      DATABASE_URL: "${SQL_USER}:${SQL_PASSWORD}",
      SQL_HOST: "localhost", SQL_PORT: "5432", SQL_DATABASE: "fixture",
      SQL_USER: "fixture-user", SQL_PASSWORD: "fixture#@/password",
    });
    const url = new URL(value);
    expect(url.hostname).toBe("localhost");
    expect(decodeURIComponent(url.password)).toBe("fixture#@/password");
    expect(url.pathname).toBe("/fixture");
  });
  it("binds ciphertext to its account and detects modification", () => {
    const box = new SecretBox(Buffer.alloc(32, 7));
    const encrypted = box.encrypt("alice:provider", { apiKey: "fixture-private-key" });
    expect(encrypted).not.toContain("fixture-private-key");
    expect(box.decrypt("alice:provider", encrypted)).toEqual({ apiKey: "fixture-private-key" });
    expect(() => box.decrypt("bob:provider", encrypted)).toThrow();
    expect(() => new SecretBox(Buffer.alloc(32, 8)).decrypt("alice:provider", encrypted)).toThrow();
  });

  it("rejects incomplete server configuration instead of falling back", () => {
    expect(() => readAccountConfig({})).toThrow(/DATABASE_URL/);
    expect(() => readAccountConfig({
      DATABASE_URL: "postgresql://localhost/fixture",
      MCP_INSPECTOR_ENCRYPTION_KEY: "short",
    })).toThrow(/ENCRYPTION_KEY/);
  });
});

describe("external authentication", () => {
  it("returns an OTP challenge without treating HTTP success as authenticated", async () => {
    const auth = new ExternalAuthenticator(new URL("https://auth.example"), async () =>
      Response.json({ otp_required: true, email: "fixture@example.test" }));
    expect(await auth.login("fixture", "password")).toEqual({
      otpRequired: true, email: "fixture@example.test",
    });
  });

  it("uses token2, verifies the access token, then reads the account at the slash-terminated path", async () => {
    const calls: string[] = [];
    const auth = new ExternalAuthenticator(new URL("https://auth.example"), async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith("/token2/")) {
        expect(JSON.parse(String(init?.body))).toEqual({ username: "fixture", password: "password" });
        return Response.json({ access: "fixture-access", refresh: "fixture-refresh" }, { status: 201 });
      }
      if (String(url).endsWith("/token/verify/")) {
        expect(JSON.parse(String(init?.body))).toEqual({ token: "fixture-access" });
        return Response.json({});
      }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-access");
      return Response.json({ id: 47, username: "fixture", email: "fixture@example.test", is_active: true });
    });
    expect(await auth.login("fixture", "password")).toMatchObject({
      otpRequired: false, identity: "47", username: "fixture",
    });
    expect(calls).toEqual([
      "https://auth.example/api/user/token2/",
      "https://auth.example/api/user/token/verify/",
      "https://auth.example/api/user/account/info/",
    ]);
  });

  it("refreshes a rejected access token before reading the account", async () => {
    const calls: string[] = [];
    const auth = new ExternalAuthenticator(new URL("https://auth.example"), async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      if (path === "/api/user/token2/") return Response.json({ access: "stale", refresh: "fixture-refresh" });
      if (path === "/api/user/token/verify/") {
        return Response.json({ detail: "Token is invalid or expired", code: "token_not_valid" }, { status: 401 });
      }
      if (path === "/api/user/token/refresh/") {
        expect(JSON.parse(String(init?.body))).toEqual({ refresh: "fixture-refresh" });
        return Response.json({ access: "fresh" });
      }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh");
      return Response.json({ id: 47, username: "fixture", is_active: true });
    });
    expect(await auth.login("fixture", "password")).toMatchObject({ identity: "47" });
    expect(calls).toEqual(["/api/user/token2/", "/api/user/token/verify/", "/api/user/token/refresh/", "/api/user/account/info/"]);

    const expired = new ExternalAuthenticator(new URL("https://auth.example"), async (url) =>
      String(url).endsWith("/token2/")
        ? Response.json({ access: "stale", refresh: "stale" })
        : Response.json({ code: "token_not_valid" }, { status: 401 }));
    await expect(expired.login("fixture", "password")).rejects.toMatchObject({ status: 401 });
  });

  it("treats an unknown external user (404) as rejected credentials, not an outage", async () => {
    const auth = new ExternalAuthenticator(new URL("https://auth.example"), async () =>
      Response.json({ error: "User does not exist" }, { status: 404 }));
    await expect(auth.login("nobody", "password")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects inactive accounts and incomplete token responses", async () => {
    const inactive = new ExternalAuthenticator(new URL("https://auth.example"), async (url) =>
      String(url).endsWith("/token2/")
        ? Response.json({ access: "fixture-access", refresh: "fixture-refresh" })
        : String(url).endsWith("/verify/") ? Response.json({})
        : Response.json({ id: 47, username: "fixture", is_active: false }));
    await expect(inactive.login("fixture", "password")).rejects.toMatchObject({ status: 401 });
    const incomplete = new ExternalAuthenticator(new URL("https://auth.example"), async () => Response.json({ access: "x" }));
    await expect(incomplete.login("fixture", "password")).rejects.toMatchObject({ status: 502 });
  });

  it("verifies OTP using the challenge username and rejects redirects", async () => {
    const auth = new ExternalAuthenticator(new URL("https://auth.example"), async (url, init) => {
      expect(init?.redirect).toBe("error");
      if (String(url).endsWith("/otp/")) {
        expect(JSON.parse(String(init?.body))).toEqual({ username: "fixture", otp: "123456" });
        return Response.json({ access: "fixture-access", refresh: "fixture-refresh" });
      }
      return Response.json({ id: 47, username: "fixture", is_active: true });
    });
    expect(await auth.verifyOtp("fixture", "123456")).toMatchObject({ identity: "47" });
  });
});
