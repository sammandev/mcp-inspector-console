export class AccountError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface ExternalIdentity {
  otpRequired: false;
  identity: string;
  username: string;
  email: string;
}

export type ExternalLogin = ExternalIdentity | { otpRequired: true; email: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountError(502, "Authentication service returned an invalid response");
  }
  return value as Record<string, unknown>;
}

export class ExternalAuthenticator {
  constructor(
    private readonly origin: URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, body?: unknown, access?: string): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.origin), {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AccountError(503, "Authentication service is unavailable or timed out");
    }
    if (response.status === 429) throw new AccountError(429, "Too many attempts. Please wait before trying again.");
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new AccountError(401, "Credentials or verification code were rejected");
    }
    if (response.status !== 200 && response.status !== 201) {
      throw new AccountError(502, "Authentication service is unavailable");
    }
    try {
      return object(await response.json());
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(502, "Authentication service returned invalid JSON");
    }
  }

  private async identity(tokens: Record<string, unknown>): Promise<ExternalIdentity> {
    if (typeof tokens.access !== "string" || !tokens.access ||
        typeof tokens.refresh !== "string" || !tokens.refresh) {
      throw new AccountError(502, "Authentication service returned incomplete tokens");
    }
    const user = await this.request("/api/user/account/info", undefined, tokens.access);
    if (user.is_active !== true || typeof user.username !== "string" || !user.username ||
        (typeof user.id !== "number" && typeof user.id !== "string")) {
      throw new AccountError(401, "No active external account was found");
    }
    return {
      otpRequired: false, identity: String(user.id), username: user.username,
      email: typeof user.email === "string" ? user.email : "",
    };
  }

  async login(username: string, password: string): Promise<ExternalLogin> {
    const result = await this.request("/api/user/token2/", { username, password });
    if (result.otp_required === true) {
      return { otpRequired: true, email: typeof result.email === "string" ? result.email : "" };
    }
    return this.identity(result);
  }

  async verifyOtp(username: string, otp: string): Promise<ExternalIdentity> {
    return this.identity(await this.request("/api/user/otp/", { username, otp }));
  }
}
