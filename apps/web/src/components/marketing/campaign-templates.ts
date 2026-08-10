import { resolveFields, type BusinessTypeConfig } from "@vyora/core";

/**
 * Campaign starters, chosen from the shop's own trade.
 *
 * A blank message box is the reason most shops never send a second campaign —
 * "Flat 20% off this weekend!" is the only thing anyone thinks of, and it is the
 * one message that trains customers to wait for a discount. These are the
 * messages that give a reason to walk in without cutting the price: a refill
 * that is due, a warranty about to lapse, a service date, a report that is ready.
 *
 * Selected on declared *fields*, never on the vertical's name — the same
 * contract the billing form and the copilot's questions keep. A trade that
 * declares `warranty` gets the warranty campaign whether it sells phones,
 * televisions or furniture.
 *
 * Every word here is Vyora's own. The tone is the one a shopkeeper would use
 * speaking to a regular: short, warm, no exclamation marks stacked up, no
 * borrowed marketing voice.
 */

export type Channel = "whatsapp" | "sms" | "email";

export interface CampaignTemplate {
  id: string;
  /** What the chip reads. */
  title: string;
  /** Prefilled campaign name. */
  name: string;
  channel: Channel;
  /**
   * Tokens are filled by `fillTemplate` at send time: {shop}, {party}, {item},
   * {date}. Left visible in the draft so the shopkeeper can see what will be
   * substituted and edit around it.
   */
  message: string;
  /** Why this message is worth sending — shown under the chip on hover. */
  intent: string;
  /**
   * The declared field that makes this campaign meaningful. Undefined means
   * every trade gets it.
   */
  fieldKey?: string;
}

/**
 * SMS is billed per 160 characters and a longer message silently becomes two.
 * WhatsApp has no such cliff, so the SMS starters are deliberately terse — that
 * is a cost decision, not a style one.
 */
export const SMS_SEGMENT_CHARS = 160;

const UNIVERSAL: readonly CampaignTemplate[] = [
  {
    id: "festival",
    title: "Festival greeting with an offer",
    name: "Festival offer",
    channel: "whatsapp",
    message:
      "Namaste {party}, wishing you and your family a happy festival from all of us at {shop}. " +
      "We have kept something special aside for our regular customers this week — do come by.",
    intent:
      "Greets first and sells second, which is why it gets read. Works for any festival.",
  },
  {
    id: "new-stock",
    title: "New stock has arrived",
    name: "New arrivals",
    channel: "whatsapp",
    message:
      "Hello {party}, fresh stock has just come in at {shop}. " +
      "Thought of you — come have a look before the good ones go.",
    intent: "A reason to visit that costs you nothing in margin.",
  },
  {
    id: "win-back",
    title: "We haven't seen you in a while",
    name: "Win back regulars",
    channel: "whatsapp",
    message:
      "Hello {party}, it has been a while since you visited {shop}. " +
      "Everything well? Do drop in — we would be glad to see you.",
    intent:
      "Send to customers with no bill in 60 days. Cheapest sale you will ever make is the one to someone who already trusts you.",
  },
  {
    id: "thank-you",
    title: "Thank a loyal customer",
    name: "Thank you",
    channel: "whatsapp",
    message:
      "Thank you {party} for shopping with {shop} through the year. " +
      "Customers like you are the reason this shop runs. See you soon.",
    intent:
      "No offer at all. Sent once or twice a year to your top customers, this is the message they remember.",
  },
  {
    id: "referral",
    title: "Ask for a referral",
    name: "Refer a friend",
    channel: "whatsapp",
    message:
      "Hello {party}, if you have been happy with {shop}, do tell a neighbour or friend about us. " +
      "It helps a small shop more than you know.",
    intent: "Costs nothing and works best right after a customer has bought something.",
  },
  {
    id: "payment-due",
    title: "Gentle payment reminder",
    name: "Payment reminder",
    channel: "whatsapp",
    message:
      "Hello {party}, a small reminder from {shop} — an amount is still pending on your account. " +
      "Whenever convenient, please do settle it. Thank you.",
    intent:
      "Deliberately soft. A firm reminder is a separate conversation, and it should not go out as a campaign.",
  },
  {
    id: "sms-short",
    title: "Short SMS offer",
    name: "SMS offer",
    channel: "sms",
    message: "{shop}: New stock in. Visit us this week. Reply STOP to opt out.",
    intent: `Under ${SMS_SEGMENT_CHARS} characters, so it bills as one SMS, and carries the opt-out line SMS rules expect.`,
  },
];

