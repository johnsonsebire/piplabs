import { useState } from "react";
import { useListTrades, ListTradesStatus, useGetTradeStats, getListTradesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Link } from "wouter";

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
