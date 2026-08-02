"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "~/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Step 1 of the login flow: send a one-time code.
 *
 * The spec's channel is SMS. Supabase cloud sends no SMS without a paid
 * provider, so development uses email and production switches the channel —
 * the verify step and everything downstream is identical either way.
 */
export async function sendOtp(email: string): Promise<ActionResult> {
  const address = email.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const emailRedirectTo = origin ? `${origin}/auth/callback` : undefined;

  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: {
      shouldCreateUser: true,
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });

  if (error) {
    logAuthError("sendOtp", error);
    return { ok: false, error: describeSendFailure(error) };
  }

  return { ok: true };
}

/**
 * Turn a Supabase AuthError into something a person can act on.
 *
 * The delivery failures are the ones worth naming. When the mail provider
 * rejects the message Supabase reports a bare 500 with an empty `message`, so
 * without this the user gets a blank error box and no idea what went wrong —
 * which is exactly how a whole evening disappeared into a working auth flow.
 */
function describeSendFailure(error: AuthError): string {
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "Too many codes requested. Wait a few minutes and try again.";
  }

  // 500 + unexpected_failure is what a rejected SMTP send looks like from here.
  if (error.status === 500) {
    return "We couldn't send the code — email delivery isn't set up for this address yet.";
  }

  return error.message || "Could not send the code.";
}

/**
 * Errors from the auth server are diagnosed from the server log, not from
 * whatever reaches the browser — the user-facing string is deliberately vague
 * and an AuthError's own fields are non-enumerable, so JSON.stringify() of one
 * is the string "{}" and tells you nothing. Read the named fields instead.
 */
function logAuthError(where: string, error: AuthError): void {
  console.error(
    `[auth] ${where} failed:`,
    JSON.stringify({
      name: error.name,
      status: error.status,
      code: error.code,
      message: error.message,
    }),
  );
}

/**
 * Step 2: exchange the code for a session, then make the session usable.
 *
 * "Usable" is two more things beyond a valid token:
 *   - a profile row, because the rest of the schema foreign-keys to users(id)
 *   - a device row bound to this session, so it can be listed and revoked
 */
export async function verifyOtp(
  email: string,
  token: string,
): Promise<ActionResult> {
  const address = email.trim().toLowerCase();
  const code = token.trim();

  // Length is NOT fixed at 6. The spec says "6-digit code", but that describes
  // the SMS channel; Supabase's email OTP is 8 digits by default, and both are
  // configurable per project. Hardcoding 6 rejected every real code. Validate
  // the shape only and let the auth server judge the value.
  if (!/^\d{4,10}$/.test(code)) {
    return { ok: false, error: "Enter the code we sent you." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: address,
    token: code,
    type: "email",
  });

  if (error) {
    logAuthError("verifyOtp", error);
    return { ok: false, error: error.message || "Could not verify the code." };
  }

  const user = data.user;
  if (!user) {
    return { ok: false, error: "Verification returned no user." };
  }

  await ensureProfile(user.id, address);
  await registerDevice(user.id);

  return { ok: true };
}

/**
 * The single choke point for profile creation.
 *
 * Normally this would be a trigger on auth.users, but Supabase revokes CREATE
 * on the auth schema. Doing it in app code means it *can* be skipped by a
 * future sign-in path that forgets to call it — so every such path must come
 * through here, and Phase 8 asserts a fresh sign-up lands a row.
 *
 * Guarded by RLS (insert_own_profile: with check id = auth.uid()), so a client
 * cannot forge a row for anyone else even if it calls this directly.
 */
async function ensureProfile(userId: string, email: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("users")
    .upsert({ id: userId, email }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    // Not fatal to the sign-in itself, but the app will misbehave without it,
    // so make it loud in logs rather than failing the user's login.
    console.error("[auth] failed to ensure profile row:", error.message);
  }
}

/**
 * Register this session as a trusted device.
 *
 * Bound to session_id, not the user: one session == one device == one refresh
 * token, which is what lets the owner revoke exactly one device.
 *
 * The device_id claim appears from the next token refresh onward, since this
 * row is written after the current token was minted.
 */
async function registerDevice(userId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // session_id is a claim, not a top-level field; decode it from the JWT.
  const sessionId = session?.access_token
    ? decodeClaim(session.access_token, "session_id")
    : null;
  const orgId = session?.access_token
    ? decodeClaim(session.access_token, "org_id")
    : null;

  // No membership yet (onboarding hasn't run) => no org_id => the devices
  // policy would reject the insert. Registration happens after the org exists.
  if (!sessionId || !orgId) return;

  const ua = (await headers()).get("user-agent") ?? "";

  const row = {
    org_id: orgId,
    user_id: userId,
    session_id: sessionId,
    name: describeDevice(ua),
    platform: platformOf(ua),
    status: "active" as const,
    last_seen_at: new Date().toISOString(),
  };

  // Deliberately not .upsert({ onConflict: "session_id" }). That needs Postgres
  // to *infer* the arbiter index, which it would not do here, and an upsert
  // silently degrading to an error is a bad way to lose the device registry.
  // Select-then-write is explicit; the unique constraint on session_id is what
  // actually guards against a concurrent double-register.
  const { data: existing } = await supabase
    .from("devices")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("devices")
        .update({ last_seen_at: row.last_seen_at, status: "active" })
        .eq("id", existing.id)
    : await supabase.from("devices").insert(row);

  if (error) {
    // A 23505 here means another request registered the same session first,
    // which is a benign race, not a failure.
    if (error.code === "23505") return;
    console.error("[auth] failed to register device:", error.message);
  }
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Clears the shell's cached server render; without this the signed-in header
  // can persist after the redirect.
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Bootstraps the caller's first workspace.
 *
 * Delegates to the create_workspace() definer function, because a user with no
 * membership has no org_id claim and RLS therefore denies both inserts. See
 * supabase/migrations/20260716000600_bootstrap_workspace.sql.
 *
 * This is the minimum needed for a signed-in user to reach the app. The real
 * onboarding — business-type selection driving a generated workspace — is
 * Phase 5, once the metadata engine can interpret business_types.config.
 */
export async function createWorkspace(
  name: string,
  businessTypeKey?: string,
): Promise<ActionResult> {
  const workspaceName = name.trim();

  if (workspaceName.length < 2) {
    return { ok: false, error: "Enter your business name." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("create_workspace", {
    workspace_name: workspaceName,
    business_type_key: businessTypeKey ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // The current access token predates the membership, so its org_id claim is
  // still null. Force a refresh so the hook re-runs and stamps the new claims —
  // otherwise the app would bounce straight back to /welcome.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    return { ok: false, error: refreshError.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await registerDevice(user.id);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

function decodeClaim(jwt: string, claim: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const value = json[claim];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Best-effort human label, so the device list reads like the spec's mockup. */
function describeDevice(ua: string): string {
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) {
    const model = /;\s*([^;)]+)\s+Build\//i.exec(ua)?.[1];
    return model?.trim() || "Android phone";
  }
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "Unknown device";
}

function platformOf(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Mac OS X|Linux/i.test(ua)) return "web";
  return "unknown";
}
