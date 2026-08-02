import { NextResponse } from "next/server";

/**
 * Ticketing proxy (POST /api/ticketing/push).
 *
 * Forwards a support ticket to a free / open-source helpdesk (Chatwoot,
 * FreeScout, osTicket, Zammad, Freshdesk) or an inbound webhook (Zapier / n8n).
 *
 * The push runs server-side for two reasons:
 *   1. CORS — helpdesk APIs rarely allow browser-origin POSTs; the server has
 *      no such restriction.
 *   2. Secrets — the API token can live in server env (TICKETING_TOKEN) and
 *      never reach the browser.
 *
 * Configuration precedence: server env wins, request body is the fallback so a
 * self-hosted / dev setup can still drive it entirely from the admin UI.
 *   TICKETING_URL       target API / webhook URL
 *   TICKETING_TOKEN     bearer token (optional)
 *   TICKETING_PROVIDER  label, informational only
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  url?: unknown;
  token?: unknown;
  provider?: unknown;
  ticket?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const target = process.env.TICKETING_URL || (typeof body.url === "string" ? body.url : "");
  const token = process.env.TICKETING_TOKEN || (typeof body.token === "string" ? body.token : "");
  const provider =
    process.env.TICKETING_PROVIDER || (typeof body.provider === "string" ? body.provider : "ticketing tool");

  if (!target) {
    return NextResponse.json(
      { error: "Ticketing tool not configured. Set TICKETING_URL or pass a url." },
      { status: 400 },
    );
  }
  if (!/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
  }
  if (body.ticket == null) {
    return NextResponse.json({ error: "Missing ticket payload." }, { status: 400 });
  }

  try {
    const r = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body.ticket),
    });

    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      return NextResponse.json(
        { error: `${provider} responded ${r.status}`, detail },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, provider, status: r.status });
  } catch (err) {
    return NextResponse.json(
      { error: `Couldn't reach ${provider}: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
