import { useState } from "react";
import { useListTrades, ListTradesStatus, getListTradesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Link } from "wouter";

// ─── Sidebar inline widget (legacy / used in right sidebar) ───────────────────
export function ChartOpenTradesPanel({ symbol, isExpanded, onToggle }: { symbol: string, isExpanded: boolean, onToggle: () => void }) {
  const params = { status: ListTradesStatus.open, symbol, limit: 10 };
  const { data: tradesData } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 3000 } }
  );

  return (
    <div className="flex flex-col h-full bg-background border-0 border-border">
      <div className="h-8 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
        <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
          Open Trades: {symbol}
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onToggle}>
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </Button>
      </div>
      
      {isExpanded && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
            <thead className="bg-muted/10 sticky top-0 border-b border-border z-10">
              <tr>
                <th className="p-2 font-normal text-muted-foreground uppercase">ID</th>
                <th className="p-2 font-normal text-muted-foreground uppercase">Type / Dir</th>
                <th className="p-2 font-normal text-muted-foreground uppercase text-right">Stake</th>
                <th className="p-2 font-normal text-muted-foreground uppercase text-right">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!tradesData?.trades || tradesData.trades.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-muted-foreground uppercase">No open trades for {symbol}</td></tr>
              ) : (
                tradesData.trades.map(t => (
                  <tr key={t.id} className="hover:bg-muted/5">
                    <td className="p-2">
                      <Link href={`/trades/${t.id}`} className="text-primary hover:underline">#{t.id}</Link>
                    </td>
                    <td className="p-2 uppercase">
                      {t.type} / <span className={t.direction === 'buy' || t.direction === 'call' ? 'text-primary' : 'text-destructive'}>{t.direction}</span>
                    </td>
                    <td className="p-2 text-right">${t.stake.toFixed(2)}</td>
                    <td className={`p-2 text-right font-bold ${t.currentProfit && t.currentProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {t.currentProfit !== null && t.currentProfit !== undefined ? 
                        `${t.currentProfit >= 0 ? '+' : ''}${t.currentProfit.toFixed(2)}` : '---'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Full-width widget for bottom panel ───────────────────────────────────────
export function OpenTradesWidget({ symbol }: { symbol: string }) {
  const params = { status: ListTradesStatus.open, limit: 50 };
  const { data: tradesData, isLoading } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 3000 } }
  );

  const trades = tradesData?.trades ?? [];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sub-header */}
      <div
        className="flex items-center justify-between px-4 shrink-0 border-b border-border"
        style={{ height: "2rem" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Open Positions
          {trades.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-primary/20 text-primary rounded-sm text-[9px]">
              {trades.length}
            </span>
          )}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider">
          Filtered: {symbol}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs uppercase tracking-widest animate-pulse">
            Loading trades...
          </div>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <i className="bi bi-inbox text-muted-foreground/30" style={{ fontSize: "2rem" }} />
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
              No open positions
            </span>
          </div>
        ) : (
          <table className="w-full text-[10px] font-mono text-left">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">ID</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">Symbol</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">Type</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">Direction</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider text-right">Stake</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider text-right">P&L</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">Opened</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">Mode</th>
                <th className="px-4 py-2 font-normal text-muted-foreground uppercase text-[9px] tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {trades.map((t) => {
                const isCall = t.direction === "buy" || t.direction === "call";
                const pnlPositive = t.currentProfit != null && t.currentProfit >= 0;
                const isCurrentSymbol = t.symbol === symbol;
                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-muted/10 transition-colors ${isCurrentSymbol ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <Link href={`/trades/${t.id}`} className="text-primary hover:underline font-bold">
                        #{t.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-bold ${isCurrentSymbol ? "text-primary" : "text-foreground"}`}>
                        {t.symbol}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground uppercase">{t.type}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 font-bold uppercase text-[9px] ${
                          isCall
                            ? "bg-primary/15 text-primary"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        <i className={`bi ${isCall ? "bi-arrow-up" : "bi-arrow-down"}`} style={{ fontSize: "0.6rem" }} />
                        {t.direction}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">${t.stake.toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right font-bold tabular-nums ${pnlPositive ? "text-primary" : "text-destructive"}`}>
                      {t.currentProfit != null
                        ? `${t.currentProfit >= 0 ? "+" : ""}${t.currentProfit.toFixed(2)}`
                        : "---"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {t.openedAt ? format(new Date(t.openedAt), "HH:mm:ss") : "---"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-[9px] uppercase font-bold px-1.5 py-0.5 ${
                          t.mode === "live"
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.mode ?? "demo"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/trades/${t.id}`}>
                        <button className="text-[9px] font-mono uppercase text-muted-foreground hover:text-primary transition-colors">
                          View →
                        </button>
                      </Link>
                    </td>
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
