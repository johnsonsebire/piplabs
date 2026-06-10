import { useState } from "react";
import { useListTrades, ListTradesStatus, getListTradesQueryKey } from "@workspace/api-client-react";
import type { Trade } from "@workspace/api-client-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { Link } from "wouter";

// ─── Design tokens (mirrors the project palette) ─────────────────────────────
const C = {
  bg: "#0a0d11",
  card: "#0f1318",
  border: "#1a2332",
  muted: "#475569",
  mutedFg: "#64748b",
  fg: "#e2e8f0",
  primary: "#10b981",
  primaryBg: "rgba(16,185,129,0.12)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.12)",
  blue: "#3b82f6",
  blueBg: "rgba(59,130,246,0.10)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.10)",
  mono: "'Space Mono', 'Menlo', 'Courier New', monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(type: string) {
  switch (type) {
    case "vanilla_options": return "Options";
    case "multiplier":      return "Multiplier";
    case "forex":           return "Forex";
    default:                return type;
  }
}

function directionConfig(direction: string, type: string) {
  const isUp = direction === "call" || direction === "buy";
  return {
    label: type === "multiplier" ? (isUp ? "Buy" : "Sell") : (isUp ? "Call" : "Put"),
    color: isUp ? C.primary : C.red,
    bg:    isUp ? C.primaryBg : C.redBg,
    icon:  isUp ? "bi-arrow-up-short" : "bi-arrow-down-short",
  };
}

function durationLabel(t: Trade) {
  if (!t.duration || !t.durationUnit) return null;
  const units: Record<string, string> = { t: "ticks", s: "sec", m: "min", h: "hr", d: "day" };
  return `${t.duration}${units[t.durationUnit] ?? t.durationUnit}`;
}

function pnlColor(val: number | null | undefined) {
  if (val == null) return C.mutedFg;
  return val > 0 ? C.primary : val < 0 ? C.red : C.mutedFg;
}

