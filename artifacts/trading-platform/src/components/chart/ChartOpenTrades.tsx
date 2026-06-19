import { useState, useEffect, useRef, useCallback } from "react";
import { useListTrades, ListTradesStatus, ListTradesType, getListTradesQueryKey, useCloseTrade } from "@workspace/api-client-react";
import type { Trade } from "@workspace/api-client-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { getSymbolDisplayName } from "@/lib/utils";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0d11", card: "#0f1318", border: "#1a2332",
  muted: "#475569", mutedFg: "#64748b", fg: "#e2e8f0",
  primary: "#10b981", primaryBg: "rgba(16,185,129,0.12)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.12)",
  blue: "#3b82f6", blueBg: "rgba(59,130,246,0.10)",
  amber: "#f59e0b", amberBg: "rgba(245,158,11,0.10)",
  mono: "'Space Mono','Menlo','Courier New',monospace",
  sans: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function typeLabel(type: string) {
  return type === "vanilla_options" ? "Options" : type === "multiplier" ? "Multiplier" : "Forex";
}
function directionConfig(direction: string, type: string) {
  const isUp = direction === "call" || direction === "buy";
  return {
    label: type === "multiplier" ? (isUp ? "Buy" : "Sell") : (isUp ? "Call" : "Put"),
    color: isUp ? C.primary : C.red,
    bg: isUp ? C.primaryBg : C.redBg,
    icon: isUp ? "bi-arrow-up-short" : "bi-arrow-down-short",
  };
}
function durationSeconds(t: Trade): number | null {
  if (!t.duration || !t.durationUnit) return null;
  const mul: Record<string, number> = { t: 1, s: 1, m: 60, h: 3600, d: 86400 };
  return t.duration * (mul[t.durationUnit] ?? 1);
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
  return `${val >= 0 ? "+" : ""}$${Math.abs(val).toFixed(2)}`;
}

