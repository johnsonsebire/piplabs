import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListTrades, useGetTradeStats, ListTradesStatus, ListTradesType } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function TradesPage() {
  const [status, setStatus] = useState<ListTradesStatus | "all">("all");
  const [type, setType] = useState<ListTradesType | "all">("all");
  
  const { data: tradesData, isLoading } = useListTrades({
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    limit: 50
  });

  const { data: stats } = useGetTradeStats({});

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        {/* Stats Bar */}
        <div className="h-16 border-b border-border bg-card shrink-0 flex items-center px-6 gap-8 overflow-x-auto hide-scrollbar">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Total Trades</span>
            <span className="font-mono font-bold text-foreground">{stats?.totalTrades || 0}</span>
          </div>
          <div className="w-px h-8 bg-border"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Win Rate</span>
            <span className="font-mono font-bold text-primary">{(stats?.winRate || 0).toFixed(1)}%</span>
          </div>
          <div className="w-px h-8 bg-border"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Total P&L</span>
            <span className={`font-mono font-bold ${(stats?.totalPnl || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {(stats?.totalPnl || 0) >= 0 ? '+' : ''}{(stats?.totalPnl || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="h-14 border-b border-border bg-background shrink-0 flex items-center px-6 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-muted-foreground">Status:</span>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-[140px] h-8 rounded-none border-border bg-card font-mono text-xs" data-testid="filter-status">
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
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono text-muted-foreground">Type:</span>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger className="w-[160px] h-8 rounded-none border-border bg-card font-mono text-xs" data-testid="filter-type">
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

        {/* Table */}
        <div className="flex-1 overflow-auto bg-background p-6">
          <div className="border border-border">
            <table className="w-full text-sm font-mono text-left whitespace-nowrap">
              <thead className="bg-card sticky top-0 z-10 border-b border-border shadow-[0_1px_0_0_var(--border)]">
                <tr>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">ID</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Date</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Asset</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Type</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Dir</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">Stake</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs text-right">P&L</th>
                  <th className="p-3 font-normal text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array(10).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-3"><Skeleton className="h-5 w-full rounded-none bg-muted" /></td>
                    </tr>
                  ))
                ) : tradesData?.trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground uppercase tracking-wider">No trades found</td>
                  </tr>
                ) : (
                  tradesData?.trades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-muted/10 transition-colors cursor-pointer group">
                      <td className="p-3">
                        <Link href={`/trades/${trade.id}`} className="text-primary hover:underline" data-testid={`link-trade-${trade.id}`}>
                          #{trade.id}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{format(new Date(trade.openedAt), "yyyy-MM-dd HH:mm:ss")}</td>
                      <td className="p-3 text-foreground font-bold">{trade.displayName}</td>
                      <td className="p-3 text-muted-foreground">{trade.type}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs ${trade.direction === 'buy' || trade.direction === 'call' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                          {trade.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-right">{trade.stake.toFixed(2)}</td>
                      <td className={`p-3 text-right ${trade.currentProfit && trade.currentProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {trade.currentProfit ? (trade.currentProfit >= 0 ? '+' : '') + trade.currentProfit.toFixed(2) : '-'}
                      </td>
                      <td className="p-3">
                        <span className="text-muted-foreground uppercase text-xs">{trade.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}