import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListStrategies, useRunBacktest, useListBacktests, getListBacktestsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function BacktestPage() {
  const { data: strategies } = useListStrategies({});
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  
  const backtestParams = { strategyId: selectedStrategy ? parseInt(selectedStrategy) : undefined };
  const { data: backtests, isLoading: isResultsLoading } = useListBacktests(
    backtestParams,
    { query: { enabled: true, queryKey: getListBacktestsQueryKey(backtestParams) } }
  );

  const runBacktest = useRunBacktest();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    symbol: "R_100",
    fromDate: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    initialBalance: "10000"
  });

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStrategy) {
      toast({ variant: "destructive", title: "Select a strategy first" });
      return;
    }
    
    runBacktest.mutate({
      data: {
        strategyId: parseInt(selectedStrategy),
        symbol: formData.symbol,
        fromDate: formData.fromDate,
        toDate: formData.toDate,
        initialBalance: parseFloat(formData.initialBalance)
      }
    }, {
      onSuccess: () => {
        toast({ title: "Backtest initiated" });
        queryClient.invalidateQueries({ queryKey: ["/api/backtests"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        {/* Config Panel */}
        <div className="w-full md:w-80 border-r border-border bg-card shrink-0 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-border shrink-0">
            <h1 className="text-xl font-bold font-mono uppercase tracking-tight text-foreground">Simulation</h1>
            <p className="text-xs text-muted-foreground font-mono mt-1">Configure historical test run</p>
          </div>
          
          <form onSubmit={handleRun} className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Strategy Algorithm</Label>
              <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-full h-10 rounded-none border-border bg-background font-mono text-sm text-primary">
                  <SelectValue placeholder="Select Strategy" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border">
                  {strategies?.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()} className="font-mono text-xs uppercase">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Asset Symbol</Label>
              <Input 
                required 
                value={formData.symbol} 
                onChange={e => setFormData({...formData, symbol: e.target.value})}
                className="rounded-none font-mono border-border bg-background uppercase font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">From Date</Label>
                <Input 
                  type="date"
                  required 
                  value={formData.fromDate} 
                  onChange={e => setFormData({...formData, fromDate: e.target.value})}
                  className="rounded-none font-mono border-border bg-background text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-mono text-muted-foreground">To Date</Label>
                <Input 
                  type="date"
                  required 
                  value={formData.toDate} 
                  onChange={e => setFormData({...formData, toDate: e.target.value})}
                  className="rounded-none font-mono border-border bg-background text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Initial Balance (USD)</Label>
              <Input 
                type="number"
                required 
                value={formData.initialBalance} 
                onChange={e => setFormData({...formData, initialBalance: e.target.value})}
                className="rounded-none font-mono border-border bg-background"
              />
            </div>

            <div className="pt-4 border-t border-border">
              <Button type="submit" disabled={runBacktest.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-12 text-sm bg-primary text-primary-foreground hover:bg-primary/90">
                {runBacktest.isPending ? "Simulating..." : "Execute Backtest"}
              </Button>
            </div>
          </form>
        </div>

        {/* Results Panel */}
        <div className="flex-1 bg-background flex flex-col min-w-0">
          <div className="p-4 border-b border-border bg-muted/20 shrink-0">
            <h2 className="text-sm font-bold font-mono uppercase text-foreground">Simulation Results</h2>
          </div>
          
          <div className="flex-1 overflow-auto p-6">
            {isResultsLoading ? (
              <div className="text-center text-muted-foreground font-mono uppercase mt-10">Loading results...</div>
            ) : backtests?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-mono uppercase">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-50">
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
                </svg>
                No backtests run yet
              </div>
            ) : (
              <div className="space-y-6">
                {backtests?.map(bt => (
                  <div key={bt.id} className="border border-border bg-card">
                    <div className="flex items-center justify-between p-4 border-b border-border bg-muted/10">
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-lg font-mono text-primary uppercase">Run #{bt.id}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${bt.status === 'completed' ? 'bg-primary/20 text-primary' : bt.status === 'failed' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-500'}`}>
                          {bt.status}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{bt.symbol} | {bt.fromDate} to {bt.toDate}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border md:divide-y-0">
                      <div className="p-4 flex flex-col">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Win Rate</span>
                        <span className="text-xl font-bold font-mono text-foreground">{bt.winRate ? `${bt.winRate.toFixed(1)}%` : '---'}</span>
                      </div>
                      <div className="p-4 flex flex-col">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Net P&L</span>
                        <span className={`text-xl font-bold font-mono ${bt.totalPnl && bt.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {bt.totalPnl ? `${bt.totalPnl >= 0 ? '+' : ''}$${bt.totalPnl.toFixed(2)}` : '---'}
                        </span>
                      </div>
                      <div className="p-4 flex flex-col">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Total Trades</span>
                        <span className="text-xl font-bold font-mono text-foreground">{bt.totalTrades ?? '---'}</span>
                      </div>
                      <div className="p-4 flex flex-col">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Max Drawdown</span>
                        <span className="text-xl font-bold font-mono text-destructive">{bt.maxDrawdown ? `${bt.maxDrawdown.toFixed(1)}%` : '---'}</span>
                      </div>
                    </div>
                    
                    {bt.errorMessage && (
                      <div className="p-4 bg-destructive/10 border-t border-border text-destructive font-mono text-xs">
                        Error: {bt.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}