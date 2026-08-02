import { createClient } from "~/lib/supabase/server";

export interface TenantSession {
  userId: string;
  email: string | null;
  /** Null until the user belongs to a workspace. */
  orgId: string | null;
  orgRole: string | null;
  /** Null on the first token of a session, until the device row is registered. */
  deviceId: string | null;
}

/**
 * The caller's verified session and tenant claims.
 *
 * getUser() re-validates the token with the auth server. getSession() would be
 * faster but only decodes the cookie, which any client can write — never use it
 * to decide access.
 */
export async function getTenantSession(): Promise<TenantSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Claims come from the access token, which the auth server signed after our
  // hook stamped it. Reading them from the JWT is safe precisely because
  // getUser() above already proved the token is valid.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = session?.access_token
    ? decodeJwt(session.access_token)
    : null;

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: asString(claims?.["org_id"]),
    orgRole: asString(claims?.["org_role"]),
    deviceId: asString(claims?.["device_id"]),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function decodeJwt(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}
