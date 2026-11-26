export function readDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database scheme");
      return url.href;
    } catch {
      if (!env.SQL_HOST || !env.SQL_USER || !env.SQL_DATABASE || env.SQL_PASSWORD === undefined) {
        throw new Error("DATABASE_URL is invalid; provide a PostgreSQL URL or complete SQL_HOST/SQL_USER/SQL_PASSWORD/SQL_DATABASE settings");
      }
    }
  }
  if (!env.SQL_HOST || !env.SQL_USER || !env.SQL_DATABASE || env.SQL_PASSWORD === undefined) {
    throw new Error("DATABASE_URL or complete SQL_* database settings are required");
  }
  const port = Number(env.SQL_PORT || "5432");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SQL_PORT is invalid");
  let url: URL;
  try { url = new URL(`postgresql://${env.SQL_HOST}:${port}`); } catch { throw new Error("SQL_HOST is invalid"); }
  if (url.username || url.password || url.pathname !== "" && url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SQL_HOST must be a hostname or IP address without credentials or a path");
  }
  url.username = env.SQL_USER;
  url.password = env.SQL_PASSWORD;
  url.pathname = `/${encodeURIComponent(env.SQL_DATABASE)}`;
  console.info("Inspector database configuration uses the SQL_* fields");
  return url.href;
}