function pnlText(val: number | null | undefined) {
  if (val == null) return "---";
  const sign = val >= 0 ? "+" : "";
  return `${sign}$${val.toFixed(2)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "0.5rem 0.875rem",
      fontFamily: C.mono,
      fontSize: "0.5625rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: C.mutedFg,
      textAlign: right ? "right" : "left",
      whiteSpace: "nowrap",
      borderBottom: `1px solid ${C.border}`,
      backgroundColor: "#0d1117",
      position: "sticky" as const,
      top: 0,
      zIndex: 5,
    }}>
      {children}
    </th>
  );
}

function Td({ children, right, style }: { children: React.ReactNode; right?: boolean; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: "0.5rem 0.875rem",
      fontFamily: C.mono,
      fontSize: "0.6875rem",
      textAlign: right ? "right" : "left",
      whiteSpace: "nowrap",
      borderBottom: `1px solid ${C.border}`,
      verticalAlign: "middle",
      ...style,
    }}>
      {children}
    </td>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "0.2rem",
      padding: "0.1rem 0.5rem",
      backgroundColor: bg,
      color,
      fontFamily: C.mono,
      fontSize: "0.5625rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      lineHeight: 1.6,
    }}>
      {label}
    </span>
  );
}

// ─── Summary stat pill ────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", padding: "0 0.875rem" }}>
      <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: "0.75rem", fontWeight: 700, color: color ?? C.fg, letterSpacing: "0.02em" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: "0.75rem",
      color: C.muted,
      userSelect: "none",
    }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.25 }}>
        <rect x="6" y="10" width="36" height="28" rx="0" stroke={C.primary} strokeWidth="1.5"/>
        <line x1="6" y1="17" x2="42" y2="17" stroke={C.primary} strokeWidth="1"/>
        <line x1="15" y1="10" x2="15" y2="17" stroke={C.primary} strokeWidth="1"/>
        <line x1="24" y1="10" x2="24" y2="17" stroke={C.primary} strokeWidth="1"/>
        <line x1="33" y1="10" x2="33" y2="17" stroke={C.primary} strokeWidth="1"/>
        <circle cx="24" cy="31" r="5" stroke={C.mutedFg} strokeWidth="1.5" opacity="0.5"/>
        <line x1="27.5" y1="34.5" x2="31" y2="38" stroke={C.mutedFg} strokeWidth="1.5" opacity="0.5"/>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: C.mono, fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.mutedFg, marginBottom: "0.25rem" }}>
          No Open Positions
        </div>
        <div style={{ fontFamily: C.sans, fontSize: "0.6875rem", color: C.muted, maxWidth: "220px" }}>
          Executed trades will appear here in real-time.
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div style={{ padding: "1rem 0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          height: "2rem",
          backgroundColor: "#111620",
          borderRadius: "0",
          opacity: 1 - i * 0.2,
          animation: "shimmer 1.5s infinite",
        }} />
      ))}
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────
export function OpenTradesWidget({ symbol }: { symbol: string }) {
  const params = { status: ListTradesStatus.open, limit: 50 };
  const { data: tradesData, isLoading } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 3000 } }
  );

  const trades = tradesData?.trades ?? [];

  // Aggregate stats
  const totalStake     = trades.reduce((s, t) => s + t.stake, 0);
  const totalPnl       = trades.reduce((s, t) => s + (t.currentProfit ?? 0), 0);
  const liveCount      = trades.filter(t => t.mode === "live").length;
  const demoCount      = trades.filter(t => t.mode !== "live").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg }}>

      {/* ── Summary bar ─────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        backgroundColor: C.card,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
        height: "3rem",
        overflowX: "auto",
        overflowY: "hidden",
      }}>
        {/* Left: count + pulse */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0 0.875rem",
          borderRight: `1px solid ${C.border}`,
          height: "100%",
          flexShrink: 0,
        }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            backgroundColor: trades.length > 0 ? C.primary : C.muted,
            boxShadow: trades.length > 0 ? `0 0 6px ${C.primary}` : "none",
            animation: trades.length > 0 ? "pulse 2s infinite" : "none",
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {isLoading ? "···" : trades.length} {trades.length === 1 ? "position" : "positions"}
          </span>
        </div>

        {/* Divider + stats */}
        {trades.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 0 0 0.25rem" }}>
              <div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} />
              <Stat label="Total Stake" value={`$${totalStake.toFixed(2)}`} />
              <div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} />
              <Stat label="Unrealised P&L" value={pnlText(totalPnl)} color={pnlColor(totalPnl)} />
              {liveCount > 0 && (
                <>
                  <div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} />
                  <Stat label="Live" value={String(liveCount)} color={C.red} />
                </>
              )}
              {demoCount > 0 && (
                <>
                  <div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} />
                  <Stat label="Demo" value={String(demoCount)} color={C.mutedFg} />
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", minHeight: 0 }}>
        {isLoading ? (
          <LoadingState />
        ) : trades.length === 0 ? (
          <EmptyState />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Asset</Th>
                <Th>Type</Th>
                <Th>Direction</Th>
                <Th right>Entry</Th>
                <Th right>Stake</Th>
                <Th>Duration</Th>
                <Th right>Unrealised P&L</Th>
                <Th>Opened</Th>
                <Th>Mode</Th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, idx) => {
                const isActive = t.symbol === symbol;
                const dir = directionConfig(t.direction, t.type);
                const dur = durationLabel(t);
                const pnl = t.currentProfit;
                const rowBg = idx % 2 === 0
                  ? (isActive ? "rgba(16,185,129,0.04)" : "transparent")
                  : (isActive ? "rgba(16,185,129,0.06)" : "rgba(15,19,24,0.4)");

                return (
                  <tr
                    key={t.id}
                    style={{ backgroundColor: rowBg, transition: "background-color 0.15s ease" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isActive ? "rgba(16,185,129,0.1)" : "rgba(30,41,59,0.25)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = rowBg)}
                  >
                    {/* ID */}
                    <Td>
                      <Link href={`/trades/${t.id}`} style={{ color: C.primary, fontWeight: 700, textDecoration: "none" }}>
                        #{t.id}
                      </Link>
                    </Td>

                    {/* Asset */}
                    <Td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontWeight: 700, color: isActive ? C.primary : C.fg, fontSize: "0.6875rem" }}>
                          {t.symbol}
                          {isActive && (
                            <span style={{ marginLeft: "0.35rem", fontSize: "0.5rem", color: C.primary, fontWeight: 400 }}>● NOW</span>
                          )}
                        </span>
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.5625rem", color: C.mutedFg, letterSpacing: 0 }}>
                          {t.displayName}
                        </span>
                      </div>
                    </Td>

                    {/* Type */}
                    <Td>
                      <span style={{
                        display: "inline-block",
                        padding: "0.1rem 0.45rem",
                        backgroundColor:
                          t.type === "vanilla_options" ? C.blueBg :
                          t.type === "multiplier" ? C.amberBg :
                          "rgba(148,163,184,0.1)",
                        color:
                          t.type === "vanilla_options" ? C.blue :
                          t.type === "multiplier" ? C.amber :
                          C.mutedFg,
                        fontSize: "0.5625rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}>
                        {typeLabel(t.type)}
                      </span>
                    </Td>

                    {/* Direction */}
                    <Td>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.2rem",
                        padding: "0.1rem 0.5rem",
                        backgroundColor: dir.bg,
                        color: dir.color,
                        fontSize: "0.5625rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}>
                        <i className={`bi ${dir.icon}`} style={{ fontSize: "0.75rem", lineHeight: 1 }} />
                        {dir.label}
                      </span>
                    </Td>

                    {/* Entry Price */}
                    <Td right style={{ color: C.mutedFg }}>
                      {t.entryPrice != null ? t.entryPrice.toFixed(4) : "---"}
                    </Td>

                    {/* Stake */}
                    <Td right style={{ color: C.fg, fontWeight: 600 }}>
                      ${t.stake.toFixed(2)}
                    </Td>

                    {/* Duration */}
                    <Td style={{ color: C.mutedFg }}>
                      {t.type === "multiplier"
                        ? <span style={{ color: C.amber, fontSize: "0.5625rem", fontWeight: 700 }}>Open-ended</span>
                        : dur ?? <span style={{ color: C.muted }}>---</span>
                      }
                    </Td>

                    {/* P&L */}
                    <Td right>
                      <span style={{
                        fontWeight: 700,
                        fontSize: "0.6875rem",
                        color: pnlColor(pnl),
                        letterSpacing: "0.01em",
                      }}>
                        {pnlText(pnl)}
                      </span>
                    </Td>

                    {/* Opened */}
                    <Td style={{ color: C.mutedFg }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span>{t.openedAt ? format(new Date(t.openedAt), "HH:mm:ss") : "---"}</span>
                        <span style={{ fontSize: "0.5rem", color: C.muted }}>
                          {t.openedAt ? formatDistanceToNowStrict(new Date(t.openedAt), { addSuffix: true }) : ""}
                        </span>
                      </div>
                    </Td>

                    {/* Mode */}
                    <Td>
                      <Badge
                        label={t.mode ?? "demo"}
                        color={t.mode === "live" ? C.red : C.mutedFg}
                        bg={t.mode === "live" ? C.redBg : "rgba(30,41,59,0.4)"}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Legacy sidebar panel (kept for backward compat) ─────────────────────────
export function ChartOpenTradesPanel({ symbol, isExpanded, onToggle }: { symbol: string; isExpanded: boolean; onToggle: () => void }) {
  const params = { status: ListTradesStatus.open, symbol, limit: 10 };
  const { data: tradesData } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 3000 } }
  );
  const trades = tradesData?.trades ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg, border: 0 }}>
      <div style={{
        height: "2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 0.75rem",
        borderBottom: `1px solid ${C.border}`,
        backgroundColor: C.card,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.mutedFg }}>
          Open Trades · {symbol} {trades.length > 0 && `(${trades.length})`}
        </span>
        <button onClick={onToggle} style={{ background: "none", border: "none", color: C.mutedFg, cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}>
          <i className={`bi ${isExpanded ? "bi-chevron-up" : "bi-chevron-down"}`} style={{ fontSize: "0.65rem" }} />
        </button>
      </div>
      {isExpanded && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {trades.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", fontFamily: C.mono, fontSize: "0.5625rem", color: C.muted, textTransform: "uppercase" }}>
              No open trades
            </div>
          ) : (
            trades.map((t) => {
              const dir = directionConfig(t.direction, t.type);
              const pnl = t.currentProfit;
              return (
                <div key={t.id} style={{ padding: "0.5rem 0.75rem", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, color: C.fg }}>#{t.id} · {t.symbol}</span>
                    <span style={{ fontFamily: C.mono, fontSize: "0.5rem", color: dir.color, textTransform: "uppercase" }}>{dir.label} · ${t.stake.toFixed(2)}</span>
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: "0.625rem", fontWeight: 700, color: pnlColor(pnl) }}>{pnlText(pnl)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
