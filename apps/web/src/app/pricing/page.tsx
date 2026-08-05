import {
  DAYS_UNTIL_LOCK,
  PLANS,
  POST_TRIAL_GRACE_DAYS,
  TRIAL_DAYS,
} from "@vyora/core";
import type { Metadata } from "next";
import Link from "next/link";

import { PricingTables } from "~/components/marketing/pricing-tables";

export const metadata: Metadata = {
  title: "Pricing — Vyora",
  description:
    "90 days of the entire product, free, with no card — then 30 more days of GST billing, stock and reports. Paid plans from ₹74 a month. No invoice cap, no turnover ceiling, on any plan.",
};

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: `What exactly do I get for free?`,
    a: `${TRIAL_DAYS} days of the entire product — every feature in ${PLANS.business.name}, no card, no sales call. After that you keep ${PLANS.free.name} — GST invoicing with no monthly cap, stock, parties, purchases and all 13 reports — for another ${POST_TRIAL_GRACE_DAYS} days while you decide. That is ${DAYS_UNTIL_LOCK} days before you pay us anything.`,
  },
  {
    q: `What happens on day ${DAYS_UNTIL_LOCK} if I have not chosen a plan?`,
    a: `The workspace closes: you can sign in, but you cannot bill or open the modules until you pick a plan. Nothing is deleted. The day you subscribe, everything is back exactly as you left it — same invoices, same stock, same numbering.`,
  },
  {
    q: "Can I still get my data out after that?",
    a: "Yes, always, and without paying. The download-everything button sits on the same screen as the plans, and your ledger is on your own device in the first place. Your sales records are your statutory GST records — we do not hold them hostage.",
  },
  {
    q: "Do you warn me before it closes?",
    a: `Yes. From 30 days before the trial ends there is a banner on every screen, and through the whole ${POST_TRIAL_GRACE_DAYS}-day wind-down it shows the exact number of days left and cannot be dismissed. The date should never arrive as a surprise.`,
  },
  {
    q: "Is there an invoice limit on any plan?",
    a: "No. No monthly invoice count and no turnover ceiling, on any plan — including the wind-down month. You should never have to pay us to stay compliant.",
  },
  {
    q: "Can I pay monthly?",
    a: "Yes. Monthly or yearly, and you can switch. Yearly is cheaper because it costs us less to collect; that is the whole reason for the discount. Neither Vyapar nor myBillBook sells a monthly plan at all.",
  },
  {
    q: "Do the prices include GST?",
    a: "Yes — the price on the card is what leaves your account. You get a GST invoice for every payment with the taxable value and the tax shown separately, so your accountant can claim the input credit.",
  },
  {
    q: "How do I pay?",
    a: "UPI AutoPay, cards, net banking and wallets, through Razorpay. Payments are being finalised — until that is live, plan changes on this site run in test mode and no money moves.",
  },
];

export default function PricingPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-content">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary text-body font-bold text-primary-content"
            >
              V
            </span>
            <span className="text-body font-semibold">Vyora</span>
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/"
              className="hidden text-body text-content-muted hover:text-primary sm:block"
            >
              Home
            </Link>
            <Link
              href="/download"
              className="hidden text-body text-content-muted hover:text-primary sm:block"
            >
              Download
            </Link>
            <Link
              href="/login"
              className="text-body font-medium text-content-muted hover:text-primary"
            >
              Login
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-14 sm:px-10">
        <span className="text-caption uppercase tracking-wide text-primary">
          Pricing
        </span>
        <h1 className="max-w-3xl text-h1">
          {DAYS_UNTIL_LOCK} days before you pay us anything.
        </h1>
        <p className="max-w-2xl text-body-lg text-content-muted">
          {TRIAL_DAYS} days of the entire product, then {POST_TRIAL_GRACE_DAYS}{" "}
          more with GST billing, stock and every report. No card to start, no
          invoice cap, no turnover ceiling — on any plan.
        </p>
        <p className="max-w-2xl text-body text-content-muted">
          After that, {PLANS.pro.name} costs less than a day&apos;s counter
          takings. If you decide we are not for you, download every record you
          entered and go — that button never expires.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10">
        <PricingTables />
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-14 sm:px-10">
          <h2 className="text-h2">Questions shopkeepers actually ask</h2>
          <dl className="flex flex-col gap-5">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-1">
                <dt className="text-body-lg font-semibold">{item.q}</dt>
                <dd className="text-body text-content-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-14 text-center sm:px-10">
        <h2 className="text-h2">Try the whole thing for {TRIAL_DAYS} days</h2>
        <p className="max-w-xl text-body text-content-muted">
          No card, no sales call. If it does not fit your shop, take your data
          and go — nothing is locked away from you.
        </p>
        <Link
          href="/login"
          className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-primary-content shadow-card hover:bg-primary-hover"
        >
          Start free
        </Link>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 sm:px-10">
          <span className="text-caption normal-case text-content-muted">
            © {new Date().getFullYear()} Vyora
          </span>
          <div className="flex flex-wrap gap-5">
            <Link
              href="/"
              className="text-caption normal-case text-content-muted hover:text-primary"
            >
              Home
            </Link>
            <Link
              href="/download"
              className="text-caption normal-case text-content-muted hover:text-primary"
            >
              Download
            </Link>
            <Link
              href="/support"
              className="text-caption normal-case text-content-muted hover:text-primary"
            >
              Support
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
