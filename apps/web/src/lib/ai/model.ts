/**
 * Which Gemini model a route should ask for.
 *
 * All five AI routes used to read one shared `GEMINI_MODEL`, which meant the
 * chat model and the OCR model were the same choice. That is the wrong knob.
 *
 * Reading a crumpled supplier bill photographed under a tube light, and
 * transcribing accented Hindi over counter noise, are the two hardest things
 * this product does — and a wrong figure out of either does not stay put. It
 * flows into stock, into GST, into the margin report, and the shopkeeper has no
 * way to trace it back to a misread photograph. Meanwhile "how are my sales
 * today?" is answered from a short context by any model in the family.
 *
 * So the money-saving knob and the accuracy knob are separated: point text at
 * something cheap, leave vision on something capable. `GEMINI_MODEL` still
 * works as a single override for both, so nothing breaks for an environment
 * that has only ever set that one.
 *
 * Resolution order, most specific first:
 *   GEMINI_MODEL_TEXT / GEMINI_MODEL_VISION  → GEMINI_MODEL → the default below.
 */

/**
 * The fallback when nothing is configured.
 *
 * Deliberately a full Flash rather than a Lite: an environment that has set no
 * model at all should get the safe answer, not the cheap one. A shop that never
 * opens the Cloudflare dashboard still has to get its bills read correctly.
 */
const DEFAULT_MODEL = "gemini-2.0-flash";

export type ModelKind = "text" | "vision";

/**
 * Trimmed, because a value pasted into a dashboard field routinely arrives with
 * a trailing space — and a model id with one 404s with a message that names the
 * model and gives no hint that the space is the problem.
 */
function env(name: string): string | undefined {
  const v = process.env[name];
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

export function geminiModel(kind: ModelKind): string {
  const specific = kind === "vision" ? env("GEMINI_MODEL_VISION") : env("GEMINI_MODEL_TEXT");
  return specific ?? env("GEMINI_MODEL") ?? DEFAULT_MODEL;
}
