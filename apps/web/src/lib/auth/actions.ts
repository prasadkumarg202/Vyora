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
 * SMS is the channel a shopkeeper expects — it is how every till app in India
 * signs in, and it needs no inbox. Email stays available as a fallback because
 * SMS is the more fragile of the two: DLT template rejections, carrier
 * filtering and a per-message cost all fail in ways email does not, and an
 * owner locked out of their own books at the counter is not an acceptable
 * failure mode.
 */
/**
 * Ten digits become +91XXXXXXXXXX. Supabase wants E.164 and nothing else, and
 * a shopkeeper types the number the way it appears on their phone — spaces,
 * a leading zero, sometimes the country code already there.
 */
function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits;
  // Indian mobile numbers are ten digits and never begin 0-5.
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

export async function sendOtp(
  identifier: string,
  channel: "sms" | "email" = "sms",
): Promise<ActionResult> {
  const supabase = await createClient();

  if (channel === "sms") {
    const phone = toE164(identifier);
    if (!phone) {
      return { ok: false, error: "Enter a 10-digit mobile number." };
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      logAuthError("sendOtp:sms", error);
      return { ok: false, error: describeSendFailure(error) };
    }
    return { ok: true };
  }

  const address = identifier.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, error: "Enter a valid email address." };
  }

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
    logAuthError("sendOtp:email", error);
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
  if (
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_sms_send_rate_limit" ||
    error.status === 429
  ) {
    return "Too many codes requested. Wait a few minutes and try again.";
  }

  // What an unregistered DLT template or a rejected Twilio send looks like.
  if (error.code === "sms_send_failed") {
    return "We couldn't send the SMS. Try email instead, or try again shortly.";
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
  identifier: string,
  token: string,
  channel: "sms" | "email" = "sms",
): Promise<ActionResult> {
  const code = token.trim();

  // Length is NOT fixed at 6. SMS codes are 6 digits, Supabase's email OTP is
  // 8 by default, and both are project settings. Validate the shape only and
  // let the auth server judge the value.
  if (!/^\d{4,10}$/.test(code)) {
    return { ok: false, error: "Enter the code we sent you." };
  }

  const supabase = await createClient();

  const credentials =
    channel === "sms"
      ? { phone: toE164(identifier) ?? "", token: code, type: "sms" as const }
      : {
          email: identifier.trim().toLowerCase(),
          token: code,
          type: "email" as const,
        };

  const { data, error } = await supabase.auth.verifyOtp(credentials);

  if (error) {
    logAuthError(`verifyOtp:${channel}`, error);
    return { ok: false, error: error.message || "Could not verify the code." };
  }

  const user = data.user;
  if (!user) {
    return { ok: false, error: "Verification returned no user." };
  }

  await ensureProfile(user.id, user.email ?? null);
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
async function ensureProfile(
  userId: string,
  email: string | null,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("users")
    .upsert(
      { id: userId, email },
      { onConflict: "id", ignoreDuplicates: true },
    );

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
 * Bootstraps the caller's first workspace, with the onboarding profile.
 *
 * Delegates to the create_workspace_profile() definer function, because a user
 * with no membership has no org_id claim and RLS therefore denies both inserts.
 * See supabase/migrations/20260803000300_business_profile.sql.
 *
 * GSTIN and PAN are optional on purpose. Most Indian shops this is built for
 * are below the registration threshold, and an onboarding that demands a GSTIN
 * turns them away on the first screen. What follows from not having one is a
 * product decision, not an error: the caller switches GST off for the shop.
 */
export interface WorkspaceProfile {
  name: string;
  businessTypeKey?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  gstin?: string | undefined;
  pan?: string | undefined;
  state?: string | undefined;
  stateCode?: string | undefined;
  addressLine1?: string | undefined;
  addressLine2?: string | undefined;
  city?: string | undefined;
  pincode?: string | undefined;
}

export async function createWorkspace(
  profile: WorkspaceProfile,
): Promise<ActionResult & { orgId?: string }> {
  const workspaceName = profile.name.trim();

  if (workspaceName.length < 2) {
    return { ok: false, error: "Enter your business name." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_workspace_profile", {
    workspace_name: workspaceName,
    business_type_key: profile.businessTypeKey ?? null,
    p_phone: profile.phone ?? null,
    p_email: profile.email ?? null,
    p_gstin: profile.gstin ?? null,
    p_pan: profile.pan ?? null,
    p_state: profile.state ?? null,
    p_state_code: profile.stateCode ?? null,
    p_address_line1: profile.addressLine1 ?? null,
    p_address_line2: profile.addressLine2 ?? null,
    p_city: profile.city ?? null,
    p_pincode: profile.pincode ?? null,
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
  // An optional field is omitted, not set to undefined —
  // exactOptionalPropertyTypes treats those as different types.
  return { ok: true, ...(typeof data === "string" ? { orgId: data } : {}) };
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
