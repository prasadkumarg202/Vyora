import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "~/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-card bg-primary text-h3 font-bold text-white"
          >
            V
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-h2">Sign in to Vyora</h1>
            <p className="text-body text-content-muted">
              We&apos;ll send you a 6-digit code. No password to remember.
            </p>
          </div>
        </div>

        {/*
          LoginForm reads ?next= via useSearchParams, which opts the subtree out
          of prerendering. The boundary keeps the shell static and streams only
          the form.
        */}
        <Suspense fallback={<FormSkeleton />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

function FormSkeleton() {
  return (
    <div
      aria-hidden
      className="h-52 rounded-card border border-border bg-surface shadow-card"
    />
  );
}
