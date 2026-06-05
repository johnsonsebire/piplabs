import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListTrades, useGetTradeStats, ListTradesStatus, ListTradesType, getListTradesQueryKey, getGetTradeStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format, differenceInSeconds } from "date-fns";

function calculateTimeRemaining(openedAt: string, duration?: number | null, unit?: string | null): string | null {
  if (!duration || !unit || unit === 't') return null; // Can't accurately predict ticks on frontend
  
  const start = new Date(openedAt);
  let durationSeconds = 0;
  if (unit === 's') durationSeconds = duration;
  if (unit === 'm') durationSeconds = duration * 60;
  if (unit === 'h') durationSeconds = duration * 3600;
  if (unit === 'd') durationSeconds = duration * 86400;

  const end = new Date(start.getTime() + durationSeconds * 1000);
  const now = new Date();
  
  const diffSec = differenceInSeconds(end, now);
  if (diffSec <= 0) return "Closing...";

  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m > 60) {
    const h = Math.floor(m / 60);
    const hm = m % 60;
    return `${h}h ${hm}m`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimeRemainingCell({ trade }: { trade: any }) {
  const [timeLeft, setTimeLeft] = useState<string | null>(() => 
    trade.status === 'open' ? calculateTimeRemaining(trade.openedAt, trade.duration, trade.durationUnit) : null
  );

  useEffect(() => {
    if (trade.status !== 'open') {
      setTimeLeft(null);
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeRemaining(trade.openedAt, trade.duration, trade.durationUnit));
    }, 1000);
    return () => clearInterval(interval);
  }, [trade.status, trade.openedAt, trade.duration, trade.durationUnit]);

  if (trade.status !== 'open') return <span className="text-muted-foreground">-</span>;
  if (!timeLeft) return <span className="text-muted-foreground">Unknown</span>;

  return (
    <span className={`font-mono ${timeLeft === "Closing..." ? "text-primary animate-pulse" : ""}`}>
      {timeLeft}
    </span>
  );
}

export default function TradesPage() {
  const [status, setStatus] = useState<ListTradesStatus | "all">("all");
  const [type, setType] = useState<ListTradesType | "all">("all");
  
  const params = {
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    limit: 50
  };
  const { data: tradesData, isLoading } = useListTrades(
    params,
    { query: { queryKey: getListTradesQueryKey(params), refetchInterval: 5000 } }
  );

  const { data: stats } = useGetTradeStats({}, { query: { queryKey: getGetTradeStatsQueryKey({}), refetchInterval: 10000 } });

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden max-w-[1400px] mx-auto p-4 gap-4">
        
        {/* Header */}
        <div className="shrink-0 mt-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold font-mono uppercase tracking-tight mb-1">Trade History</h1>
            <p className="text-xs font-mono text-muted-foreground mb-0">
              Review your open and closed trades, including live P&L and time remaining.
            </p>
          </div>
        </div>

        {/* Stats & Filters Bar */}
        <div className="d-flex flex-column flex-lg-row gap-4 flex-shrink-0">
          {/* Stats */}
          <div className="flex-grow-1 d-flex align-items-center border border-border bg-card p-3 gap-4 overflow-auto">
            <div className="d-flex flex-column justify-content-center pe-4 border-end border-border border-opacity-50">
              <div className="text-[10px] text-muted-foreground text-uppercase font-mono tracking-wider mb-1">Total Trades</div>
              <div className="font-mono fw-bold text-foreground fs-5">{stats?.totalTrades || 0}</div>
            </div>
            <div className="d-flex flex-column justify-content-center px-2 pe-4 border-end border-border border-opacity-50">
              <div className="text-[10px] text-muted-foreground text-uppercase font-mono tracking-wider mb-1">Win Rate</div>
              <div className="font-mono fw-bold text-primary fs-5">{(stats?.winRate || 0).toFixed(1)}%</div>
            </div>
            <div className="d-flex flex-column justify-content-center px-2">
              <div className="text-[10px] text-muted-foreground text-uppercase font-mono tracking-wider mb-1">Total P&L</div>
              <div className={`font-mono fw-bold fs-5 ${(stats?.totalPnl || 0) >= 0 ? 'text-primary' : 'text-danger'}`}>
                {(stats?.totalPnl || 0) >= 0 ? '+' : ''}{(stats?.totalPnl || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="d-flex align-items-center border border-border bg-card p-3 gap-4 flex-shrink-0">
            <div className="d-flex align-items-center gap-2">
              <div className="text-xs text-uppercase font-mono text-muted-foreground">Status:</div>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-[120px] h-8 rounded-none border-border bg-background font-mono text-xs" data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border">
                  <SelectItem value="all" className="font-mono text-xs">ALL</SelectItem>
                  <SelectItem value={ListTradesStatus.open} className="font-mono text-xs">OPEN</SelectItem>
                  <SelectItem value={ListTradesStatus.closed} className="font-mono text-xs">CLOSED</SelectItem>
                  <SelectItem value={ListTradesStatus.cancelled} className="font-mono text-xs">CANCELLED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="d-flex align-items-center gap-2">
              <div className="text-xs text-uppercase font-mono text-muted-foreground">Type:</div>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="w-[140px] h-8 rounded-none border-border bg-background font-mono text-xs" data-testid="filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border">
                  <SelectItem value="all" className="font-mono text-xs">ALL</SelectItem>
                  <SelectItem value={ListTradesType.vanilla_options} className="font-mono text-xs">OPTIONS</SelectItem>
                  <SelectItem value={ListTradesType.multiplier} className="font-mono text-xs">MULTIPLIER</SelectItem>
                  <SelectItem value={ListTradesType.forex} className="font-mono text-xs">FOREX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto border border-border bg-card">
          <table className="w-full text-sm font-mono text-left whitespace-nowrap">
            <thead className="bg-muted/10 sticky top-0 z-10 border-b border-border">
              <tr>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">ID</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Date</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Asset</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Type</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-center">Dir</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Stake</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Time Left</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Live P&L</th>
                <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="p-3"><Skeleton className="h-5 w-full rounded-none bg-muted/50" /></td>
                  </tr>
                ))
              ) : !tradesData?.trades || tradesData?.trades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground uppercase tracking-wider">No trades found</td>
                </tr>
              ) : (
                tradesData?.trades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-muted/5 transition-colors cursor-pointer group">
                    <td className="p-3">
                      <Link href={`/trades/${trade.id}`} className="text-primary hover:underline font-bold" data-testid={`link-trade-${trade.id}`}>
                        #{trade.id}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{format(new Date(trade.openedAt), "yyyy-MM-dd HH:mm:ss")}</td>
                    <td className="p-3 text-foreground font-bold">{trade.displayName}</td>
                    <td className="p-3 text-muted-foreground text-xs">{trade.type}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 text-[10px] font-bold tracking-widest ${trade.direction === 'buy' || trade.direction === 'call' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right">${trade.stake.toFixed(2)}</td>
                    <td className="p-3 text-right">
                      <TimeRemainingCell trade={trade} />
                    </td>
                    <td className={`p-3 text-right font-bold ${trade.currentProfit && trade.currentProfit >= 0 ? 'text-primary' : trade.currentProfit && trade.currentProfit < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {trade.currentProfit ? (trade.currentProfit >= 0 ? '+' : '') + trade.currentProfit.toFixed(2) : '-'}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`text-[10px] uppercase font-bold tracking-widest ${trade.status === 'open' ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}>
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}