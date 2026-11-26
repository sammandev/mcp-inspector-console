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

  it("uses token2 and validates the active account after a 201 token response", async () => {
    const auth = new ExternalAuthenticator(new URL("https://auth.example"), async (url, init) => {
      if (String(url).endsWith("/token2/")) {
        expect(JSON.parse(String(init?.body))).toEqual({ username: "fixture", password: "password" });
        return Response.json({ access: "fixture-access", refresh: "fixture-refresh" }, { status: 201 });
      }
      expect(String(url)).toBe("https://auth.example/api/user/account/info");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-access");
      return Response.json({ id: 47, username: "fixture", email: "fixture@example.test", is_active: true });
    });
    expect(await auth.login("fixture", "password")).toMatchObject({
      otpRequired: false, identity: "47", username: "fixture",
    });
  });

  it("rejects inactive accounts and incomplete token responses", async () => {
    const inactive = new ExternalAuthenticator(new URL("https://auth.example"), async (url) =>
      String(url).endsWith("/token2/")
        ? Response.json({ access: "fixture-access", refresh: "fixture-refresh" })
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
