import { signOut } from "~/lib/auth/actions";

/**
 * Identity + sign out. Phase 4 turns this into the real dropdown from the
 * design system; it exists now so a session can be ended without devtools.
 */
export function UserMenu({
  email,
  role,
}: {
  email: string | null;
  role: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-caption normal-case text-white/90">{email}</span>
        {role ? (
          <span className="text-caption text-white/60">{role}</span>
        ) : null}
      </div>

      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button
          type="submit"
          className="min-h-touch rounded-control border border-white/20 px-3 text-caption normal-case text-white/90 transition-colors hover:bg-white/10"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
