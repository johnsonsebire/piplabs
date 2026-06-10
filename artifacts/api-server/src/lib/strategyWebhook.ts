import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logger } from "./logger";

export type StrategySignalFields = {
  Strategy: string;
  Direction: string;
  SYMBOL: string;
  DURATION: string;
  Analysis: string;
  Time: string;
};

export type StrategySignalPayload = {
  text: string;
  fields: StrategySignalFields;
};

const DURATION_UNIT_WORDS: Record<string, string> = {
  t: "TICKS",
  s: "SECONDS",
  m: "MINUTES",
  h: "HOURS",
  d: "DAYS",
};

function formatDuration(duration: number | null, unit: string | null): string {
  if (duration == null) return "—";
  const word = unit ? (DURATION_UNIT_WORDS[unit.toLowerCase()] ?? unit.toUpperCase()) : "";
  return word ? `${duration} ${word}` : String(duration);
}

export type FireWebhookResult = {
  ok: boolean;
  status: number | null;
  error: string | null;
};

export function buildSignalPayload(args: {
  strategyName: string;
  symbol: string;
  symbolDisplay?: string | null;
  direction: string;
  duration: number | null;
  durationUnit: string | null;
  condition: string;
}): StrategySignalPayload {
  const strategy = `${args.strategyName},`;
  const direction = args.direction.toUpperCase();
  const symbolText = args.symbolDisplay && args.symbolDisplay !== args.symbol
    ? `${args.symbolDisplay} (${args.symbol})`
    : args.symbol;
  const symbol = `${symbolText},`;
  const duration = `${formatDuration(args.duration, args.durationUnit)},`;
  const analysis = `${args.condition},`;
  const time = new Date().toISOString();

  const text =
    `Strategy: ${strategy}\n` +
    `SYMBOL: ${symbol}\n` +
    `DURATION: ${duration}\n` +
    `Analysis: ${analysis}\n` +
    `Time: ${time}`;

  return {
    text,
    fields: {
      Strategy: strategy,
      Direction: direction,
      SYMBOL: symbol,
      DURATION: duration,
      Analysis: analysis,
      Time: time,
    },
  };
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

// RFC1918 + loopback + link-local + unique-local + multicast guards
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("ff")) return true; // multicast
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the IPv4 portion
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

async function validateWebhookUrl(rawUrl: string): Promise<{ url: URL; error: string | null }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { url: new URL("http://invalid"), error: "Invalid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { url, error: "Only http(s) URLs are allowed" };
  }
  // In production require https; allow http only for explicit dev hosts.
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return { url, error: "Only https URLs are allowed in production" };
  }
  const host = url.hostname;
  // Block literal localhost variants
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host)) {
    return { url, error: "Host is not allowed" };
  }
  // Resolve all addresses and reject if any is private/loopback/link-local
  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        return { url, error: `Host resolves to a non-public address (${r.address})` };
      }
    }
  } catch (err) {
    return { url, error: `DNS resolution failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { url, error: null };
}

export async function fireStrategyWebhook(
  rawUrl: string,
  payload: StrategySignalPayload,
  secret?: string | null,
): Promise<FireWebhookResult> {
  const validated = await validateWebhookUrl(rawUrl);
  if (validated.error) {
    logger.warn({ url: rawUrl, err: validated.error }, "Webhook URL rejected");
    return { ok: false, status: null, error: validated.error };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "PipLabs-Webhook/1.0",
      "X-Webhook-Timestamp": timestamp,
    };
    if (secret) {
      // Sign `t=<timestamp>.<body>` so signature is bound to timestamp (replay defence)
      const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
      headers["X-Webhook-Signature"] = `sha256=${signature}`;
    }

    const res = await fetch(validated.url.toString(), {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error", // refuse redirects so SSRF can't bypass DNS check
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ url: rawUrl, err: message }, "Strategy webhook delivery failed");
    return { ok: false, status: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}
