/**
 * deriv-contract-types.ts
 * Central registry for all Deriv contract types supported by this platform.
 * Maps UI concepts → API payload fields.
 */

// ─── API type values (must match TradeInputType enum) ────────────────────────
export type ApiTradeType = "vanilla_options" | "multiplier" | "forex";

// ─── Contract subtype identifier (UI-level, encoded in notes + future backend) ─
export type ContractSubtype =
  | "RISE_FALL"
  | "HIGHER_LOWER"
  | "TOUCH_NO_TOUCH"
  | "MATCH_DIFFER"
  | "OVER_UNDER"
  | "EVEN_ODD"
  | "ACCUMULATOR"
  | "TURBO"
  | "VANILLA"
  | "MULTIPLIER";

// ─── Direction config per contract type ───────────────────────────────────────
export interface DirectionOption {
  value: string;            // maps to TradeInputDirection
  label: string;            // display label
  color: "green" | "red";
}

// ─── Field visibility config ──────────────────────────────────────────────────
export interface ContractTypeConfig {
  id: ContractSubtype;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;             // Bootstrap icon class
  category: "binary" | "options" | "multiplier" | "digits";
  categoryLabel: string;
  /** API type to send in TradeInput.type */
  apiType: ApiTradeType;
  /** Directions available */
  directions: DirectionOption[];
  /** Whether a barrier/strike field is needed */
  needsBarrier: boolean;
  barrierLabel?: string;
  barrierPlaceholder?: string;
  barrierHint?: string;
  /** Whether duration is shown (false for open-ended like multiplier/accumulator) */
  hasDuration: boolean;
  /** If true, only ticks are valid as duration unit */
  ticksOnly?: boolean;
  /** Whether multiplier selector is shown */
  needsMultiplier?: boolean;
  /** Whether growth rate selector is shown (accumulators) */
  needsGrowthRate?: boolean;
  /** Default duration value */
  defaultDuration?: string;
  /** Default duration unit */
  defaultDurationUnit?: string;
  /** Color theme for the type badge */
  badgeColor: string;
  badgeBg: string;
}