// ─── Countdown Seeker ─────────────────────────────────────────────────────────
function CountdownSeeker({ trade }: { trade: Trade }) {
  const totalSec = durationSeconds(trade);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!totalSec || !trade.openedAt) return;
    const start = new Date(trade.openedAt).getTime();
    const tick = () => {
      const now = Date.now();
      setElapsed(Math.min((now - start) / 1000, totalSec));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [totalSec, trade.openedAt]);

  if (!totalSec || trade.type === "multiplier") {
    return (
      <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", color: C.amber, fontWeight: 700 }}>
        Open-ended
      </span>
    );
  }

  const pct = Math.min(elapsed / totalSec, 1);
  const remaining = Math.max(totalSec - elapsed, 0);
  const isUrgent = pct >= 0.70; // last 30%
  const barColor = isUrgent ? C.red : C.primary;
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60);
  const timeStr = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "80px" }}>
      <div style={{
        height: "3px", backgroundColor: "#1a2332", borderRadius: "0", overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${pct * 100}%`,
          backgroundColor: barColor,
          transition: "width 1s linear, background-color 0.4s ease",
          boxShadow: isUrgent ? `0 0 6px ${C.red}` : `0 0 4px ${C.primary}`,
        }} />
      </div>
      <span style={{
        fontFamily: C.mono, fontSize: "0.5rem", fontWeight: 700,
        color: isUrgent ? C.red : C.primary,
        letterSpacing: "0.04em",
        animation: isUrgent ? "pulse 1s infinite" : "none",
      }}>
        {pct >= 1 ? "EXPIRED" : timeStr}
      </span>
    </div>
  );
}

// ─── Close Trade Button ───────────────────────────────────────────────────────
function CloseTradeButton({ trade, onClosed }: { trade: Trade; onClosed: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const closeTrade = useCloseTrade();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFirstClick = () => {
    setConfirm(true);
    timerRef.current = setTimeout(() => setConfirm(false), 3000);
  };

  const handleConfirm = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    closeTrade.mutate({ id: trade.id }, { onSuccess: onClosed, onSettled: () => setConfirm(false) });
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const isLoading = closeTrade.isPending;

  if (confirm) {
    return (
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          style={{
            padding: "0.15rem 0.5rem", fontFamily: C.mono, fontSize: "0.5rem",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
            backgroundColor: C.redBg, color: C.red,
            border: `1px solid ${C.red}`, cursor: "pointer",
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          {isLoading ? "···" : "Confirm"}
        </button>
        <button
          onClick={() => { setConfirm(false); if (timerRef.current) clearTimeout(timerRef.current); }}
          style={{
            padding: "0.15rem 0.4rem", fontFamily: C.mono, fontSize: "0.5rem",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
            backgroundColor: "transparent", color: C.mutedFg,
            border: `1px solid ${C.border}`, cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleFirstClick}
      style={{
        padding: "0.2rem 0.6rem", fontFamily: C.mono, fontSize: "0.5rem",
        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
        backgroundColor: "transparent", color: C.mutedFg,
        border: `1px solid ${C.border}`, cursor: "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = C.red;
        e.currentTarget.style.borderColor = C.red;
        e.currentTarget.style.backgroundColor = C.redBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = C.mutedFg;
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      Close
    </button>
  );
}

// ─── Shared Table primitives ──────────────────────────────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "0.5rem 0.875rem", fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.08em", color: C.mutedFg,
      textAlign: right ? "right" : "left", whiteSpace: "nowrap",
      borderBottom: `1px solid ${C.border}`, backgroundColor: "#0d1117",
      position: "sticky" as const, top: 0, zIndex: 5,
    }}>
      {children}
    </th>
  );
}
function Td({ children, right, style }: { children: React.ReactNode; right?: boolean; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: "0.5rem 0.875rem", fontFamily: C.mono, fontSize: "0.6875rem",
      textAlign: right ? "right" : "left", whiteSpace: "nowrap",
      borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", ...style,
    }}>
      {children}
    </td>
  );
}
function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.2rem",
      padding: "0.1rem 0.5rem", backgroundColor: bg, color,
      fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.6,
    }}>
      {label}
    </span>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", padding: "0 0.875rem" }}>
      <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: "0.75rem", fontWeight: 700, color: color ?? C.fg }}>{value}</span>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ message = "No open positions", sub = "Executed trades will appear here in real-time." }: { message?: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.75rem", userSelect: "none" }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.2 }}>
        <rect x="6" y="10" width="36" height="28" stroke={C.primary} strokeWidth="1.5" />
        <line x1="6" y1="17" x2="42" y2="17" stroke={C.primary} strokeWidth="1" />
        <line x1="15" y1="10" x2="15" y2="17" stroke={C.primary} strokeWidth="1" />
        <line x1="24" y1="10" x2="24" y2="17" stroke={C.primary} strokeWidth="1" />
        <line x1="33" y1="10" x2="33" y2="17" stroke={C.primary} strokeWidth="1" />
        <circle cx="24" cy="31" r="5" stroke={C.mutedFg} strokeWidth="1.5" opacity="0.5" />
        <line x1="27.5" y1="34.5" x2="31" y2="38" stroke={C.mutedFg} strokeWidth="1.5" opacity="0.5" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: C.mono, fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.mutedFg, marginBottom: "0.25rem" }}>{message}</div>
        <div style={{ fontFamily: C.sans, fontSize: "0.6875rem", color: C.muted, maxWidth: "220px" }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Open Positions Widget ────────────────────────────────────────────────────
export function OpenTradesWidget({ symbol }: { symbol: string }) {
  const queryClient = useQueryClient();
  const params = { status: ListTradesStatus.open, limit: 50 };
  const { data: tradesData, isLoading } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 3000 } }
  );
  const trades = tradesData?.trades ?? [];
  const totalStake = trades.reduce((s, t) => s + t.stake, 0);
  const totalPnl = trades.reduce((s, t) => s + (t.currentProfit ?? 0), 0);
  const liveCount = trades.filter(t => t.mode === "live").length;
  const demoCount = trades.filter(t => t.mode !== "live").length;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTradesQueryKey(params) });
  }, [queryClient]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg }}>
      {/* Summary bar */}
      <div style={{ display: "flex", alignItems: "center", backgroundColor: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0, height: "3rem", overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 0.875rem", borderRight: `1px solid ${C.border}`, height: "100%", flexShrink: 0 }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: trades.length > 0 ? C.primary : C.muted, boxShadow: trades.length > 0 ? `0 0 6px ${C.primary}` : "none", animation: trades.length > 0 ? "pulse 2s infinite" : "none", flexShrink: 0 }} />
          <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {isLoading ? "···" : trades.length} {trades.length === 1 ? "position" : "positions"}
          </span>
        </div>
        {trades.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 0.25rem" }}>
            <div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} />
            <Stat label="Total Stake" value={`$${totalStake.toFixed(2)}`} />
            <div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} />
            <Stat label="Unrealised P&L" value={pnlText(totalPnl)} color={pnlColor(totalPnl)} />
            {liveCount > 0 && <><div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} /><Stat label="Live" value={String(liveCount)} color={C.red} /></>}
            {demoCount > 0 && <><div style={{ borderRight: `1px solid ${C.border}`, height: "60%", margin: "0 0.25rem" }} /><Stat label="Demo" value={String(demoCount)} color={C.mutedFg} /></>}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", minHeight: 0 }}>
        {isLoading ? (
          <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: "2rem", backgroundColor: "#111620", opacity: 1 - i * 0.25, animation: "shimmer 1.5s infinite" }} />)}
          </div>
        ) : trades.length === 0 ? (
          <EmptyState />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Asset</Th>
                <Th>Type</Th>
                <Th>Direction</Th>
                <Th right>Entry</Th>
                <Th right>Stake</Th>
                <Th>Time Left</Th>
                <Th right>Unrealised P&L</Th>
                <Th>Opened</Th>
                <Th>Mode</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, idx) => {
                const isActive = t.symbol === symbol;
                const dir = directionConfig(t.direction, t.type);
                const pnl = t.currentProfit;
                const rowBg = idx % 2 === 0
                  ? (isActive ? "rgba(16,185,129,0.04)" : "transparent")
                  : (isActive ? "rgba(16,185,129,0.06)" : "rgba(15,19,24,0.4)");
                return (
                  <tr key={t.id}
                    style={{ backgroundColor: rowBg, transition: "background-color 0.15s ease" }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = isActive ? "rgba(16,185,129,0.1)" : "rgba(30,41,59,0.25)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = rowBg}
                  >
                    <Td>
                      <Link href={`/trades/${t.id}`} style={{ color: C.primary, fontWeight: 700, textDecoration: "none" }}>#{t.id}</Link>
                    </Td>
                    <Td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontWeight: 700, color: isActive ? C.primary : C.fg, fontSize: "0.6875rem" }}>
                          {getSymbolDisplayName(t.symbol)}{isActive && <span style={{ marginLeft: "0.35rem", fontSize: "0.5rem", color: C.primary, fontWeight: 400 }}>● NOW</span>}
                        </span>
                        <span style={{ fontFamily: C.sans, fontSize: "0.5625rem", color: C.mutedFg }}>{t.displayName}</span>
                      </div>
                    </Td>
                    <Td>
                      <span style={{
                        display: "inline-block", padding: "0.1rem 0.45rem",
                        backgroundColor: t.type === "vanilla_options" ? C.blueBg : t.type === "multiplier" ? C.amberBg : "rgba(148,163,184,0.1)",
                        color: t.type === "vanilla_options" ? C.blue : t.type === "multiplier" ? C.amber : C.mutedFg,
                        fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      }}>
                        {typeLabel(t.type)}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "0.1rem 0.5rem", backgroundColor: dir.bg, color: dir.color, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <i className={`bi ${dir.icon}`} style={{ fontSize: "0.75rem", lineHeight: 1 }} />
                        {dir.label}
                      </span>
                    </Td>
                    <Td right style={{ color: C.mutedFg }}>{t.entryPrice != null ? t.entryPrice.toFixed(4) : "---"}</Td>
                    <Td right style={{ color: C.fg, fontWeight: 600 }}>${t.stake.toFixed(2)}</Td>
                    {/* Countdown seeker */}
                    <Td><CountdownSeeker trade={t} /></Td>
                    <Td right>
                      <span style={{ fontWeight: 700, fontSize: "0.6875rem", color: pnlColor(pnl) }}>{pnlText(pnl)}</span>
                    </Td>
                    <Td style={{ color: C.mutedFg }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span>{t.openedAt ? format(new Date(t.openedAt), "HH:mm:ss") : "---"}</span>
                        <span style={{ fontSize: "0.5rem", color: C.muted }}>{t.openedAt ? formatDistanceToNowStrict(new Date(t.openedAt), { addSuffix: true }) : ""}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge label={t.mode ?? "demo"} color={t.mode === "live" ? C.red : C.mutedFg} bg={t.mode === "live" ? C.redBg : "rgba(30,41,59,0.4)"} />
                    </Td>
                    <Td>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <Link href={`/trades/${t.id}`}>
                          <button style={{ padding: "0.2rem 0.6rem", fontFamily: C.mono, fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", backgroundColor: "transparent", color: C.mutedFg, border: `1px solid ${C.border}`, cursor: "pointer", whiteSpace: "nowrap" }}
                            onMouseEnter={e => { e.currentTarget.style.color = C.primary; e.currentTarget.style.borderColor = C.primary; }}
                            onMouseLeave={e => { e.currentTarget.style.color = C.mutedFg; e.currentTarget.style.borderColor = C.border; }}
                          >View</button>
                        </Link>
                        {/* Close button for all trades */}
                        <CloseTradeButton trade={t} onClosed={invalidate} />
                      </div>
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

// ─── Order History Widget ─────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: ListTradesType.vanilla_options, label: "Options" },
  { value: ListTradesType.multiplier, label: "Multiplier" },
  { value: ListTradesType.forex, label: "Forex" },
];
const STATUS_OPTIONS = [
  { value: ListTradesStatus.closed, label: "Closed" },
  { value: ListTradesStatus.cancelled, label: "Cancelled" },
];

export function OrderHistoryWidget() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState(ListTradesStatus.closed);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterType, filterStatus]);

  const params = {
    status: filterStatus,
    ...(filterType ? { type: filterType as any } : {}),
    ...(search ? { symbol: search.toUpperCase() } : {}),
    page,
    limit: LIMIT,
  };
  const { data, isLoading, isFetching } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), staleTime: 10_000 } }
  );

  const trades = data?.trades ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#111620", border: `1px solid ${C.border}`, color: C.fg,
    fontFamily: C.mono, fontSize: "0.625rem", padding: "0.35rem 0.6rem",
    outline: "none", height: "2rem",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", minWidth: "110px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg }}>
      {/* Filter / Search bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap",
        padding: "0.5rem 0.875rem", backgroundColor: C.card,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <i className="bi bi-search" style={{ position: "absolute", left: "0.5rem", fontSize: "0.6rem", color: C.mutedFg, pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Symbol (e.g. R_100)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: "1.6rem", width: "160px" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: "0.4rem", background: "none", border: "none", color: C.mutedFg, cursor: "pointer", fontSize: "0.6rem" }}>✕</button>
          )}
        </div>

        {/* Type filter */}
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Status filter */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} style={selectStyle}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Counts */}
        <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", color: C.mutedFg, marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.375rem" }}>
          {isFetching && <span style={{ color: C.primary, animation: "pulse 1s infinite" }}>●</span>}
          {total} {total === 1 ? "record" : "records"}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", minHeight: 0 }}>
        {isLoading ? (
          <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[1, 2, 3, 4].map(i => <div key={i} style={{ height: "2rem", backgroundColor: "#111620", opacity: 1 - i * 0.2, animation: "shimmer 1.5s infinite" }} />)}
          </div>
        ) : trades.length === 0 ? (
          <EmptyState message="No records found" sub="Adjust your filters or execute some trades first." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Asset</Th>
                <Th>Type</Th>
                <Th>Direction</Th>
                <Th right>Stake</Th>
                <Th right>Entry</Th>
                <Th right>Exit</Th>
                <Th right>P&L</Th>
                <Th>Duration</Th>
                <Th>Status</Th>
                <Th>Mode</Th>
                <Th>Closed</Th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, idx) => {
                const dir = directionConfig(t.direction, t.type);
                const pnl = t.currentProfit;
                const rowBg = idx % 2 === 0 ? "transparent" : "rgba(15,19,24,0.4)";
                const statusColor = t.status === "cancelled" ? C.amber : t.status === "closed" ? C.mutedFg : C.primary;
                return (
                  <tr key={t.id}
                    style={{ backgroundColor: rowBg }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(30,41,59,0.25)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = rowBg}
                  >
                    <Td>
                      <Link href={`/trades/${t.id}`} style={{ color: C.primary, fontWeight: 700, textDecoration: "none" }}>#{t.id}</Link>
                    </Td>
                    <Td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontWeight: 700, color: C.fg }}>{getSymbolDisplayName(t.symbol)}</span>
                        <span style={{ fontFamily: C.sans, fontSize: "0.5625rem", color: C.mutedFg }}>{t.displayName}</span>
                      </div>
                    </Td>
                    <Td>
                      <span style={{
                        display: "inline-block", padding: "0.1rem 0.45rem",
                        backgroundColor: t.type === "vanilla_options" ? C.blueBg : t.type === "multiplier" ? C.amberBg : "rgba(148,163,184,0.1)",
                        color: t.type === "vanilla_options" ? C.blue : t.type === "multiplier" ? C.amber : C.mutedFg,
                        fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase",
                      }}>
                        {typeLabel(t.type)}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", padding: "0.1rem 0.5rem", backgroundColor: dir.bg, color: dir.color, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase" }}>
                        <i className={`bi ${dir.icon}`} style={{ fontSize: "0.75rem", lineHeight: 1 }} />
                        {dir.label}
                      </span>
                    </Td>
                    <Td right style={{ fontWeight: 600, color: C.fg }}>${t.stake.toFixed(2)}</Td>
                    <Td right style={{ color: C.mutedFg }}>{t.entryPrice != null ? t.entryPrice.toFixed(4) : "---"}</Td>
                    <Td right style={{ color: C.mutedFg }}>{t.exitPrice != null ? t.exitPrice.toFixed(4) : "---"}</Td>
                    <Td right>
                      <span style={{ fontWeight: 700, color: pnlColor(pnl) }}>{pnlText(pnl)}</span>
                    </Td>
                    <Td style={{ color: C.mutedFg }}>{durationLabel(t) ?? "---"}</Td>
                    <Td>
                      <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", color: statusColor }}>
                        {t.status}
                      </span>
                    </Td>
                    <Td>
                      <Badge label={t.mode ?? "demo"} color={t.mode === "live" ? C.red : C.mutedFg} bg={t.mode === "live" ? C.redBg : "rgba(30,41,59,0.4)"} />
                    </Td>
                    <Td style={{ color: C.mutedFg }}>
                      {t.closedAt ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                          <span>{format(new Date(t.closedAt), "MMM d, HH:mm")}</span>
                          <span style={{ fontSize: "0.5rem", color: C.muted }}>{formatDistanceToNowStrict(new Date(t.closedAt), { addSuffix: true })}</span>
                        </div>
                      ) : "---"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.5rem", borderTop: `1px solid ${C.border}`, backgroundColor: C.card, flexShrink: 0 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "0.25rem 0.75rem", fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", backgroundColor: "transparent", color: page === 1 ? C.muted : C.mutedFg, border: `1px solid ${C.border}`, cursor: page === 1 ? "not-allowed" : "pointer" }}
          >
            ← Prev
          </button>
          <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", color: C.mutedFg }}>
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: "0.25rem 0.75rem", fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", backgroundColor: "transparent", color: page === totalPages ? C.muted : C.mutedFg, border: `1px solid ${C.border}`, cursor: page === totalPages ? "not-allowed" : "pointer" }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Legacy sidebar panel ─────────────────────────────────────────────────────
export function ChartOpenTradesPanel({ symbol, isExpanded, onToggle }: { symbol: string; isExpanded: boolean; onToggle: () => void }) {
  const params = { status: ListTradesStatus.open, symbol, limit: 10 };
  const { data: tradesData } = useListTrades(params, { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 3000 } });
  const trades = tradesData?.trades ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg }}>
      <div style={{ height: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.75rem", borderBottom: `1px solid ${C.border}`, backgroundColor: C.card, flexShrink: 0 }}>
        <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.mutedFg }}>
          Open Trades · {getSymbolDisplayName(symbol)} {trades.length > 0 && `(${trades.length})`}
        </span>
        <button onClick={onToggle} style={{ background: "none", border: "none", color: C.mutedFg, cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}>
          <i className={`bi ${isExpanded ? "bi-chevron-up" : "bi-chevron-down"}`} style={{ fontSize: "0.65rem" }} />
        </button>
      </div>
      {isExpanded && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {trades.length === 0
            ? <div style={{ padding: "1rem", textAlign: "center", fontFamily: C.mono, fontSize: "0.5625rem", color: C.muted, textTransform: "uppercase" }}>No open trades</div>
            : trades.map(t => {
              const dir = directionConfig(t.direction, t.type);
              return (
                <div key={t.id} style={{ padding: "0.5rem 0.75rem", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "0.5625rem", fontWeight: 700, color: C.fg }}>#{t.id} · {getSymbolDisplayName(t.symbol)}</span>
                    <span style={{ fontFamily: C.mono, fontSize: "0.5rem", color: dir.color, textTransform: "uppercase" }}>{dir.label} · ${t.stake.toFixed(2)}</span>
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: "0.625rem", fontWeight: 700, color: pnlColor(t.currentProfit) }}>{pnlText(t.currentProfit)}</span>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}
