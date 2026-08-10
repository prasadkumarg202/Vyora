import { resolveFields, type BusinessTypeConfig } from "@vyora/core";

/**
 * What the copilot offers to answer, derived from the shop's own trade.
 *
 * The five suggestions used to be a hardcoded list, so a Medical Store and an
 * Electronics shop were both offered "What's stuck in dead stock?" — true for
 * neither in the way that matters. A chemist's dead stock is stock about to
 * expire and become unsellable by law; an electronics shop's is a model whose
 * warranty window is closing. Same words, different question.
 *
 * So this branches on *fields*, never on the vertical's name. A trade that
 * declares an `expiry` field gets the expiry question whether it calls itself a
 * Pharmacy, a Medical Store or a Distributor — and a vertical added later gets
 * the right prompts without this file being touched, which is the same contract
 * the billing form already keeps.
 *
 * Wording is Vyora's own. These are the questions a shopkeeper actually asks out
 * loud at the counter, in the plainest form of them.
 */

interface FieldQuestion {
  /** The declared field key that makes this question meaningful. */
  fieldKey: string;
  question: string;
}

/**
 * Ordered by how much the answer is worth to the shop, because only the first
 * few survive the cut. Money at risk first, then stock, then operations.
 */
const FIELD_QUESTIONS: readonly FieldQuestion[] = [
  // Stock that stops being sellable on a date.
  { fieldKey: "expiry", question: "What's expiring in the next 30 days?" },
  { fieldKey: "batch_no", question: "Which batches should I sell first?" },

  // Money owed, and the terms it was owed on.
  { fieldKey: "credit_days", question: "Which parties are past their credit days?" },
  { fieldKey: "customer_khata", question: "Who's on khata, and for how much?" },

  // Serial-tracked goods — the "find that bill" problem.
  { fieldKey: "imei", question: "Find a bill by IMEI" },
  { fieldKey: "serial_no", question: "Find a bill by serial number" },
  { fieldKey: "warranty", question: "Whose warranty runs out this month?" },

  // Regulated categories.
  { fieldKey: "schedule", question: "Show my Schedule H and H1 sales" },
  { fieldKey: "salt_composition", question: "Which salts sell the most?" },

  // Weight-and-rate trades.
  { fieldKey: "purity", question: "What's my stock worth at today's rate?" },
  { fieldKey: "making_charge", question: "How much am I earning on making charges?" },

  // Service and repair.
  { fieldKey: "next_service_date", question: "Which vehicles are due for service?" },
  { fieldKey: "vehicle_no", question: "What have I billed against this vehicle?" },

  // Covers, tables and turnaround.
  { fieldKey: "table", question: "Which tables turn over fastest?" },
  { fieldKey: "waiter", question: "Which staff are billing the most?" },
  { fieldKey: "room_type", question: "What's my occupancy this week?" },
  { fieldKey: "event_date", question: "What's booked for this month?" },
  { fieldKey: "rate_per_plate", question: "What's my average rate per plate?" },

  // Making things.
  { fieldKey: "wastage_pct", question: "Where is my wastage highest?" },
  { fieldKey: "machine", question: "Which machine is running the most output?" },

  // Diagnostics.
  { fieldKey: "report_due", question: "Which reports are due today?" },
  { fieldKey: "patient_name", question: "How many tests did I run this week?" },

  // Route trade.
  { fieldKey: "route", question: "Which route is selling best?" },
  { fieldKey: "salesman", question: "Which salesman is ahead this month?" },

  // Size- and variant-led retail.
  { fieldKey: "size", question: "Which sizes am I running out of?" },
  { fieldKey: "colour", question: "Which colours move fastest?" },
  { fieldKey: "brand", question: "Which brand earns me the most?" },

  // Where a thing physically is.
  { fieldKey: "rack", question: "What's running low, rack by rack?" },
];

/**
 * True whatever the shop sells. Kept last so a trade's own questions win the
 * limited space, but always available — these three are the ones every owner
 * asks, and a panel that offered nothing familiar would read as a stranger's.
 */
const UNIVERSAL: readonly string[] = [
  "How are my sales today?",
  "Who should I chase for payment?",
  "How can I lower my GST?",
  "Give me 3 ideas to sell more",
];

/**
 * The chips to show, trade-specific first.
 *
 * A shop with no business type configured still gets the universal set rather
 * than an empty row — the copilot has to be askable on day one, before
 * onboarding has decided what kind of shop this is.
 */
export function suggestedQuestions(
  config: BusinessTypeConfig | null,
  max = 5,
): string[] {
  if (!config) return UNIVERSAL.slice(0, max);

  const declared = new Set(resolveFields(config).map((f) => f.key));

  const specific: string[] = [];
  for (const { fieldKey, question } of FIELD_QUESTIONS) {
    if (specific.length >= max - 1) break; // always leave room for one universal
    if (declared.has(fieldKey) && !specific.includes(question)) {
      specific.push(question);
    }
  }

  const out = [...specific];
  for (const q of UNIVERSAL) {
    if (out.length >= max) break;
    if (!out.includes(q)) out.push(q);
  }
  return out;
}
