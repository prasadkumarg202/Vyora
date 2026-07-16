/**
 * Admin portal shell.
 *
 * Scaffolded in Phase 2. The tenant, subscription, billing, template,
 * feature-flag, form-builder, theme, AI-analytics, support and audit surfaces
 * are specified in `design/Vyora Admin Portal.dc.html` and are built after the
 * tenant app's core platform lands.
 */
export default function AdminIndexPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-h1">Vyora Admin</h1>
      <p className="max-w-md text-body text-content-muted">
        Internal portal scaffolded in Phase 2. Screens follow the Admin Portal
        spec once the tenant platform is in place.
      </p>
    </main>
  );
}