const BY_FIELD: readonly CampaignTemplate[] = [
  // --- Stock with a date on it -------------------------------------------
  {
    id: "refill-due",
    fieldKey: "expiry",
    title: "Refill reminder",
    name: "Refill due",
    channel: "whatsapp",
    message:
      "Hello {party}, your last purchase from {shop} may be running out around now. " +
      "Shall we keep it ready for you?",
    intent:
      "A service message, not an advertisement — which is what keeps it on the right side of the line for a chemist.",
  },
  {
    id: "clear-near-expiry",
    fieldKey: "batch_no",
    title: "Move near-expiry stock",
    name: "Clearance",
    channel: "whatsapp",
    message:
      "Hello {party}, we are clearing selected stock at {shop} at a reduced rate this week. " +
      "Limited quantity — first come, first served.",
    intent:
      "Recovers money from stock that would otherwise be written off. Send it early enough to matter.",
  },

  // --- Things that were sold with a promise attached ----------------------
  {
    id: "warranty-ending",
    fieldKey: "warranty",
    title: "Warranty about to end",
    name: "Warranty reminder",
    channel: "whatsapp",
    message:
      "Hello {party}, the warranty on your purchase from {shop} is ending soon. " +
      "If anything needs looking at, bring it in while it is still covered.",
    intent:
      "Reads as looking after them, not selling to them — and it brings the customer physically back into the shop.",
  },
  {
    id: "service-due",
    fieldKey: "next_service_date",
    title: "Service is due",
    name: "Service due",
    channel: "whatsapp",
    message:
      "Hello {party}, your vehicle is due for its next service at {shop}. " +
      "Tell us a convenient day and we will keep a slot free.",
    intent:
      "The single highest-return message a workshop can send. It is a booking, not an offer.",
  },
  {
    id: "report-ready",
    fieldKey: "report_due",
    title: "Report is ready",
    name: "Report ready",
    channel: "whatsapp",
    message:
      "Hello, your report from {shop} is ready for collection. " +
      "Please carry your receipt when you come.",
    intent:
      "Purely operational — and note it does not name the patient, because a report notification should not disclose who it is about.",
  },

  // --- Trades where the customer's own detail is the hook -----------------
  {
    id: "new-designs",
    fieldKey: "purity",
    title: "New designs in",
    name: "New designs",
    channel: "whatsapp",
    message:
      "Hello {party}, a new set of designs has arrived at {shop}. " +
      "Do come and see them — happy to keep a piece aside if something catches your eye.",
    intent: "Jewellery sells on being seen. The message only has to get them through the door.",
  },
  {
    id: "new-in-size",
    fieldKey: "size",
    title: "New arrivals in your size",
    name: "New arrivals",
    channel: "whatsapp",
    message:
      "Hello {party}, new stock has arrived at {shop}, including your usual size. " +
      "Come by this week for the best pick.",
    intent: "Works because it is specific. A generic 'new arrivals' from a clothes shop is ignored.",
  },
  {
    id: "weekend-special",
    fieldKey: "table",
    title: "Weekend special",
    name: "Weekend special",
    channel: "whatsapp",
    message:
      "Hello {party}, we have a special on this weekend at {shop}. " +
      "Book a table and we will keep one ready for you.",
    intent: "Sent Thursday or Friday, when the weekend is still being decided.",
  },
  {
    id: "off-season-tariff",
    fieldKey: "room_type",
    title: "Off-season tariff",
    name: "Off-season offer",
    channel: "whatsapp",
    message:
      "Hello {party}, rooms at {shop} are available at an off-season rate this month. " +
      "Call us directly for the best tariff.",
    intent: "Fills rooms that would otherwise sit empty, and 'call us directly' keeps the booking off an aggregator.",
  },
  {
    id: "season-booking",
    fieldKey: "event_date",
    title: "Book the season early",
    name: "Season bookings",
    channel: "whatsapp",
    message:
      "Hello {party}, dates for the coming season are filling at {shop}. " +
      "If you have a function planned, do let us know early and we will hold a date.",
    intent: "Catering lives on booking ahead. Scarcity here is real, not manufactured.",
  },

  // --- Trade counterparties, not consumers --------------------------------
  {
    id: "price-list",
    fieldKey: "credit_days",
    title: "Send the new price list",
    name: "Price list",
    channel: "whatsapp",
    message:
      "Dear {party}, the revised rate list from {shop} is effective from {date}. " +
      "Orders placed before then will be billed at the old rate.",
    intent: "A trade message, not a consumer one — and the old-rate deadline reliably pulls orders forward.",
  },
  {
    id: "route-day",
    fieldKey: "route",
    title: "Delivery day reminder",
    name: "Route reminder",
    channel: "whatsapp",
    message:
      "Dear {party}, our delivery reaches your area on {date}. " +
      "Send your order a day before and we will load it.",
    intent: "Turns a fixed route into a standing order, which is the whole game in distribution.",
  },
];

/**
 * Templates to offer this shop, trade-specific first.
 *
 * Deliberately does NOT return a promotional template for prescription
 * categories. India's Drugs and Magic Remedies Act bars advertising prescription
 * medicines to the public, so a chemist gets refill and clearance messages —
 * both service messages — and never an offer on a scheduled drug. Competitors
 * that ship one generic campaign box leave the shopkeeper to find that out on
 * their own.
 */
export function campaignTemplates(
  config: BusinessTypeConfig | null,
): CampaignTemplate[] {
  if (!config) return [...UNIVERSAL];

  const declared = new Set(resolveFields(config).map((f) => f.key));
  const specific = BY_FIELD.filter(
    (t) => t.fieldKey !== undefined && declared.has(t.fieldKey),
  );
  return [...specific, ...UNIVERSAL];
}

/** How many SMS segments a message will bill as. */
export function smsSegments(message: string): number {
  return Math.max(1, Math.ceil(message.length / SMS_SEGMENT_CHARS));
}
