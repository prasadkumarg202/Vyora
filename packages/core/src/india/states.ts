/**
 * The GST state codes.
 *
 * The first two digits of every GSTIN are the state of registration, and the
 * place-of-supply rule that decides CGST+SGST versus IGST is a comparison of
 * two of these codes. So this list is not a dropdown's convenience — it is the
 * lookup the tax engine's correctness rests on, and a shop registered in a
 * state that is missing here would silently be billed the wrong tax.
 *
 * Codes are the official ones (the 2017 list plus the 2020 UT mergers): Daman
 * & Diu and Dadra & Nagar Haveli became a single UT under 26, and Ladakh took
 * 38 when Jammu & Kashmir was reorganised. 97 is "Other Territory" — offshore
 * installations and the like — and 99 is the Centre's own jurisdiction.
 */

export interface IndianState {
  /** Two-digit GST state code, zero-padded. */
  readonly code: string;
  readonly name: string;
  /** Union territories are taxed with UTGST rather than SGST. */
  readonly unionTerritory: boolean;
}

export const INDIAN_STATES: readonly IndianState[] = [
  { code: "01", name: "Jammu & Kashmir", unionTerritory: true },
  { code: "02", name: "Himachal Pradesh", unionTerritory: false },
  { code: "03", name: "Punjab", unionTerritory: false },
  { code: "04", name: "Chandigarh", unionTerritory: true },
  { code: "05", name: "Uttarakhand", unionTerritory: false },
  { code: "06", name: "Haryana", unionTerritory: false },
  { code: "07", name: "Delhi", unionTerritory: true },
  { code: "08", name: "Rajasthan", unionTerritory: false },
  { code: "09", name: "Uttar Pradesh", unionTerritory: false },
  { code: "10", name: "Bihar", unionTerritory: false },
  { code: "11", name: "Sikkim", unionTerritory: false },
  { code: "12", name: "Arunachal Pradesh", unionTerritory: false },
  { code: "13", name: "Nagaland", unionTerritory: false },
  { code: "14", name: "Manipur", unionTerritory: false },
  { code: "15", name: "Mizoram", unionTerritory: false },
  { code: "16", name: "Tripura", unionTerritory: false },
  { code: "17", name: "Meghalaya", unionTerritory: false },
  { code: "18", name: "Assam", unionTerritory: false },
  { code: "19", name: "West Bengal", unionTerritory: false },
  { code: "20", name: "Jharkhand", unionTerritory: false },
  { code: "21", name: "Odisha", unionTerritory: false },
  { code: "22", name: "Chhattisgarh", unionTerritory: false },
  { code: "23", name: "Madhya Pradesh", unionTerritory: false },
  { code: "24", name: "Gujarat", unionTerritory: false },
  {
    code: "26",
    name: "Dadra & Nagar Haveli and Daman & Diu",
    unionTerritory: true,
  },
  { code: "27", name: "Maharashtra", unionTerritory: false },
  { code: "29", name: "Karnataka", unionTerritory: false },
  { code: "30", name: "Goa", unionTerritory: false },
  { code: "31", name: "Lakshadweep", unionTerritory: true },
  { code: "32", name: "Kerala", unionTerritory: false },
  { code: "33", name: "Tamil Nadu", unionTerritory: false },
  { code: "34", name: "Puducherry", unionTerritory: true },
  { code: "35", name: "Andaman & Nicobar Islands", unionTerritory: true },
  { code: "36", name: "Telangana", unionTerritory: false },
  { code: "37", name: "Andhra Pradesh", unionTerritory: false },
  { code: "38", name: "Ladakh", unionTerritory: true },
  { code: "97", name: "Other Territory", unionTerritory: true },
];

const byName = new Map(
  INDIAN_STATES.map((s) => [s.name.toLowerCase(), s] as const),
);
const byCode = new Map(INDIAN_STATES.map((s) => [s.code, s] as const));

/**
 * The GST code for a state name, or null.
 *
 * Null rather than a default: guessing a state guesses the tax. A caller that
 * cannot resolve one should say so, not quietly bill CGST+SGST for a shop it
 * could not place.
 */
export function stateCodeFor(name: string | null | undefined): string | null {
  if (!name) return null;
  return byName.get(name.trim().toLowerCase())?.code ?? null;
}

export function stateByCode(
  code: string | null | undefined,
): IndianState | null {
  if (!code) return null;
  return byCode.get(code.trim().padStart(2, "0")) ?? null;
}

/** The state a GSTIN was issued in, read from its first two digits. */
export function gstinStateCode(gstin: string): string | null {
  const code = gstin.trim().slice(0, 2);
  return byCode.has(code) ? code : null;
}

/**
 * The PAN embedded in a GSTIN — characters 3 to 12.
 *
 * A GSTIN is `<state><PAN><entity><Z><check>`, so the PAN is not a separate
 * fact to be typed twice. Reading it back is how a mistyped PAN is caught
 * before it reaches an invoice.
 */
export function gstinPan(gstin: string): string | null {
  const trimmed = gstin.trim();
  return trimmed.length === 15 ? trimmed.slice(2, 12) : null;
}

/** Standard PAN shape: five letters, four digits, one letter. */
const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function isValidPan(candidate: string): boolean {
  return PAN_FORMAT.test(candidate.trim().toUpperCase());
}
