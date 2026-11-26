import { createHash, getRandomValues } from "node:crypto";
import { describe, expect, it } from "vitest";
import { installInsecureContextCrypto } from "./insecure-context-crypto";

function insecureCrypto(): Crypto {
  return { getRandomValues } as unknown as Crypto;
}

describe("insecure-context crypto shim", () => {
  it("adds RFC 4122 v4 randomUUID from getRandomValues", () => {
    const crypto = insecureCrypto();
    installInsecureContextCrypto(crypto);
    const ids = new Set(Array.from({ length: 50 }, () => crypto.randomUUID()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("adds a SHA-256 digest matching Node for every block-boundary length", async () => {
    const crypto = insecureCrypto();
    installInsecureContextCrypto(crypto);
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const data = new Uint8Array(length).map((_, index) => (index * 31 + 7) & 0xff);
      const digest = await crypto.subtle.digest("SHA-256", data);
      expect(Buffer.from(digest).toString("hex")).toBe(createHash("sha256").update(data).digest("hex"));
    }
    const view = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);
    const fromBuffer = await crypto.subtle.digest({ name: "sha-256" }, view.buffer.slice(1, 4));
    expect(Buffer.from(fromBuffer).toString("hex")).toBe(createHash("sha256").update(Buffer.from([1, 2, 3])).digest("hex"));
    expect(Buffer.from(await crypto.subtle.digest("SHA-256", view)).toString("hex"))
      .toBe(createHash("sha256").update(Buffer.from([1, 2, 3])).digest("hex"));
  });

  it("rejects unsupported operations so callers fall back as they do without subtle", async () => {
    const crypto = insecureCrypto();
    installInsecureContextCrypto(crypto);
    await expect(crypto.subtle.digest("SHA-1", new Uint8Array())).rejects.toThrow(/not supported/);
    await expect(crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"])).rejects.toThrow(/not supported/);
  });

  it("leaves native secure-context implementations untouched", () => {
    const subtle = {} as SubtleCrypto;
    const randomUUID = () => "native" as `${string}-${string}-${string}-${string}-${string}`;
    const crypto = { getRandomValues, subtle, randomUUID } as unknown as Crypto;
    installInsecureContextCrypto(crypto);
    expect(crypto.subtle).toBe(subtle);
    expect(crypto.randomUUID).toBe(randomUUID);
  });
});
