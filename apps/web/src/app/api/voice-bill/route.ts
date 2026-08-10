import { NextResponse } from "next/server";

import { geminiModel } from "~/lib/ai/model";
import { requireFeature } from "~/lib/billing/guard";

/**
 * Voice → bill parser (POST /api/voice-bill).
 *
 * Turns a spoken order ("do Dolo 650, ek Crocin") into structured invoice line
 * items using Gemini, matching item names to the shop's catalogue so price and
 * GST auto-fill. Key stays server-side. If unconfigured, the client falls back
 * to its on-device parser, so voice billing works offline too.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CatalogItem {
  name?: string;
  price?: number;
  gst?: number;
}

export async function POST(req: Request): Promise<Response> {
  // Paid surface, and every call spends provider credit — so the plan is
  // checked here, not only on the Voice Billing screen.
  const denied = await requireFeature("voice_billing");
  if (denied) return denied;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Set GEMINI_API_KEY in the server environment.",
      },
      { status: 400 },
    );
  }
  // Vision tier: spoken Hindi or Telugu over counter noise, matched against the
  // shop's own catalogue. Cheapening this shows up as wrong items on real bills.
  const model = geminiModel("vision");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const { transcript, products } = (body ?? {}) as {
    transcript?: unknown;
    products?: unknown;
  };
  if (typeof transcript !== "string" || !transcript.trim()) {
    return NextResponse.json({ error: "Empty transcript." }, { status: 400 });
  }

  const catalog = Array.isArray(products)
    ? (products as CatalogItem[])
        .slice(0, 300)
        .filter((p) => p && typeof p.name === "string")
        .map((p) => `${p.name} | ₹${p.price ?? "?"} | GST ${p.gst ?? "?"}%`)
        .join("\n")
    : "";

  const system =
    "You convert a shopkeeper's spoken order (English/Hindi/Telugu/Tamil, mixed) into invoice line items " +
    'for an Indian shop. Return ONLY JSON: {"items":[{"name":string,"qty":number,"rate":number,"gstPercent":number|null}]}. ' +
    "rate is the per-unit price in rupees. Interpret Hindi/regional number words (ek=1, do=2, teen=3, paanch=5, das=10). " +
    "If the item matches a catalogue product, use that product's exact name, price and GST. Only include a rate you heard " +
    "or found in the catalogue; otherwise use null. Do not invent items. No markdown.\n\n" +
    (catalog
      ? `CATALOGUE (name | price | GST):\n${catalog}`
      : "No catalogue provided.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: transcript.slice(0, 1500) }] },
        ],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return NextResponse.json(
        { error: `Gemini error ${r.status}`, detail },
        { status: 502 },
      );
    }
    const data = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* ignore */
        }
      }
    }
    if (!parsed)
      return NextResponse.json(
        { error: "Could not understand the order." },
        { status: 422 },
      );
    return NextResponse.json({ data: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
