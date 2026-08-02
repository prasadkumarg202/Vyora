import { NextResponse } from "next/server";

/**
 * Server-side OCR for supplier bills (POST /api/ocr).
 *
 * The browser sends a downscaled photo; this route asks Gemini Vision to read it
 * and return structured JSON (supplier, date, line items, total). The API key
 * and the image never touch the client beyond the user's own device. Returns the
 * parsed object so the client can show an editable draft and save it as a
 * Purchase in one tap — the "snap a bill, skip the typing" moat.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI is not configured. Set GEMINI_API_KEY in the server environment." },
      { status: 400 },
    );
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { imageBase64, mimeType } = (body ?? {}) as { imageBase64?: unknown; mimeType?: unknown };
  if (typeof imageBase64 !== "string" || imageBase64.length < 32) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  const mime = typeof mimeType === "string" && mimeType ? mimeType : "image/jpeg";

  const instruction =
    "You are reading a purchase / supplier bill or invoice for an Indian shop. " +
    "Extract it. Return ONLY JSON with this exact shape:\n" +
    '{"supplier": string|null, "date": string|null (YYYY-MM-DD), ' +
    '"items": [{"name": string, "qty": number, "rate": number, "gstPercent": number|null}], ' +
    '"total": number|null}\n' +
    "rate is the per-unit price in rupees (not the line total). If a value is missing, use null " +
    "(or qty 1). Do not invent items. No markdown, no explanation — JSON only.";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: instruction }, { inlineData: { mimeType: mime, data: imageBase64 } }],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return NextResponse.json({ error: `Gemini error ${r.status}`, detail }, { status: 502 });
    }
    const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Model wrapped it or added stray text — pull the first {...} block.
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* give up gracefully */
        }
      }
    }
    if (!parsed) {
      return NextResponse.json({ error: "Could not read the bill. Try a clearer, well-lit photo." }, { status: 422 });
    }
    return NextResponse.json({ data: parsed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
