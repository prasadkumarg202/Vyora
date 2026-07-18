/**
 * The post-login destination is attacker-controllable — it arrives as a `next`
 * query param on /login and /auth/callback, and both are reachable by anyone
 * who can get a user to click a link.
 *
 * Left unchecked it is an open redirect, and an open redirect on the *auth
 * callback* is the expensive kind: the user is bounced off-site at the exact
 * moment they just authenticated, so a convincing "session expired, sign in
 * again" page lands on someone primed to retype their code.
 *
 * `new URL(next, origin)` does not save us — an absolute URL ignores the base,
 * so `new URL("https://evil.com", origin)` is simply evil.com. Neither does a
 * bare `startsWith("/")`, which still admits the protocol-relative `//evil.com`.
 */
export const DEFAULT_NEXT = "/dashboard";

export function safeNext(
  next: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (!next) return fallback;

  // Must be a site-relative path.
  if (!next.startsWith("/")) return fallback;

  // "//evil.com" is protocol-relative and "/\evil.com" is normalised to it by
  // browsers, so both leave the origin despite the leading slash.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;

  // The same tricks survive one round of encoding ("/%2fevil.com",
  // "/%5cevil.com"), so judge the decoded form too.
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    // Malformed escapes mean we cannot reason about it — don't trust it.
    return fallback;
  }

  if (/^\/[/\\]/.test(decoded)) return fallback;

  // Control characters (NUL, CR, LF, DEL …) can smuggle a scheme past the
  // checks above once a browser or a header strips them. Tested by code point
  // rather than a regex literal so no raw control byte lands in this file.
  if (hasControlChar(decoded)) return fallback;

  return next;
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