// ─── Full registry ────────────────────────────────────────────────────────────
export const DERIV_CONTRACT_TYPES: ContractTypeConfig[] = [
  // ── Binary options ──────────────────────────────────────────────────────────
  {
    id: "RISE_FALL",
    label: "Rise / Fall",
    shortLabel: "Rise/Fall",
    description: "Predict whether the price will be higher (Rise) or lower (Fall) than the entry price at expiry.",
    icon: "bi-graph-up-arrow",
    category: "binary",
    categoryLabel: "Binary",
    apiType: "forex",
    directions: [
      { value: "call", label: "Rise", color: "green" },
      { value: "put",  label: "Fall", color: "red" },
    ],
    needsBarrier: false,
    hasDuration: true,
    defaultDuration: "5",
    defaultDurationUnit: "t",
    badgeColor: "#10b981",
    badgeBg: "rgba(16,185,129,0.12)",
  },
  {
    id: "HIGHER_LOWER",
    label: "Higher / Lower",
    shortLabel: "Hi/Lo",
    description: "Predict whether the price will be strictly higher or lower than a target barrier at expiry.",
    icon: "bi-arrows-expand",
    category: "binary",
    categoryLabel: "Binary",
    apiType: "forex",
    directions: [
      { value: "call", label: "Higher", color: "green" },
      { value: "put",  label: "Lower",  color: "red" },
    ],
    needsBarrier: true,
    barrierLabel: "Target Price",
    barrierPlaceholder: "e.g. 1234.56",
    barrierHint: "Enter an absolute price level the market must close above/below.",
    hasDuration: true,
    defaultDuration: "5",
    defaultDurationUnit: "m",
    badgeColor: "#3b82f6",
    badgeBg: "rgba(59,130,246,0.12)",
  },
  {
    id: "TOUCH_NO_TOUCH",
    label: "Touch / No Touch",
    shortLabel: "Touch",
    description: "Win if the price touches (or never touches) a barrier level at any point during the contract.",
    icon: "bi-hand-index",
    category: "binary",
    categoryLabel: "Binary",
    apiType: "forex",
    directions: [
      { value: "call", label: "Touch",    color: "green" },
      { value: "put",  label: "No Touch", color: "red" },
    ],
    needsBarrier: true,
    barrierLabel: "Barrier Level",
    barrierPlaceholder: "+0.00 or absolute",
    barrierHint: "Use +N/-N for pips from spot, or an absolute price.",
    hasDuration: true,
    defaultDuration: "5",
    defaultDurationUnit: "m",
    badgeColor: "#8b5cf6",
    badgeBg: "rgba(139,92,246,0.12)",
  },
  // ── Digit options ───────────────────────────────────────────────────────────
  {
    id: "MATCH_DIFFER",
    label: "Matches / Differs",
    shortLabel: "Match",
    description: "Predict whether the last digit of the spot price will match or differ from a chosen digit (0–9).",
    icon: "bi-123",
    category: "digits",
    categoryLabel: "Digits",
    apiType: "forex",
    directions: [
      { value: "call", label: "Matches", color: "green" },
      { value: "put",  label: "Differs", color: "red" },
    ],
    needsBarrier: true,
    barrierLabel: "Last Digit (0–9)",
    barrierPlaceholder: "0",
    barrierHint: "Enter a digit from 0 to 9.",
    hasDuration: true,
    ticksOnly: true,
    defaultDuration: "5",
    defaultDurationUnit: "t",
    badgeColor: "#f59e0b",
    badgeBg: "rgba(245,158,11,0.12)",
  },
  {
    id: "OVER_UNDER",
    label: "Over / Under",
    shortLabel: "Over/Under",
    description: "Predict whether the last digit of the spot price will be over or under a chosen digit.",
    icon: "bi-chevron-bar-expand",
    category: "digits",
    categoryLabel: "Digits",
    apiType: "forex",
    directions: [
      { value: "call", label: "Over",  color: "green" },
      { value: "put",  label: "Under", color: "red" },
    ],
    needsBarrier: true,
    barrierLabel: "Last Digit (0–9)",
    barrierPlaceholder: "5",
    barrierHint: "Enter a digit from 0 to 9.",
    hasDuration: true,
    ticksOnly: true,
    defaultDuration: "5",
    defaultDurationUnit: "t",
    badgeColor: "#f59e0b",
    badgeBg: "rgba(245,158,11,0.12)",
  },
  {
    id: "EVEN_ODD",
    label: "Even / Odd",
    shortLabel: "Even/Odd",
    description: "Predict whether the last digit of the spot price at expiry will be even or odd.",
    icon: "bi-plus-slash-minus",
    category: "digits",
    categoryLabel: "Digits",
    apiType: "forex",
    directions: [
      { value: "call", label: "Even", color: "green" },
      { value: "put",  label: "Odd",  color: "red" },
    ],
    needsBarrier: false,
    hasDuration: true,
    ticksOnly: true,
    defaultDuration: "5",
    defaultDurationUnit: "t",
    badgeColor: "#f59e0b",
    badgeBg: "rgba(245,158,11,0.12)",
  },
  // ── Structured options ──────────────────────────────────────────────────────
  {
    id: "ACCUMULATOR",
    label: "Accumulators",
    shortLabel: "Accum.",
    description: "Profit accumulates each tick the spot stays within a range. Open-ended — exit when ready.",
    icon: "bi-bar-chart-steps",
    category: "options",
    categoryLabel: "Options",
    apiType: "forex",
    directions: [
      { value: "call", label: "Grow", color: "green" },
    ],
    needsBarrier: false,
    needsGrowthRate: true,
    hasDuration: false,
    badgeColor: "#06b6d4",
    badgeBg: "rgba(6,182,212,0.12)",
  },
  {
    id: "TURBO",
    label: "Turbos",
    shortLabel: "Turbo",
    description: "Leveraged contracts with a knock-out barrier. Similar to vanilla options but with a fixed knockout level.",
    icon: "bi-lightning-fill",
    category: "options",
    categoryLabel: "Options",
    apiType: "vanilla_options",
    directions: [
      { value: "call", label: "Long",  color: "green" },
      { value: "put",  label: "Short", color: "red" },
    ],
    needsBarrier: true,
    barrierLabel: "Knock-out Level",
    barrierPlaceholder: "+0.00 or absolute",
    barrierHint: "The price level where your contract terminates (knock-out).",
    hasDuration: true,
    defaultDuration: "1",
    defaultDurationUnit: "d",
    badgeColor: "#ef4444",
    badgeBg: "rgba(239,68,68,0.12)",
  },
  {
    id: "VANILLA",
    label: "Vanillas",
    shortLabel: "Vanilla",
    description: "Standard vanilla call/put options with a configurable strike price and expiry.",
    icon: "bi-graph-up",
    category: "options",
    categoryLabel: "Options",
    apiType: "vanilla_options",
    directions: [
      { value: "call", label: "Call", color: "green" },
      { value: "put",  label: "Put",  color: "red" },
    ],
    needsBarrier: true,
    barrierLabel: "Strike / Barrier",
    barrierPlaceholder: "+0.00",
    barrierHint: "+0.00 = at-the-money · +N/-N = pips from spot · or absolute price",
    hasDuration: true,
    defaultDuration: "5",
    defaultDurationUnit: "m",
    badgeColor: "#3b82f6",
    badgeBg: "rgba(59,130,246,0.12)",
  },
  // ── Multiplier ──────────────────────────────────────────────────────────────
  {
    id: "MULTIPLIER",
    label: "Multipliers",
    shortLabel: "Mult.",
    description: "Amplify your returns with a multiplier. Open-ended — profit or loss is multiplied. Close anytime.",
    icon: "bi-x-diamond",
    category: "multiplier",
    categoryLabel: "Multiplier",
    apiType: "multiplier",
    directions: [
      { value: "buy",  label: "Buy",  color: "green" },
      { value: "sell", label: "Sell", color: "red" },
    ],
    needsBarrier: false,
    needsMultiplier: true,
    hasDuration: false,
    badgeColor: "#f59e0b",
    badgeBg: "rgba(245,158,11,0.12)",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────
export const CONTRACT_TYPE_MAP: Record<ContractSubtype, ContractTypeConfig> =
  Object.fromEntries(DERIV_CONTRACT_TYPES.map(c => [c.id, c])) as Record<ContractSubtype, ContractTypeConfig>;

export function getContractType(id: ContractSubtype): ContractTypeConfig {
  return CONTRACT_TYPE_MAP[id];
}

export const CONTRACT_CATEGORIES = [
  { id: "binary",     label: "Binary Options" },
  { id: "digits",     label: "Digit Options" },
  { id: "options",    label: "Structured Options" },
  { id: "multiplier", label: "Multiplier" },
] as const;

/** Groups contract types by category for display */
export function groupedContractTypes() {
  return CONTRACT_CATEGORIES.map(cat => ({
    ...cat,
    types: DERIV_CONTRACT_TYPES.filter(t => t.category === cat.id),
  }));
}

/** Encode contractSubtype into notes field prefix */
export function encodeContractSubtype(subtype: ContractSubtype, existingNotes?: string): string {
  const prefix = `[CONTRACT:${subtype}]`;
  return existingNotes ? `${prefix} ${existingNotes}` : prefix;
}

/** Decode contractSubtype from notes field */
export function decodeContractSubtype(notes?: string | null): ContractSubtype | null {
  if (!notes) return null;
  const m = notes.match(/^\[CONTRACT:([A-Z_]+)\]/);
  if (!m) return null;
  return m[1] as ContractSubtype;
}

/** Map a ContractSubtype to the BacktestInputTradeType API value */
export function subtypeToBacktestType(subtype: ContractSubtype): "vanilla_options" | "forex" | "multiplier" {
  const cfg = CONTRACT_TYPE_MAP[subtype];
  return cfg.apiType;
}

/** Growth rate options for Accumulators */
export const GROWTH_RATES = [
  { value: "1", label: "1%" },
  { value: "2", label: "2%" },
  { value: "3", label: "3%" },
  { value: "4", label: "4%" },
  { value: "5", label: "5%" },
];

/** Multiplier values */
export const MULTIPLIER_VALUES = ["40", "100", "200", "300", "400"];
