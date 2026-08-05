import { NextResponse } from "next/server";

import { requireFeature } from "~/lib/billing/guard";

/**
 * Server-side AI proxy for the Vyora copilot (POST /api/ai).
 *
 * The Gemini API key lives ONLY here, in the server environment — it is never
 * shipped to the browser. The client sends a question, a compact summary of the
 * shop's own numbers (context), and a little history; this route asks Gemini and
 * returns the text. If no key is configured the client falls back to the
 * offline answer, so the assistant always responds.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HistoryTurn {
  role?: string;
  text?: string;
}

export async function POST(req: Request): Promise<Response> {
  // Paid surface, and every call spends provider credit — so the plan is
  // checked here, not only on the assistant screen.
  const denied = await requireFeature("ai_assistant");
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
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const { question, context, history } = (body ?? {}) as {
    question?: unknown;
    context?: unknown;
    history?: unknown;
  };
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "Empty question." }, { status: 400 });
  }

  const system =
    "You are Vyora's AI copilot for an Indian small-business owner (shopkeeper). " +
    "Be concise, practical and friendly; reply in the same language the user writes in. " +
    "Use Indian rupees (₹) and the lakh/crore system. Ground every numeric answer in the " +
    "BUSINESS CONTEXT below — never invent figures. If something isn't in the context and " +
    "you can't know it, say so briefly and suggest where in the app to look (Sales, GST, " +
    "Reports, Credit Radar, Stock Radar, Scan & Sell). Keep answers under ~120 words.\n\n" +
    "BUSINESS CONTEXT:\n" +
    (typeof context === "string" ? context : "(no data provided)");

  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  if (Array.isArray(history)) {
    for (const h of (history as HistoryTurn[]).slice(-6)) {
      if (h && typeof h.text === "string" && h.text.trim() && h.text !== "…") {
        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.text.slice(0, 2000) }],
        });
      }
    }
  }
  contents.push({ role: "user", parts: [{ text: question.slice(0, 2000) }] });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
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
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
