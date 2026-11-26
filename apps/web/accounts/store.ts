import { randomUUID, randomBytes, createHash } from "node:crypto";
import { Pool } from "pg";
import { SecretBox } from "./config.js";
import { AccountError } from "./auth.js";
import type { AccountSession, AccountUser } from "./contracts.js";

export const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");
export type RecordKind = "chat" | "provider" | "connections";

export class AccountStore {
  readonly pool: Pool;
  private readonly box: SecretBox;
  private closed = false;
  constructor(databaseUrl: string, key: Buffer) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
    this.pool.on("error", () => console.error("Inspector account database connection failed"));
    this.box = new SecretBox(key);
  }
  async user(kind: AccountUser["kind"], identity: string, username: string, email: string): Promise<AccountUser> {
    const result = await this.pool.query<AccountUser>(
      `INSERT INTO inspector_account_users(id,kind,identity,username,email) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(kind,identity) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email
       RETURNING id,kind,username,email`, [randomUUID(), kind, identity, username, email]);
    return result.rows[0]!;
  }
  async createSession(user: AccountUser): Promise<{ token: string; session: AccountSession }> {
    const token = randomBytes(32).toString("base64url");
    const session = { id: randomUUID(), user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
    await this.pool.query(
      `INSERT INTO inspector_account_sessions(id,token_hash,user_id,expires_at) VALUES($1,$2,$3,$4)`,
      [session.id, tokenHash(token), user.id, new Date(session.expiresAt)]);
    return { token, session };
  }
  async session(token: string): Promise<AccountSession | null> {
    const result = await this.pool.query<{ id: string; user: AccountUser; expiresAt: Date }>(
      `SELECT s.id,json_build_object('id',u.id,'kind',u.kind,'username',u.username,'email',u.email) AS "user",
       s.expires_at AS "expiresAt" FROM inspector_account_sessions s
       JOIN inspector_account_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
      [tokenHash(token)]);
    const row = result.rows[0];
    return row ? { id: row.id, user: row.user, expiresAt: row.expiresAt.getTime() } : null;
  }
  async revoke(session: AccountSession): Promise<void> {
    await this.pool.query("DELETE FROM inspector_account_sessions WHERE id=$1 AND user_id=$2", [session.id, session.user.id]);
  }
  async list(session: AccountSession, kind: RecordKind): Promise<unknown[]> {
    const result = await this.pool.query<{ id: string; encrypted_value: string }>(
      `SELECT r.id,r.encrypted_value FROM inspector_account_records r JOIN inspector_account_sessions s ON s.user_id=r.user_id
       WHERE r.user_id=$1 AND r.kind=$2 AND s.id=$3 AND s.expires_at>now() ORDER BY r.id`,
      [session.user.id, kind, session.id]);
    return result.rows.map(row => this.box.decrypt(`${session.user.id}:${kind}:${row.id}`, row.encrypted_value));
  }
  async get(session: AccountSession, kind: RecordKind, id: string): Promise<unknown | null> {
    const result = await this.pool.query<{ encrypted_value: string }>(
      `SELECT r.encrypted_value FROM inspector_account_records r JOIN inspector_account_sessions s ON s.user_id=r.user_id
       WHERE r.user_id=$1 AND r.kind=$2 AND r.id=$3 AND s.id=$4 AND s.expires_at>now()`,
      [session.user.id, kind, id, session.id]);
    return result.rows[0] ? this.box.decrypt(`${session.user.id}:${kind}:${id}`, result.rows[0].encrypted_value) : null;
  }
  async write(session: AccountSession, kind: RecordKind, id: string, value: unknown): Promise<void> {
    const encrypted = this.box.encrypt(`${session.user.id}:${kind}:${id}`, value);
    const result = await this.pool.query(
      `INSERT INTO inspector_account_records(user_id,kind,id,encrypted_value)
       SELECT user_id,$2,$3,$4 FROM inspector_account_sessions WHERE user_id=$1 AND id=$5 AND expires_at>now()
       ON CONFLICT(user_id,kind,id) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value`,
      [session.user.id, kind, id, encrypted, session.id]);
    if (!result.rowCount) throw new AccountError(401, "Your session has expired");
  }
  async mutate(session: AccountSession, kind: RecordKind, id: string, update: (previous: unknown | null) => unknown): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const valid = await client.query(
        `SELECT u.id FROM inspector_account_users u JOIN inspector_account_sessions s ON s.user_id=u.id
         WHERE u.id=$1 AND s.id=$2 AND s.expires_at>now() FOR UPDATE OF u FOR SHARE OF s`, [session.user.id, session.id]);
      if (!valid.rowCount) throw new AccountError(401, "Your session has expired");
      const old = await client.query<{ encrypted_value: string }>(
        "SELECT encrypted_value FROM inspector_account_records WHERE user_id=$1 AND kind=$2 AND id=$3",
        [session.user.id, kind, id]);
      const identity = `${session.user.id}:${kind}:${id}`;
      const value = update(old.rows[0] ? this.box.decrypt(identity, old.rows[0].encrypted_value) : null);
      await client.query(
        `INSERT INTO inspector_account_records(user_id,kind,id,encrypted_value) VALUES($1,$2,$3,$4)
         ON CONFLICT(user_id,kind,id) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value`,
        [session.user.id, kind, id, this.box.encrypt(identity, value)]);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async delete(session: AccountSession, kind: RecordKind, id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const valid = await client.query(
        `SELECT u.id FROM inspector_account_users u JOIN inspector_account_sessions s ON s.user_id=u.id
         WHERE u.id=$1 AND s.id=$2 AND s.expires_at>now() FOR UPDATE OF u FOR SHARE OF s`,
        [session.user.id, session.id]);
      if (!valid.rowCount) throw new AccountError(401, "Your session has expired");
      const result = await client.query(
        "DELETE FROM inspector_account_records WHERE user_id=$1 AND kind=$2 AND id=$3",
        [session.user.id, kind, id]);
      if (!result.rowCount) throw new AccountError(404, "Saved item was not found");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async challenge(username: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const hash = tokenHash(token);
    await this.pool.query("DELETE FROM inspector_account_otp WHERE expires_at<=now()");
    await this.pool.query(
      "INSERT INTO inspector_account_otp(token_hash,encrypted_value,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
      [hash, this.box.encrypt(`otp:${hash}`, { username })]);
    return token;
  }
  async attempt(token: string): Promise<string> {
    const hash = tokenHash(token);
    const result = await this.pool.query<{ encrypted_value: string }>(
      `UPDATE inspector_account_otp SET attempts=attempts+1
       WHERE token_hash=$1 AND expires_at>now() AND attempts<5 RETURNING encrypted_value`, [hash]);
    if (!result.rows[0]) throw new AccountError(401, "Verification expired or too many attempts. Sign in again.");
    const value = this.box.decrypt(`otp:${hash}`, result.rows[0].encrypted_value);
    if (!value || typeof value !== "object" || !("username" in value) || typeof value.username !== "string") {
      throw new Error("Invalid stored OTP challenge");
    }
    return value.username;
  }
  async consumeChallenge(token: string): Promise<void> {
    const result = await this.pool.query("DELETE FROM inspector_account_otp WHERE token_hash=$1 AND expires_at>now()", [tokenHash(token)]);
    if (!result.rowCount) throw new AccountError(401, "Verification already used or expired");
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}
