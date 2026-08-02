import { NextResponse } from "next/server";

/**
 * AI promo writer (POST /api/promo).
 *
 * Writes a short, WhatsApp-ready promotional message for a given business type,
 * occasion and offer, in the requested language. Key stays server-side. If it's
 * not configured the client keeps its ready-made templates, so Promotions works
 * without AI too.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 400 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { business, occasion, offer, shop, language, channel } = (body ?? {}) as Record<string, unknown>;
  const ch = String(channel ?? "whatsapp");

  const head =
    `Business: Indian "${String(business ?? "shop")}" named "${String(shop ?? "our shop")}".\n` +
    `Occasion: ${String(occasion ?? "special offer")}.\n` +
    `Offer / details: ${String(offer ?? "great deals")}.\n` +
    `Language: ${String(language ?? "English")} (mix Hindi if natural).\n`;

  const rules =
    ch === "sms"
      ? "Write ONE SMS promo: a single line, MAX 160 characters, no emojis, include the shop name, the offer and a short call to action. Return only the text."
      : ch === "ads"
        ? "Write ONE Google Search ad. Return exactly two lines:\nHeadline: <max 30 characters>\nDescription: <max 90 characters>\nNo emojis, no quotes."
        : "Write ONE WhatsApp promo: 2–3 short lines, warm and festive, 1–3 relevant emojis, end with a clear call to action (visit / order / call). No markdown, no quotes, no placeholders — return only the message text.";

  const prompt = head + rules;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
      }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return NextResponse.json({ error: `Gemini error ${r.status}`, detail }, { status: 502 });
    }
    const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
