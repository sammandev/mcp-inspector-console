import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readDatabaseUrl } from "./database-url.js";

export interface AccountConfig {
  databaseUrl: string;
  encryptionKey: Buffer;
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  externalOrigin: URL;
}

// Temporarily hardcoded admin account; replace with managed credentials before wider deployment.
const ADMIN_ACCOUNT = { username: "admin", email: "ptb@admin.com", password: "pega#1234" } as const;

export function readAccountConfig(env: NodeJS.ProcessEnv): AccountConfig {
  const databaseUrl = readDatabaseUrl(env);
  const encryptionKey = Buffer.from(env.MCP_INSPECTOR_ENCRYPTION_KEY ?? "", "base64");
  if (encryptionKey.length !== 32) throw new Error("MCP_INSPECTOR_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  const externalOrigin = new URL(env.MCP_INSPECTOR_EXTERNAL_AUTH_URL ?? "http://172.18.220.56:9001");
  if (!["http:", "https:"].includes(externalOrigin.protocol) ||
      externalOrigin.username || externalOrigin.password ||
      externalOrigin.pathname !== "/" || externalOrigin.search || externalOrigin.hash) {
    throw new Error("MCP_INSPECTOR_EXTERNAL_AUTH_URL must be an HTTP(S) origin without credentials");
  }
  return {
    databaseUrl, encryptionKey,
    adminUsername: ADMIN_ACCOUNT.username, adminEmail: ADMIN_ACCOUNT.email,
    adminPassword: ADMIN_ACCOUNT.password, externalOrigin,
  };
}

export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("Invalid encryption key");
  }

  encrypt(identity: string, value: unknown): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(identity));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString("base64");
  }

  decrypt(identity: string, value: string): unknown {
    const data = Buffer.from(value, "base64");
    if (data.length < 28) throw new Error("Invalid encrypted account record");
    const decipher = createDecipheriv("aes-256-gcm", this.key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(identity));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8"));
  }
}
