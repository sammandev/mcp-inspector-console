import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { readDatabaseUrl } from "./database-url.ts";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);
if (process.argv.includes("--generate-key")) {
  if (process.env.MCP_INSPECTOR_ENCRYPTION_KEY) throw new Error("Encryption key already exists; do not overwrite it");
  await appendFile(envPath, `\nMCP_INSPECTOR_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`);
  console.log("Generated an encryption key in the ignored root .env. Back it up securely.");
} else {
  const client = new pg.Client({ connectionString: readDatabaseUrl(process.env), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query(await readFile(new URL("./migrations/001-accounts.sql", import.meta.url), "utf8"));
    console.log("Inspector account schema is ready.");
  } catch {
    console.error("Account migration failed. Check connectivity and database permissions; credentials have not been logged.");
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
